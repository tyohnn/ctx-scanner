#!/usr/bin/env node
// 저장소를 읽어 「무엇이 언제 컨텍스트에 로드되는가」의 맵을 JSON 으로 냅니다. 모델을 호출하지 않고 파일만 읽습니다.
// 쓰는 법: node scan.mjs [--root <저장소>] [--out <map.json>]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { argOf, dataDir } from "./lib-paths.mjs";

const arg = argOf(process.argv.slice(2));
const root = resolve(arg("root", process.cwd()));
const out = resolve(arg("out", join(dataDir(root), "map.json")));

// 요청할 때 로드되는 파일이 잘리는 길이입니다. 컨텍스트 20만 세션이 4만 자이고 100만 세션이 15만 자입니다.
const LIMITS = { onDemand200k: 40000, onDemand1m: 150000, skillListing: 1536 };

const git = (...a) => execFileSync("git", ["-C", root, "-c", "core.quotepath=off", ...a], { maxBuffer: 1 << 30 }).toString();
const files = git("ls-files").split("\n").filter(Boolean);
const fileSet = new Set(files);
const dirs = new Set();
for (const f of files)
{
    const p = f.split("/");
    for (let i = 1; i < p.length; i++) dirs.add(p.slice(0, i).join("/"));
}
const read = (f) => readFileSync(join(root, f), "utf8");
const chars = (t) => [...t].length;
const lines = (t) => t.split("\n").length;

const frontmatter = (t) =>
{
    const m = t.match(/^---\n([\s\S]*?)\n---\n?/);
    if (!m) return { fm: {}, body: t };
    const fm = {};
    let key = null;
    for (const line of m[1].split("\n"))
    {
        const kv = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
        if (kv)
        {
            key = kv[1];
            fm[key] = kv[2].replace(/^["']|["']$/g, "");
            continue;
        }
        const item = line.match(/^\s*-\s*["']?(.+?)["']?\s*$/);
        if (item && key)
        {
            fm[key] = Array.isArray(fm[key]) ? fm[key] : [];
            fm[key].push(item[1]);
        }
        else if (key && typeof fm[key] === "string") fm[key] += " " + line.trim();
    }
    return { fm, body: t.slice(m[0].length) };
};

const globToRe = (g) => "^" + g
    .replace(/[.+^$()|]/g, "\\$&")
    .replace(/\{([^}]+)\}/g, (_, a) => "(" + a.split(",").join("|") + ")")
    .replace(/\*\*\//g, "\u0001")
    .replace(/\*\*/g, "\u0002")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0001/g, "(.*/)?")
    .replace(/\u0002/g, ".*") + "$";

const sections = (t) =>
{
    const res = [];
    let cur = { title: "(머리말)", text: "" };
    for (const line of t.split("\n"))
    {
        const h = line.match(/^##\s+(.+)$/);
        if (h)
        {
            res.push(cur);
            cur = { title: h[1].trim(), text: "" };
        }
        cur.text += line + "\n";
    }
    res.push(cur);
    return res.filter((s) => s.text.trim()).map((s) => ({ title: s.title, chars: chars(s.text), lines: lines(s.text) - 1, text: s.text }));
};

// ── 노드 ─────────────────────────────────────────────────────────────────
// 강제 수준: 1 항상 로드 · 2 조건부 로드 · 3 훅이 강제 · 4 지시문이 참조 · 5 모델이 고름
const nodes = [];
const byId = new Map();
const add = (n) =>
{
    nodes.push(n);
    byId.set(n.id, n);
    return n;
};

const isSkillFile = (f) => /(^|\/)\.claude\/skills\/[^/]+\/SKILL\.md$/.test(f) || /^plugins\/[^/]+\/skills\/[^/]+\/SKILL\.md$/.test(f);
const claudeMds = files.filter((f) => /(^|\/)CLAUDE\.md$/.test(f) && !f.includes(".claude/skills/"));
const ruleFiles = files.filter((f) => /^\.claude\/rules\/.+\.md$/.test(f));
const skillFiles = files.filter((f) => /^\.claude\/skills\/[^/]+\/SKILL\.md$/.test(f));
const agentFiles = files.filter((f) => /^\.claude\/agents\/.+\.md$/.test(f));

for (const f of claudeMds)
{
    const t = read(f);
    const isRoot = f === "CLAUDE.md" || f === ".claude/CLAUDE.md";
    const dir = isRoot ? "" : f.slice(0, -"CLAUDE.md".length);
    add({
        id: f, kind: isRoot ? "root" : "nested", source: isRoot ? "root" : "folder", path: f, title: isRoot ? "루트 CLAUDE.md" : dir.replace(/\/$/, ""),
        chars: chars(t), lines: lines(t), level: isRoot ? 1 : 2, dir,
        sections: sections(t).map(({ text, ...s }) => s),
        when: isRoot
            ? [{ how: "session_start", text: "세션이 시작될 때 전부 로드됩니다. 압축 뒤에도 다시 로드됩니다." }]
            : [
                { how: "nested_traversal", text: `\`${dir}\` 아래 파일을 Read · Edit · Write 로 처음 열 때 로드됩니다. 어느 파일을 열어도 내용 전체가 로드됩니다.` },
                { how: "append", text: "로드될 때는 대화의 뒤에 붙어서, 앞쪽에 이미 캐시된 부분은 그대로 다시 쓰입니다. 압축 뒤에는 그 폴더를 다시 열어야 돌아옵니다." },
            ],
        matchedFiles: isRoot ? files.length : files.filter((x) => x.startsWith(dir)).length,
    });
}

for (const f of ruleFiles)
{
    const t = read(f);
    const { fm } = frontmatter(t);
    const globs = Array.isArray(fm.paths) ? fm.paths : fm.paths ? [fm.paths] : [];
    const res = globs.map(globToRe);
    const scoped = globs.length > 0;
    const perGlob = globs.map((g, i) => ({ glob: g, re: res[i], files: files.filter((x) => new RegExp(res[i]).test(x)).length }));
    add({
        id: f, kind: "rule", source: scoped ? "rule-paths" : "rule-always", path: f, title: basename(f, ".md"), chars: chars(t), lines: lines(t), level: scoped ? 2 : 1,
        globs: perGlob, sections: sections(t).map(({ text, ...s }) => s),
        when: scoped
            ? [
                { how: "path_glob", text: "아래 경로에 맞는 파일을 Read · Edit · Write 로 처음 열 때 로드됩니다. 폴더가 아니라 파일의 경로를 봅니다.", globs },
                { how: "append", text: "로드될 때는 대화의 뒤에 붙어서, 앞쪽에 이미 캐시된 부분은 그대로 다시 쓰입니다." },
            ]
            : [{ how: "session_start", text: "경로 조건이 없어서 루트 CLAUDE.md 와 똑같이 세션이 시작될 때 로드됩니다. 모든 요청의 앞쪽에 들어갑니다." }],
        matchedFiles: scoped ? files.filter((x) => res.some((r) => new RegExp(r).test(x))).length : files.length,
    });
}

for (const f of skillFiles)
{
    const t = read(f);
    const { fm, body } = frontmatter(t);
    const name = fm.name ?? f.split("/").at(-2);
    const desc = String(fm.description ?? "");
    const folder = f.slice(0, -"SKILL.md".length);
    const extra = files.filter((x) => x.startsWith(folder) && x !== f);
    add({
        id: f, kind: "skill", path: f, title: name, name, description: desc,
        listingChars: chars(name) + chars(desc), chars: chars(body), lines: lines(body), level: 5,
        extraFiles: extra.length,
        when: [
            { how: "skill_listing", text: `이름과 설명 ${chars(name) + chars(desc)}자는 세션이 시작될 때 항상 로드됩니다.` },
            { how: "skill_invoke", text: "본문은 모델이 이 스킬을 호출할 때만 로드됩니다. 호출할지는 모델이 정합니다." },
        ],
    });
}

for (const f of agentFiles)
{
    const t = read(f);
    const { fm, body } = frontmatter(t);
    const name = fm.name ?? basename(f, ".md");
    add({
        id: f, kind: "agent", path: f, title: name, name, description: String(fm.description ?? ""),
        listingChars: chars(name) + chars(String(fm.description ?? "")), chars: chars(body), lines: lines(body), level: 5,
        when: [
            { how: "skill_listing", text: "이름과 설명은 세션이 시작될 때 항상 로드됩니다." },
            { how: "agent_spawn", text: "본문은 이 서브에이전트가 실행될 때 그 서브에이전트의 컨텍스트에만 로드됩니다." },
        ],
    });
}

// 훅은 settings.json 이 선언합니다. 훅이 내는 내용은 모델이 고르지 않아도 로드됩니다.
for (const sf of [".claude/settings.json"])
{
    if (!fileSet.has(sf)) continue;
    let conf = {};
    try { conf = JSON.parse(read(sf)); }
    catch { continue; }
    for (const [event, groups] of Object.entries(conf.hooks ?? {}))
    {
        for (const g of groups)
        {
            for (const h of g.hooks ?? [])
            {
                const cmd = h.command ?? h.prompt ?? "";
                const script = files.find((x) => x.startsWith(".claude/hooks/") && cmd.includes(basename(x)));
                const id = `hook:${event}:${script ?? cmd}`;
                add({
                    id, kind: "hook", path: script ?? sf, title: script ? basename(script) : event, event, matcher: g.matcher ?? null,
                    chars: script ? chars(read(script)) : 0, lines: script ? lines(read(script)) : 0, level: 3,
                    when: [{ how: "hook_event", text: `\`${event}\`${g.matcher ? ` (${g.matcher})` : ""} 때 자동으로 실행됩니다. 이 스크립트가 내는 내용이 컨텍스트에 로드됩니다.` }],
                });
            }
        }
    }
}

// ── 폴더 지시문의 섹션이 해당하는 범위 ─────────────────────────────────────────
// 폴더 지시문은 그 폴더의 어느 파일을 열어도 전부 로드됩니다. 섹션이 참조하는 경로가 폴더의 한 곳에 모여 있으면
// 그 섹션은 다른 곳의 파일을 열 때도 함께 로드되는 셈입니다. 그런 섹션을 찾아 「범위가 좁은 섹션」으로 적어 둡니다.
const commonDir = (paths) =>
{
    const split = paths.map((p) => (dirs.has(p) ? p : p.slice(0, p.lastIndexOf("/"))).split("/"));
    const head = [];
    for (let i = 0; i < Math.min(...split.map((s) => s.length)); i++)
    {
        if (!split.every((s) => s[i] === split[0][i])) break;
        head.push(split[0][i]);
    }
    return head.join("/");
};
const pathsIn = (text) => [...new Set([...text.matchAll(/`([^`\s]+)`/g)].map((m) => m[1].replace(/[.,:;]+$/, "").replace(/\/$/, "")).filter((p) => p.includes("/") && !/[*<>{}$()|=@]/.test(p) && !/^https?:/.test(p)))];
for (const n of nodes.filter((x) => x.kind === "nested"))
{
    const inDir = files.filter((x) => x.startsWith(n.dir)).length;
    const full = sections(read(n.path));
    n.sections = full.map(({ text, ...s }) =>
    {
        const hits = pathsIn(text).map((p) => [p, n.dir + p, n.dir + "src/" + p].find((c) => (fileSet.has(c) || dirs.has(c)) && c.startsWith(n.dir))).filter(Boolean);
        if (hits.length < 2) return s;
        const dir = commonDir(hits);
        if (dir.length <= n.dir.length - 1 || /^(src|app|lib)$/.test(dir.slice(n.dir.length))) return s;
        const count = files.filter((x) => x.startsWith(dir + "/")).length;
        return { ...s, narrow: { dir, files: count, share: inDir ? count / inDir : 0, paths: hits.length } };
    });
}

// ── 간선 ─────────────────────────────────────────────────────────────────
// hard 는 자동으로 로드되는 경로이고 soft 는 모델이 문서를 읽고 따라가야 하는 경로입니다.
const edges = [];
const rootNode = nodes.find((n) => n.kind === "root");
const nested = nodes.filter((n) => n.kind === "nested").sort((a, b) => a.dir.length - b.dir.length);
for (const n of nested)
{
    const parent = [...nested].reverse().find((p) => p !== n && n.dir.startsWith(p.dir)) ?? rootNode;
    if (parent) edges.push({ from: parent.id, to: n.id, kind: "hard", reason: "nested_traversal" });
}

const docSources = nodes.filter((n) => ["root", "nested", "rule", "skill", "agent"].includes(n.kind));
const named = nodes.filter((n) => n.kind === "skill" || n.kind === "agent");
const refs = [];
for (const src of docSources)
{
    const t = read(src.path);
    const base = src.path.includes("/") ? src.path.slice(0, src.path.lastIndexOf("/")) : "";
    for (const target of named)
    {
        if (target === src) continue;
        if (new RegExp("`" + target.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "`").test(t) || t.includes(target.path.replace(/SKILL\.md$/, "")))
        {
            edges.push({ from: src.id, to: target.id, kind: "soft", reason: "mention" });
        }
    }
    src.refs = [];
    const seen = new Set();
    for (const m of t.matchAll(/`([^`\s]+)`/g))
    {
        let p = m[1].replace(/[.,:;]+$/, "");
        if (!p.includes("/") || /[*<>{}$()|=@]/.test(p) || /^https?:/.test(p) || p.startsWith("/") || p.startsWith("~") || p.startsWith("node_modules/")) continue;
        if (!/\.(md|ts|tsx|mjs|js|json|sql|yml|yaml|css|sh)$|\/$/.test(p)) continue;
        p = p.replace(/\/$/, "");
        if (seen.has(p)) continue;
        seen.add(p);
        const hit = [p, base ? base + "/" + p : p].find((c) => fileSet.has(c) || dirs.has(c));
        const bySuffix = !hit && (files.some((x) => x.endsWith("/" + p)) || [...dirs].some((x) => x.endsWith("/" + p)));
        const state = hit ? "ok" : bySuffix ? "suffix" : "dead";
        src.refs.push({ path: p, resolved: hit ?? null, state });
        refs.push({ from: src.id, path: p, resolved: hit ?? null, state });
        if (hit && byId.has(hit) && hit !== src.id) edges.push({ from: src.id, to: hit, kind: "soft", reason: "mention" });
    }
}
const uniq = new Map();
for (const e of edges) uniq.set(`${e.from}→${e.to}→${e.kind}`, e);
edges.length = 0;
edges.push(...uniq.values());

// 지시문이 이름을 언급한 스킬과 서브에이전트는 4단계로 높입니다. 스킬끼리 호출한 것은 세지 않습니다.
for (const n of named)
{
    const callers = edges.filter((e) => e.to === n.id && ["root", "nested", "rule"].includes(byId.get(e.from).kind)).map((e) => e.from);
    n.namedBy = callers;
    if (callers.length) n.level = 4;
}

// ── 파일마다 누적되는 것 ───────────────────────────────────────────────────
const isBinary = (f) => /\.(png|jpe?g|gif|svg|ico|woff2?|ttf|pdf|docx|xlsx|zip|lock)$/.test(f);
const conditional = nodes.filter((n) => n.level === 2);
const stackOf = (f) => conditional.filter((n) => n.kind === "nested" ? f.startsWith(n.dir) : n.globs.some((g) => new RegExp(g.re).test(f))).map((n) => n.id);
const stackMap = new Map();
const src = files.filter((f) => !isBinary(f) && !f.startsWith(".claude/") && !/(^|\/)CLAUDE\.md$/.test(f));
for (const f of src)
{
    const parts = stackOf(f);
    const key = parts.join("|");
    const s = stackMap.get(key) ?? { parts, files: 0, chars: parts.reduce((a, id) => a + byId.get(id).chars, 0), examples: [], topDirs: {} };
    s.files++;
    if (s.examples.length < 3) s.examples.push(f);
    const top = f.split("/").slice(0, 2).join("/");
    s.topDirs[top] = (s.topDirs[top] ?? 0) + 1;
    stackMap.set(key, s);
}
const stacks = [...stackMap.values()].sort((a, b) => b.files - a.files).map((s) => ({ ...s, topDirs: Object.entries(s.topDirs).sort((a, b) => b[1] - a[1]).slice(0, 5) }));

// ── 제안 ─────────────────────────────────────────────────────────────────
// confidence: measured 는 파일에서 측정한 값이고, heuristic 은 추정한 것이며, needs-test 는 시나리오로 테스트해야 합니다.
const suggestions = [];
const alwaysChars = nodes.filter((n) => n.level === 1).reduce((a, n) => a + n.chars, 0) + named.reduce((a, n) => a + n.listingChars, 0);

for (const n of conditional)
{
    const pct = n.chars / LIMITS.onDemand200k;
    if (pct >= 1)
    {
        suggestions.push({
            id: `truncated:${n.id}`, kind: "truncation", severity: "high", confidence: "measured", targets: [n.id],
            title: `${n.title} 은 뒤쪽 ${(n.chars - LIMITS.onDemand200k).toLocaleString()}자가 잘립니다`,
            evidence: `${n.chars.toLocaleString()}자인데 컨텍스트 20만 세션은 ${LIMITS.onDemand200k.toLocaleString()}자까지만 로드됩니다.`,
            action: "뒤쪽 섹션부터 경로 규칙이나 하위 폴더의 CLAUDE.md 로 옮깁니다.",
        });
    }
    else if (pct >= 0.85)
    {
        const biggest = [...n.sections].sort((a, b) => b.chars - a.chars).slice(0, 3);
        suggestions.push({
            id: `cliff:${n.id}`, kind: "truncation", severity: pct >= 0.95 ? "high" : "medium", confidence: "measured", targets: [n.id],
            title: `${n.title} 은 잘리는 길이까지 ${(LIMITS.onDemand200k - n.chars).toLocaleString()}자 남았습니다`,
            evidence: `${n.chars.toLocaleString()}자로 상한의 ${Math.round(pct * 100)}% 입니다. 넘으면 경고 없이 뒤쪽이 사라집니다. 가장 큰 섹션은 ${biggest.map((s) => `「${s.title}」 ${s.chars.toLocaleString()}자`).join(", ")} 입니다.`,
            action: "가장 큰 섹션을 그 섹션이 다루는 폴더의 경로 규칙으로 옮겨 여유를 만듭니다.",
        });
    }
}

if (rootNode)
{
    const rootSections = sections(read(rootNode.path));
    const rules = nodes.filter((n) => n.kind === "rule" && n.level === 2);
    for (const s of rootSections)
    {
        const paths = [...s.text.matchAll(/`([^`\s]+\/[^`\s]*)`/g)].map((m) => m[1]).filter((p) => !/^https?:/.test(p) && !p.startsWith(".claude/"));
        const tops = [...new Set(paths.map((p) => p.split("/").slice(0, 2).join("/")))];
        const share = s.chars / rootNode.chars;
        const covering = rules.filter((r) => paths.length >= 2 && paths.every((p) => r.globs.some((g) => new RegExp(g.re).test(p) || new RegExp(g.re).test(p.replace(/\/?$/, "/x")))));
        if (covering.length && s.title !== "(머리말)")
        {
            suggestions.push({
                id: `demote:${s.title}`, kind: "demote", severity: "medium", confidence: "heuristic", targets: [rootNode.id, covering[0].id],
                title: `루트의 「${s.title}」 섹션은 ${covering[0].title} 규칙으로 옮길 수 있습니다`,
                evidence: `이 섹션이 참조하는 경로 ${paths.length}곳이 모두 ${covering[0].title} 규칙의 범위 안입니다. 지금은 ${s.chars.toLocaleString()}자가 모든 세션에 로드됩니다.`,
                action: `섹션을 \`${covering[0].path}\` 로 옮기고 루트에는 한 줄만 남깁니다.`,
                saves: s.chars,
            });
        }
        else if (share >= 0.2)
        {
            suggestions.push({
                id: `ablate:${s.title}`, kind: "demote", severity: "low", confidence: "needs-test", targets: [rootNode.id],
                title: `루트의 「${s.title}」 섹션이 항상 로드할 필요가 있는지 테스트합니다`,
                evidence: `루트의 ${Math.round(share * 100)}% (${s.chars.toLocaleString()}자) 를 차지합니다.${tops.length ? ` 참조하는 곳은 ${tops.slice(0, 4).join(", ")} 입니다.` : ""} 이 섹션이 모든 작업에 필요한지는 내용만 읽어서는 알 수 없습니다.`,
                action: "이 섹션을 뺀 채로 같은 시나리오를 돌려 결과가 달라지는지 봅니다. 달라지지 않으면 경로 규칙이나 스킬로 옮깁니다.",
                saves: s.chars,
            });
        }
    }
}

// 위치 변경. 폴더 지시문과 경로 규칙은 로드 단위가 달라서(폴더 전체 · 경로 패턴) 맞지 않는 위치에 있는 내용을 찾습니다.
for (const n of nodes.filter((x) => x.kind === "nested"))
{
    for (const s of n.sections.filter((x) => x.narrow && x.chars >= 800 && x.narrow.share <= 0.5))
    {
        suggestions.push({
            id: `split:${n.id}:${s.title}`, kind: "placement", severity: s.chars >= 3000 ? "medium" : "low", confidence: "heuristic", targets: [n.id],
            title: `${n.title} 의 「${s.title}」 섹션은 \`${s.narrow.dir.slice(n.dir.length)}/\` 에서만 쓰입니다`,
            evidence: `이 섹션이 참조하는 경로 ${s.narrow.paths}곳이 모두 \`${s.narrow.dir}/\` 아래입니다. 그곳의 파일은 이 폴더의 ${Math.round(s.narrow.share * 100)}%(${s.narrow.files.toLocaleString()}개)인데, 지금은 폴더의 어느 파일을 열어도 ${s.chars.toLocaleString()}자가 함께 로드됩니다.`,
            action: `섹션을 \`paths: ["${s.narrow.dir}/**"]\` 인 경로 규칙으로 옮깁니다. 다른 앱에도 같은 규약이 있으면 경로를 묶어 규칙 하나로 둡니다.`,
            saves: s.chars,
        });
    }
}

const lineSet = (text) => new Set(text.split("\n").map((l) => l.trim()).filter((l) => l.length >= 12 && !l.startsWith("#")));
const secs = nodes.filter((x) => ["root", "nested", "rule"].includes(x.kind)).flatMap((node) => sections(read(node.path)).filter((s) => s.chars >= 400).map((s) => ({ node, title: s.title, chars: s.chars, set: lineSet(s.text) })));
const groupOf = secs.map((_, i) => i);
const find = (i) => groupOf[i] === i ? i : (groupOf[i] = find(groupOf[i]));
for (let i = 0; i < secs.length; i++)
{
    for (let j = i + 1; j < secs.length; j++)
    {
        if (secs[i].node === secs[j].node || !secs[i].set.size || !secs[j].set.size) continue;
        let both = 0;
        for (const l of secs[i].set) if (secs[j].set.has(l)) both++;
        if (both / Math.min(secs[i].set.size, secs[j].set.size) >= 0.5) groupOf[find(j)] = find(i);
    }
}
const dupGroups = new Map();
secs.forEach((s, i) => dupGroups.set(find(i), [...(dupGroups.get(find(i)) ?? []), s]));
const inDup = new Set();
for (const g of [...dupGroups.values()].filter((x) => x.length >= 2))
{
    g.forEach((s) => inDup.add(`${s.node.id}#${s.title}`));
    const total = g.reduce((a, s) => a + s.chars, 0);
    const folders = g.filter((s) => s.node.kind === "nested").map((s) => s.node.dir.replace(/\/$/, ""));
    suggestions.push({
        id: `dup:${g[0].title}:${g.map((s) => s.node.id).join("+")}`, kind: "placement", severity: total >= 4000 ? "medium" : "low", confidence: "measured", targets: [...new Set(g.map((s) => s.node.id))],
        title: `「${g[0].title}」 섹션이 ${g.length}곳에 거의 같은 내용으로 있습니다`,
        evidence: `${g.map((s) => `${s.node.title} ${s.chars.toLocaleString()}자`).join(", ")}. 줄의 절반 이상이 같습니다. 폴더를 넘나드는 세션에는 같은 내용이 여러 번 로드되고, 한 곳만 고치면 서로 어긋납니다.`,
        action: folders.length >= 2
            ? `여러 폴더에 걸친 규약이므로 \`paths: ["{${folders.join(",")}}/**"]\` 처럼 경로를 묶은 규칙 하나로 옮기고, 폴더마다 다른 점만 그 폴더의 CLAUDE.md 에 남깁니다.`
            : "한 곳에만 두고 다른 곳은 참조하는 한 줄로 바꿉니다.",
        saves: total - Math.max(...g.map((s) => s.chars)),
    });
}
const byTitle = new Map();
for (const s of secs.filter((x) => x.node.kind === "nested" && x.title !== "(머리말)" && !inDup.has(`${x.node.id}#${x.title}`))) byTitle.set(s.title, [...(byTitle.get(s.title) ?? []), s]);
for (const [title, g] of [...byTitle].filter(([, x]) => new Set(x.map((s) => s.node.id)).size >= 2))
{
    suggestions.push({
        id: `same-topic:${title}`, kind: "placement", severity: "low", confidence: "heuristic", targets: [...new Set(g.map((s) => s.node.id))],
        title: `「${title}」 섹션을 폴더 ${g.length}곳이 따로 적고 있습니다`,
        evidence: `${g.map((s) => `${s.node.title} ${s.chars.toLocaleString()}자`).join(", ")}. 제목은 같고 내용은 다릅니다. 같은 규약의 다른 사본인지, 폴더마다 정말 다른 규약인지는 읽어 봐야 압니다.`,
        action: "같은 규약이면 공통 부분을 경로 규칙 하나로 모으고 폴더에는 차이만 남깁니다. 다른 규약이면 그대로 둡니다.",
    });
}

for (const n of nodes.filter((x) => x.source === "rule-paths" && x.matchedFiles / files.length >= 0.5))
{
    suggestions.push({
        id: `broad:${n.id}`, kind: "placement", severity: "low", confidence: "measured", targets: [n.id],
        title: `${n.title} 규칙은 조건이 넓어 거의 항상 로드됩니다`,
        evidence: `저장소 파일의 ${Math.round(n.matchedFiles / files.length * 100)}%(${n.matchedFiles.toLocaleString()}개)가 이 규칙의 경로에 맞습니다. 파일을 하나만 열어도 대개 로드되므로 조건이 거의 걸러 내지 못합니다.`,
        action: "정말 모든 작업에 걸리는 글이면 짧게 줄여 루트에 두고, 아니면 경로를 그 규약이 실제로 걸리는 폴더나 파일 종류로 좁힙니다.",
    });
}
for (const n of nodes.filter((x) => x.source === "rule-always"))
{
    suggestions.push({
        id: `always-rule:${n.id}`, kind: "placement", severity: n.chars >= 2000 ? "medium" : "low", confidence: "needs-test", targets: [n.id],
        title: `${n.title} 규칙은 경로 조건이 없어 항상 로드됩니다`,
        evidence: `${n.chars.toLocaleString()}자가 루트 CLAUDE.md 와 같은 비용으로 모든 세션에 로드됩니다. 파일만 나뉘어 있을 뿐 로드되는 시점은 루트와 같습니다.`,
        action: "모든 작업에 걸리는 글인지 봅니다. 몇몇 파일에서만 걸리면 머리에 `paths` 를 적습니다.",
        saves: n.chars,
    });
}

const deadBySrc = new Map();
for (const r of refs.filter((x) => x.state === "dead" && byId.get(x.from).kind !== "skill")) deadBySrc.set(r.from, [...(deadBySrc.get(r.from) ?? []), r.path]);
for (const [from, list] of [...deadBySrc].sort((a, b) => b[1].length - a[1].length))
{
    suggestions.push({
        id: `dead:${from}`, kind: "dead-ref", severity: byId.get(from).level === 1 ? "high" : "medium", confidence: "measured", targets: [from],
        title: `${byId.get(from).title} 이 참조하는 경로 ${list.length}곳이 없습니다`,
        evidence: list.slice(0, 6).map((p) => `\`${p}\``).join(", ") + (list.length > 6 ? ` 외 ${list.length - 6}곳` : ""),
        action: "옮겨진 곳으로 고치거나 지웁니다. 모델은 없는 경로를 찾느라 도구 호출을 씁니다.",
        items: list,
    });
}

for (const n of nodes.filter((x) => x.kind === "rule"))
{
    for (const g of n.globs.filter((x) => x.files === 0))
    {
        suggestions.push({
            id: `zero:${n.id}:${g.glob}`, kind: "dead-glob", severity: "medium", confidence: "measured", targets: [n.id],
            title: `${n.title} 규칙의 \`${g.glob}\` 에 맞는 파일이 없습니다`,
            evidence: "이 조건으로는 규칙이 로드될 일이 없습니다.", action: "경로를 고치거나 조건을 지웁니다.",
        });
    }
}

const free = named.filter((n) => n.level === 5 && n.kind === "skill").sort((a, b) => b.listingChars - a.listingChars);
if (free.length)
{
    const freeChars = free.reduce((a, n) => a + n.listingChars, 0);
    suggestions.push({
        id: "free-skills", kind: "demote", severity: freeChars / alwaysChars >= 0.3 ? "high" : "medium", confidence: "needs-test", targets: free.map((n) => n.id),
        title: `항상 로드되는 내용의 ${Math.round(freeChars / alwaysChars * 100)}% 는 아무 지시문도 언급하지 않는 스킬 ${free.length}종의 설명입니다`,
        evidence: `설명 ${freeChars.toLocaleString()}자가 모든 세션에 로드되는데, 어느 지시문도 이 스킬들의 이름을 언급하지 않습니다. 본문이 읽힐지는 모델이 설명만 보고 정합니다. 긴 것부터 ${free.slice(0, 3).map((n) => `\`${n.name}\` ${n.listingChars.toLocaleString()}자`).join(", ")} 입니다.`,
        action: "기록과 시나리오에서 한 번도 호출되지 않은 스킬을 고릅니다. 사람이 직접 호출할 때만 쓰는 것은 `disable-model-invocation: true` 를 적어 목록에서 빼고, 안 쓰는 것은 지웁니다. 꼭 읽혀야 하는 것은 그 작업의 경로 규칙에서 이름을 언급합니다.",
        items: free.map((n) => n.name), saves: freeChars,
    });
}

for (const n of named.filter((x) => x.listingChars > LIMITS.skillListing))
{
    suggestions.push({
        id: `listing:${n.id}`, kind: "truncation", severity: "medium", confidence: "measured", targets: [n.id],
        title: `${n.title} 의 설명이 목록에서 잘립니다`, evidence: `${n.listingChars.toLocaleString()}자인데 목록 한 칸은 ${LIMITS.skillListing.toLocaleString()}자까지입니다.`,
        action: "언제 쓰는지를 앞쪽에 두고 줄입니다.",
    });
}

const bare = stacks.find((s) => s.parts.length === 0);
if (bare && bare.files / src.length > 0.1)
{
    suggestions.push({
        id: "bare-files", kind: "coverage", severity: "low", confidence: "measured", targets: [],
        title: `파일 ${bare.files.toLocaleString()}개는 열어도 루트 말고 아무것도 로드되지 않습니다`,
        evidence: `전체의 ${Math.round(bare.files / src.length * 100)}% 입니다. 많은 곳은 ${bare.topDirs.map(([d, c]) => `${d} ${c.toLocaleString()}개`).join(", ")} 입니다.`,
        action: "규약이 필요한 폴더인지 보고, 필요하면 경로 규칙을 붙입니다. 필요 없으면 그대로 둡니다.",
    });
}

const sumOf = (list) => ({ count: list.length, chars: list.reduce((a, n) => a + n.chars, 0) });
const sources = Object.fromEntries(["root", "folder", "rule-always", "rule-paths"].map((k) => [k, sumOf(nodes.filter((n) => n.source === k))]));

const order = { high: 0, medium: 1, low: 2 };
suggestions.sort((a, b) => order[a.severity] - order[b.severity]);

let commit = "";
try { commit = git("rev-parse", "--short", "HEAD").trim(); }
catch { /* 깃이 없으면 비워 둡니다 */ }

const map = {
    schema: 1,
    meta: { repo: basename(root), commit, generatedAt: new Date().toISOString(), limits: LIMITS, files: files.length, sourceFiles: src.length, alwaysChars, sources },
    nodes, edges, stacks, suggestions,
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(map));
console.log(`맵: 노드 ${nodes.length} · 간선 ${edges.length} · 제안 ${suggestions.length} · 항상 로드되는 내용 ${alwaysChars.toLocaleString()}자 → ${out}`);

#!/usr/bin/env node
// 저장소를 읽어 「무엇이 언제 컨텍스트에 실리는가」의 지도를 JSON 으로 냅니다. 모델을 부르지 않고 파일만 읽습니다.
// 쓰는 법: node scan.mjs [--root <저장소>] [--out <map.json>]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { argOf, dataDir } from "./lib-paths.mjs";

const arg = argOf(process.argv.slice(2));
const root = resolve(arg("root", process.cwd()));
const out = resolve(arg("out", join(dataDir(root), "map.json")));

// 요청할 때 실리는 파일이 잘리는 길이입니다. 컨텍스트 20만 세션이 4만 자이고 100만 세션이 15만 자입니다.
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
// 강제 수준: 1 늘 실림 · 2 기계가 조건으로 실음 · 3 훅이 강제 · 4 지시문이 가리킴 · 5 모델이 고름
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
        id: f, kind: isRoot ? "root" : "nested", path: f, title: isRoot ? "루트 CLAUDE.md" : dir.replace(/\/$/, ""),
        chars: chars(t), lines: lines(t), level: isRoot ? 1 : 2, dir,
        sections: sections(t).map(({ text, ...s }) => s),
        when: isRoot
            ? [{ how: "session_start", text: "세션이 시작될 때 전부 실립니다. 압축 뒤에도 다시 실립니다." }]
            : [{ how: "nested_traversal", text: `\`${dir}\` 아래 파일을 읽거나 고칠 때 실립니다. 압축 뒤에는 다시 그 폴더를 열어야 돌아옵니다.` }],
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
        id: f, kind: "rule", path: f, title: basename(f, ".md"), chars: chars(t), lines: lines(t), level: scoped ? 2 : 1,
        globs: perGlob, sections: sections(t).map(({ text, ...s }) => s),
        when: scoped
            ? [{ how: "path_glob", text: "아래 경로에 맞는 파일을 읽거나 고칠 때 실립니다.", globs }]
            : [{ how: "session_start", text: "경로 조건이 없어서 세션이 시작될 때 실립니다." }],
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
            { how: "skill_listing", text: `이름과 설명 ${chars(name) + chars(desc)}자는 세션이 시작될 때 늘 실립니다.` },
            { how: "skill_invoke", text: "본문은 모델이 이 스킬을 부를 때만 실립니다. 부를지는 모델이 정합니다." },
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
            { how: "skill_listing", text: "이름과 설명은 세션이 시작될 때 늘 실립니다." },
            { how: "agent_spawn", text: "본문은 이 서브에이전트가 띄워질 때 그 서브에이전트의 컨텍스트에만 실립니다." },
        ],
    });
}

// 훅은 settings.json 이 선언합니다. 훅이 내는 글은 모델이 고르지 않아도 실립니다.
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
                    when: [{ how: "hook_event", text: `\`${event}\`${g.matcher ? ` (${g.matcher})` : ""} 때 기계가 돌립니다. 이 스크립트가 내는 글이 컨텍스트에 실립니다.` }],
                });
            }
        }
    }
}

// ── 간선 ─────────────────────────────────────────────────────────────────
// hard 는 기계가 싣는 길이고 soft 는 모델이 글을 읽고 따라가야 하는 길입니다.
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

// 지시문이 이름을 부른 스킬과 서브에이전트는 4단계로 올립니다. 스킬끼리 부른 것은 세지 않습니다.
for (const n of named)
{
    const callers = edges.filter((e) => e.to === n.id && ["root", "nested", "rule"].includes(byId.get(e.from).kind)).map((e) => e.from);
    n.namedBy = callers;
    if (callers.length) n.level = 4;
}

// ── 파일마다 쌓이는 것 ───────────────────────────────────────────────────
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
// confidence: measured 는 파일에서 잰 사실이고, heuristic 은 글에서 짐작한 것이며, needs-test 는 시나리오로 재 봐야 합니다.
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
            evidence: `${n.chars.toLocaleString()}자인데 컨텍스트 20만 세션은 ${LIMITS.onDemand200k.toLocaleString()}자까지만 싣습니다.`,
            action: "뒤쪽 절부터 경로 규칙이나 하위 폴더의 CLAUDE.md 로 옮깁니다.",
        });
    }
    else if (pct >= 0.85)
    {
        const biggest = [...n.sections].sort((a, b) => b.chars - a.chars).slice(0, 3);
        suggestions.push({
            id: `cliff:${n.id}`, kind: "truncation", severity: pct >= 0.95 ? "high" : "medium", confidence: "measured", targets: [n.id],
            title: `${n.title} 은 잘리는 길이까지 ${(LIMITS.onDemand200k - n.chars).toLocaleString()}자 남았습니다`,
            evidence: `${n.chars.toLocaleString()}자로 상한의 ${Math.round(pct * 100)}% 입니다. 넘으면 경고 없이 뒤쪽이 사라집니다. 가장 큰 절은 ${biggest.map((s) => `「${s.title}」 ${s.chars.toLocaleString()}자`).join(", ")} 입니다.`,
            action: "가장 큰 절을 그 절이 다루는 폴더의 경로 규칙으로 옮겨 여유를 만듭니다.",
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
                title: `루트의 「${s.title}」 절은 ${covering[0].title} 규칙으로 내릴 수 있습니다`,
                evidence: `이 절이 가리키는 경로 ${paths.length}곳이 모두 ${covering[0].title} 규칙의 범위 안입니다. 지금은 ${s.chars.toLocaleString()}자가 모든 세션에 실립니다.`,
                action: `절을 \`${covering[0].path}\` 로 옮기고 루트에는 한 줄만 남깁니다.`,
                saves: s.chars,
            });
        }
        else if (share >= 0.2)
        {
            suggestions.push({
                id: `ablate:${s.title}`, kind: "demote", severity: "low", confidence: "needs-test", targets: [rootNode.id],
                title: `루트의 「${s.title}」 절이 늘 실리는 값을 하는지 재 봅니다`,
                evidence: `루트의 ${Math.round(share * 100)}% (${s.chars.toLocaleString()}자) 를 차지합니다.${tops.length ? ` 가리키는 곳은 ${tops.slice(0, 4).join(", ")} 입니다.` : ""} 이 절이 모든 작업에 필요한지는 글만 읽어서는 알 수 없습니다.`,
                action: "이 절을 뺀 채로 같은 시나리오를 돌려 결과가 달라지는지 봅니다. 달라지지 않는 단계는 경로 규칙이나 스킬로 내립니다.",
                saves: s.chars,
            });
        }
    }
}

const deadBySrc = new Map();
for (const r of refs.filter((x) => x.state === "dead" && byId.get(x.from).kind !== "skill")) deadBySrc.set(r.from, [...(deadBySrc.get(r.from) ?? []), r.path]);
for (const [from, list] of [...deadBySrc].sort((a, b) => b[1].length - a[1].length))
{
    suggestions.push({
        id: `dead:${from}`, kind: "dead-ref", severity: byId.get(from).level === 1 ? "high" : "medium", confidence: "measured", targets: [from],
        title: `${byId.get(from).title} 이 가리키는 경로 ${list.length}곳이 없습니다`,
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
            evidence: "이 조건으로는 규칙이 실릴 일이 없습니다.", action: "경로를 고치거나 조건을 지웁니다.",
        });
    }
}

const free = named.filter((n) => n.level === 5 && n.kind === "skill").sort((a, b) => b.listingChars - a.listingChars);
if (free.length)
{
    const freeChars = free.reduce((a, n) => a + n.listingChars, 0);
    suggestions.push({
        id: "free-skills", kind: "demote", severity: freeChars / alwaysChars >= 0.3 ? "high" : "medium", confidence: "needs-test", targets: free.map((n) => n.id),
        title: `늘 실리는 글의 ${Math.round(freeChars / alwaysChars * 100)}% 는 아무도 부르지 않는 스킬 ${free.length}종의 설명입니다`,
        evidence: `설명 ${freeChars.toLocaleString()}자가 모든 세션에 실리는데, 어느 지시문도 이 스킬들의 이름을 부르지 않습니다. 본문이 읽힐지는 모델이 설명만 보고 정합니다. 긴 것부터 ${free.slice(0, 3).map((n) => `\`${n.name}\` ${n.listingChars.toLocaleString()}자`).join(", ")} 입니다.`,
        action: "기록과 시나리오에서 한 번도 불리지 않은 스킬을 고릅니다. 사람이 직접 부를 때만 쓰는 것은 `disable-model-invocation: true` 를 적어 목록에서 빼고, 안 쓰는 것은 지웁니다. 꼭 읽혀야 하는 것은 그 작업의 경로 규칙에서 이름을 부릅니다.",
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
        title: `파일 ${bare.files.toLocaleString()}개는 열어도 루트 말고 아무것도 실리지 않습니다`,
        evidence: `전체의 ${Math.round(bare.files / src.length * 100)}% 입니다. 많은 곳은 ${bare.topDirs.map(([d, c]) => `${d} ${c.toLocaleString()}개`).join(", ")} 입니다.`,
        action: "규약이 필요한 폴더인지 보고, 필요하면 경로 규칙을 붙입니다. 필요 없으면 그대로 둡니다.",
    });
}

const order = { high: 0, medium: 1, low: 2 };
suggestions.sort((a, b) => order[a.severity] - order[b.severity]);

let commit = "";
try { commit = git("rev-parse", "--short", "HEAD").trim(); }
catch { /* 깃이 없으면 비워 둡니다 */ }

const map = {
    schema: 1,
    meta: { repo: basename(root), commit, generatedAt: new Date().toISOString(), limits: LIMITS, files: files.length, sourceFiles: src.length, alwaysChars },
    nodes, edges, stacks, suggestions,
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(map));
console.log(`지도: 노드 ${nodes.length} · 간선 ${edges.length} · 제안 ${suggestions.length} · 늘 실리는 글 ${alwaysChars.toLocaleString()}자 → ${out}`);

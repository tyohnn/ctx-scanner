#!/usr/bin/env node
// 저장소를 읽어 「무엇이 언제 컨텍스트에 로드되는가」의 맵을 JSON 으로 냅니다. 모델을 호출하지 않고 파일만 읽습니다.
// 쓰는 법: node scan.mjs [--root <저장소>] [--out <map.json>]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, dirname, join, posix, resolve } from "node:path";
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
    let seen = false;
    let fence = false;
    for (const line of t.split("\n"))
    {
        // 코드 블록 안의 `#` 은 셸 주석이지 제목이 아닙니다.
        if (/^\s*(```|~~~)/.test(line)) fence = !fence;
        if (fence)
        {
            cur.text += line + "\n";
            continue;
        }
        // `##` 마다 섹션을 나눕니다. `#` 는 파일의 첫 제목이면 머리말에 두고, 그 뒤에 나오면 섹션으로 나눕니다.
        // 생성기가 파일 끝에 붙이는 `# ...` 블록이 앞 섹션에 묻히지 않게 하려는 것입니다.
        const top = line.match(/^#\s+(.+)$/);
        const h = line.match(/^##\s+(.+)$/) ?? (top && seen ? top : null);
        if (top || h) seen = true;
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

// 경로 규칙은 두 가지로 나뉩니다. 계층 규약(layer)은 「어떻게 만드나」이고 폴더 이름이나 확장자 같은 파일 종류에 걸립니다.
// 도메인 용어(domain)는 「무엇이라 부르나」이고 그 도메인의 코드가 있는 폴더에 걸립니다.
const TERM_TABLE = /^\|\s*(용어|term)\s*\|/im;
const roleOf = (f, text, globs) =>
{
    if (!globs.length) return "general";
    // 폴더 이름(`glossary/` · `domain/`)이나 `용어` 로 시작하는 파일 이름만 봅니다. `domain-packages.md` 처럼 이름에 domain 이
    // 들어간 계층 규칙을 용어 규칙으로 잘못 읽지 않게 합니다.
    const rel = f.slice(".claude/rules/".length);
    if (/(^|\/)(glossary|domains?)\//i.test(rel) || /(^|\/)용어[^/]*\.md$/.test(rel) || TERM_TABLE.test(text)) return "domain";
    return "layer";
};
// 용어 표의 첫 칸을 읽습니다. 같은 용어가 두 곳에 정의되면 어느 뜻을 따를지 정해져 있지 않습니다.
const termsOf = (text) =>
{
    const out = [];
    let on = false;
    for (const line of text.split("\n"))
    {
        if (TERM_TABLE.test(line)) { on = true; continue; }
        if (!line.trim().startsWith("|")) { on = false; continue; }
        if (!on || /^\|[\s:|-]+\|?$/.test(line.trim())) continue;
        const cell = line.split("|")[1]?.replace(/[`*⚠]/g, "").trim();
        if (cell) out.push(...cell.split(/\s*[·,/]\s*/).filter(Boolean));
    }
    return out;
};

for (const f of ruleFiles)
{
    const t = read(f);
    const { fm } = frontmatter(t);
    const globs = Array.isArray(fm.paths) ? fm.paths : fm.paths ? [fm.paths] : [];
    const res = globs.map(globToRe);
    const scoped = globs.length > 0;
    const perGlob = globs.map((g, i) => ({ glob: g, re: res[i], files: files.filter((x) => new RegExp(res[i]).test(x)).length }));
    add({
        id: f, kind: "rule", source: scoped ? "rule-paths" : "rule-always", path: f, title: f.slice(".claude/rules/".length, -3), chars: chars(t), lines: lines(t), level: scoped ? 2 : 1,
        role: roleOf(f, t, globs),
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

// 스킬 목록에 무엇이 실리는지는 설정이 정합니다. `skillOverrides` 가 설명을 빼거나 이름만 남기고,
// 스킬 머리의 `disable-model-invocation: true` 도 목록에서 뺍니다.
let settings = {};
try { settings = JSON.parse(read(".claude/settings.json")); }
catch { /* 설정이 없으면 모든 스킬의 설명이 목록에 실립니다 */ }
const overrides = settings.skillOverrides ?? {};
const LISTING_TEXT = {
    on: (c) => `이름과 설명 ${c}자는 세션이 시작될 때 항상 로드됩니다.`,
    "name-only": (c) => `설정(\`skillOverrides\`)이 이름만 남겨서 목록에는 이름 ${c}자만 로드됩니다.`,
    "user-invocable-only": () => "설정(`skillOverrides`)이 목록에서 빼서 항상 로드되는 내용이 없습니다. 사람이 호출하거나 지시문이 경로로 가리킬 때만 읽힙니다.",
    off: () => "설정(`skillOverrides`)이 꺼 두어서 로드되지 않습니다.",
};

for (const f of skillFiles)
{
    const t = read(f);
    const { fm, body } = frontmatter(t);
    const name = fm.name ?? f.split("/").at(-2);
    const desc = String(fm.description ?? "");
    const folder = f.slice(0, -"SKILL.md".length);
    const extra = files.filter((x) => x.startsWith(folder) && x !== f);
    const listing = LISTING_TEXT[overrides[name]] ? overrides[name] : fm["disable-model-invocation"] === "true" ? "user-invocable-only" : "on";
    const listingChars = listing === "on" ? chars(name) + chars(desc) : listing === "name-only" ? chars(name) : 0;
    add({
        id: f, kind: "skill", path: f, title: name, name, description: desc, listing,
        listingChars, fullListingChars: chars(name) + chars(desc), chars: chars(body), lines: lines(body), level: 5,
        extraFiles: extra.length,
        when: [
            { how: "skill_listing", text: LISTING_TEXT[listing](listingChars) },
            { how: "skill_invoke", text: listing === "on" || listing === "name-only" ? "본문은 모델이 이 스킬을 호출할 때만 로드됩니다. 호출할지는 모델이 정합니다." : "본문은 사람이 호출하거나 모델이 지시문의 경로를 따라 파일을 읽을 때만 로드됩니다." },
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
        // `_components/` · `lib/` 처럼 폴더 전체가 함께 쓰는 구현의 자리를 가리키면 규약이 그 폴더만의 것이라는 뜻이 아닙니다.
        // 목록 화면의 짜임을 적은 섹션이 그 짜임을 그리는 공용 컴포넌트를 참조하는 경우가 그렇습니다.
        if (/^(_[^/]+|components|lib|utils|hooks|shared)$/.test(dir.slice(dir.lastIndexOf("/") + 1))) return s;
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
        const line = t.slice(t.lastIndexOf("\n", m.index) + 1, (t.indexOf("\n", m.index) + 1 || t.length + 1) - 1);
        if (!p.includes("/") || /[*<>{}$()|=@]/.test(p) || /^https?:/.test(p) || p.startsWith("/") || p.startsWith("~") || p.startsWith("node_modules/")) continue;
        if (!/\.(md|ts|tsx|mjs|js|json|sql|yml|yaml|css|sh)$|\/$/.test(p)) continue;
        p = p.replace(/\/$/, "");
        if (seen.has(p)) continue;
        seen.add(p);
        // `../CLAUDE.md` 처럼 상대 경로로 적은 참조는 그 문서의 폴더를 기준으로 접어서 찾습니다.
        const relative = base ? posix.normalize(base + "/" + p) : posix.normalize(p);
        const hit = [p, relative].find((c) => fileSet.has(c) || dirs.has(c));
        const bySuffix = !hit && (files.some((x) => x.endsWith("/" + p)) || [...dirs].some((x) => x.endsWith("/" + p)));
        // 깨진 참조로 세지 않는 것이 둘입니다. 같은 줄에 커밋 해시가 있으면 지난 커밋의 경로를 적은 것이고, 첫 폴더가
        // 저장소 어디에도 없으면(`자료/` · `결과/`) 쓰는 사람이 만드는 작업 폴더나 예시입니다. 지도에는 `outside` 로 남깁니다.
        const head = p.split("/")[0];
        const pastCommit = /`[0-9a-f]{7,40}`/.test(line);
        const outside = !/^\.\.?$/.test(head) && !dirs.has(head) && !(base && dirs.has(base + "/" + head)) && ![...dirs].some((x) => x.endsWith("/" + head));
        const state = hit ? "ok" : bySuffix ? "suffix" : pastCommit || outside ? "outside" : "dead";
        src.refs.push({ path: p, resolved: hit ?? null, state });
        refs.push({ from: src.id, path: p, resolved: hit ?? null, state });
        if (hit && byId.has(hit) && hit !== src.id) edges.push({ from: src.id, to: hit, kind: "soft", reason: "mention" });
    }
}
const uniq = new Map();
for (const e of edges) uniq.set(`${e.from}→${e.to}→${e.kind}`, e);
edges.length = 0;
edges.push(...uniq.values());

// 지시문이 이름을 언급한 스킬과 서브에이전트는 4단계로 높입니다. 4단계 스킬이 다시 이름을 언급한 스킬도 4단계입니다.
// 지시문 → 스킬 → 스킬로 이어지는 길이 있으면 모델이 그 스킬을 열 이유가 있기 때문입니다(`viaSkill` 에 적습니다).
for (const n of named)
{
    const callers = edges.filter((e) => e.to === n.id && ["root", "nested", "rule"].includes(byId.get(e.from).kind)).map((e) => e.from);
    n.namedBy = callers;
    if (callers.length) n.level = 4;
}
for (let changed = true; changed;)
{
    changed = false;
    for (const n of named.filter((x) => x.level === 5))
    {
        const via = edges.filter((e) => e.to === n.id && e.kind === "soft" && byId.get(e.from).kind === "skill" && byId.get(e.from).level === 4).map((e) => e.from);
        if (!via.length) continue;
        n.viaSkill = via;
        n.level = 4;
        changed = true;
    }
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

// ── 플로우: 영역 × 위치마다 무엇이 로드되나 ───────────────────────────────────────────
// 파일 하나를 건드리면 세 축에서 로드가 일어납니다. 폴더(어느 앱 · 기능 폴더 아래인가), 계층(어느 계층 · 파일 종류인가),
// 도메인(어느 도메인의 코드인가). 그 뒤에는 로드된 지시문이 가리키는 스킬과 문서가 필요할 때만 읽힙니다.
// 영역은 위에서부터 처음 맞는 것으로 정합니다. 저장소가 `.claude/ctxscope.json` 의 `areas` 로 바꿀 수 있습니다.
const DEFAULT_AREAS = [
    { id: "test", label: "테스트", order: 91, paths: ["**/*.{test,spec}.{ts,tsx,js,jsx,mjs}", "**/{e2e,__tests__,tests}/**"] },
    { id: "database", label: "DB · 마이그레이션", order: 90, paths: ["**/migrations/**", "**/*.sql"] },
    { id: "action", label: "서버 액션", paths: ["**/actions/**"] },
    { id: "usecase", label: "유스케이스", paths: ["**/usecases/**"] },
    { id: "cron", label: "크론", paths: ["**/api/cron/**"] },
    { id: "webhook", label: "웹훅", paths: ["**/api/{hooks,webhooks}/**"] },
    { id: "mcp", label: "MCP", paths: ["**/api/mcp/**"] },
    { id: "api", label: "API 라우트", paths: ["**/api/**"] },
    { id: "screen", label: "화면", paths: ["**/app/**/*.tsx", "**/pages/**/*.tsx"] },
    { id: "component", label: "UI 컴포넌트", paths: ["**/components/**", "**/*.tsx"] },
    { id: "port", label: "포트", paths: ["**/ports/**", "**/*.port.ts", "**/ports.ts"] },
    { id: "adapter", label: "어댑터", paths: ["**/adapters/**", "packages/adapters-*/**"] },
    { id: "package", label: "패키지 코드", paths: ["packages/*/src/**"] },
    { id: "app", label: "앱의 그 밖의 코드", paths: ["apps/*/src/**"] },
];
let config = {};
for (const c of [arg("config", ""), ".claude/ctxscope.json"].filter(Boolean))
{
    try { config = JSON.parse(readFileSync(resolve(root, c), "utf8")); break; }
    catch { /* 설정이 없으면 기본 영역을 씁니다 */ }
}
// 플로우와 빈칸 검사에서 뺄 경로입니다. 저장소 맨 위의 점으로 시작하는 폴더(.design-sync 같은 받아 둔 자료)는 기본으로 빼고,
// 원본을 그대로 옮겨 둔 패키지처럼 일부러 규약을 걸지 않는 곳은 `.claude/ctxscope.json` 의 `ignore` 에 적습니다.
const ignoreRes = [".*/**", ...(config.ignore ?? [])].map((g) => new RegExp(globToRe(g)));
const ignored = (f) => ignoreRes.some((r) => r.test(f));
// `areas` 는 기본 영역에 덧씌웁니다. id 가 같으면 그 영역의 label · paths 만 바꾸고, 새 id 는 「패키지 코드」 앞에 끼웁니다.
// 영역 하나를 좁히려고 열넷을 다 옮겨 적지 않게 하려는 것입니다. 기본값을 버리고 처음부터 적으려면 `replaceAreas: true` 를 줍니다.
const mergeAreas = (base, extra) =>
{
    const out = base.map((a) => ({ ...a, ...(extra.find((e) => e.id === a.id) ?? {}) }));
    const fresh = extra.filter((e) => !base.some((a) => a.id === e.id));
    const at = out.findIndex((a) => a.id === "package");
    out.splice(at < 0 ? out.length : at, 0, ...fresh);
    return out;
};
const areaList = !config.areas ? DEFAULT_AREAS : config.replaceAreas ? config.areas : mergeAreas(DEFAULT_AREAS, config.areas);
const areas = areaList.map((a, i) => ({ ...a, order: a.order ?? i, res: a.paths.map((g) => new RegExp(globToRe(g))) }));
const areaOf = (f) => areas.find((a) => a.res.some((r) => r.test(f)));
const scopeOf = (f) =>
{
    const p = f.split("/");
    return p.length > 2 && /^(apps|packages|services|libs|plugins)$/.test(p[0]) ? `${p[0]}/${p[1]}` : p.length > 1 ? p[0] : "(루트)";
};
const softTo = (id) => edges.filter((e) => e.from === id && e.kind === "soft").map((e) => e.to);
const skillOfPath = (p) => nodes.find((n) => n.kind === "skill" && p.startsWith(n.path.slice(0, -"SKILL.md".length)));
// 계층 규칙이 어느 영역의 규약인지는 그 규칙에 맞는 파일이 어느 영역에 몰려 있는지로 봅니다. 어느 영역에도 4분의 1 넘게
// 몰려 있지 않으면 영역을 가리지 않는 공통 규칙으로 봅니다(파일 크기 제한 같은 것).
const codeFiles = src.filter((x) => /\.(ts|tsx|js|jsx|mjs|cjs|sql|py|go|rs|css)$/.test(x));
// 영역마다 코드 파일 수입니다. 규칙이 한 영역의 절반 넘게 덮으면, 그 영역이 규칙 파일 가운데 차지하는 몫이 작아도 그 영역의 규약으로 봅니다.
// 화면 규칙(`apps/**/*.tsx`)처럼 큰 영역과 작은 영역에 함께 걸리는 규칙이 작은 영역에서 빠지지 않게 하려는 것입니다.
const areaTotal = {};
for (const f of codeFiles.filter((x) => !ignored(x))) { const a = areaOf(f)?.id; if (a) areaTotal[a] = (areaTotal[a] ?? 0) + 1; }
for (const n of nodes.filter((x) => x.source === "rule-paths"))
{
    // 영역은 테스트를 먼저 봐서(`actions/x.test.ts` 는 테스트) 테스트가 많은 폴더의 규칙이 테스트 영역으로 쏠립니다.
    // 그래서 테스트 파일을 뺀 코드 파일로 먼저 세고, 테스트만 맞는 규칙일 때만 테스트 영역으로 봅니다. 분모도 같은 파일들입니다.
    const all = codeFiles.filter((f) => !ignored(f) && n.globs.some((g) => new RegExp(g.re).test(f)));
    const nonTest = all.filter((f) => areaOf(f)?.id !== "test");
    const hit = nonTest.length >= all.length / 2 ? nonTest : all;
    const count = {};
    for (const f of hit) { const a = areaOf(f)?.id; if (a) count[a] = (count[a] ?? 0) + 1; }
    const ranked = Object.entries(count).sort((a, b) => b[1] - a[1]);
    const share = ranked.filter(([, c]) => hit.length && c / hit.length >= 0.25).map(([a]) => a);
    const covered = ranked.filter(([a, c]) => a !== "test" && !share.includes(a) && c / (areaTotal[a] ?? Infinity) >= 0.5).map(([a]) => a);
    // 코드 파일의 절반 넘게 걸리는 규칙(파일 크기 제한 같은 것)은 영역을 가리지 않습니다. 「패키지 코드」 · 「앱의 그 밖의 코드」는
    // 다른 영역이 없을 때만 씁니다. 그런 규칙은 그 위치 안의 모든 영역에서 계층 칸에 들어갑니다(도메인 패키지 규약 같은 것).
    // 덮은 영역(covered)은 몫으로 정한 영역이 좁을 때만 더합니다. 위치 전체에 걸리는 규칙(「패키지 코드」)이 덮은 영역 하나 때문에
    // 좁은 규칙으로 바뀌면 그 위치의 다른 영역에서 계층 칸이 비기 때문입니다.
    const narrow = share.filter((a) => !["package", "app"].includes(a));
    const extra = covered.filter((a) => !["package", "app"].includes(a));
    n.areas = all.length / codeFiles.length >= 0.5 ? [] : narrow.length ? [...narrow, ...extra] : share;
    if (n.role === "layer" && !n.areas.length) n.role = "common";
}
const cells = new Map();
for (const f of codeFiles.filter((x) => !ignored(x)))
{
    const area = areaOf(f);
    if (!area) continue;
    const key = `${area.id}|${scopeOf(f)}`;
    const cell = cells.get(key) ?? { area, scope: scopeOf(f), files: 0, byStack: new Map() };
    cell.files++;
    const parts = stackOf(f);
    const st = cell.byStack.get(parts.join("|")) ?? { parts, files: 0, example: f };
    st.files++;
    cell.byStack.set(parts.join("|"), st);
    cells.set(key, cell);
}
const flows = [...cells.values()].map((cell) =>
{
    // 한 칸 안에서도 파일마다 로드되는 것이 다를 수 있어서, 파일이 가장 많은 조합을 그 칸의 대표로 삼습니다.
    const main = [...cell.byStack.values()].sort((a, b) => b.files - a.files)[0];
    const loaded = main.parts.map((id) => byId.get(id));
    const axis = (pick) => loaded.filter(pick).map((n) => n.id);
    const sum = (ids) => ids.reduce((a, id) => a + byId.get(id).chars, 0);
    const folder = axis((n) => n.kind === "nested");
    // 계층 칸에는 이 영역의 규칙만 둡니다. 다른 영역에 몰려 있는 규칙과 영역을 가리지 않는 규칙도 로드되지만 따로 적습니다.
    const layer = axis((n) => n.role === "layer" && (n.areas.includes(cell.area.id) || n.areas.some((a) => a === "package" || a === "app")));
    const common = axis((n) => n.kind === "rule" && n.role !== "domain" && !layer.includes(n.id));
    const domain = axis((n) => n.role === "domain");
    // 필요할 때만: 로드된 지시문이 이름이나 경로로 가리키는 스킬, 그리고 그 스킬이 다시 가리키는 스킬입니다.
    const first = new Map();
    for (const id of main.parts) for (const to of softTo(id)) if (["skill", "agent"].includes(byId.get(to)?.kind) && !first.has(to)) first.set(to, id);
    const second = new Map();
    for (const id of first.keys())
    {
        const node = byId.get(id);
        for (const to of softTo(id)) if (byId.get(to)?.kind === "skill" && !first.has(to) && !second.has(to)) second.set(to, { via: id, files: 0 });
        for (const r of node.refs ?? [])
        {
            const target = r.resolved && skillOfPath(r.resolved);
            if (!target || target.id === id || first.has(target.id)) continue;
            const hit = second.get(target.id) ?? { via: id, files: 0 };
            hit.files++;
            second.set(target.id, hit);
        }
    }
    const docs = [...new Set(loaded.flatMap((n) => (n.refs ?? []).filter((r) => r.resolved && /^docs\//.test(r.resolved)).map((r) => r.resolved)))];
    return {
        id: `${cell.area.id}|${cell.scope}`, area: cell.area.id, areaLabel: cell.area.label, scope: cell.scope, files: cell.files,
        example: main.example, exampleFiles: main.files, variants: cell.byStack.size,
        folder, layer, common, domain, chars: { folder: sum(folder), layer: sum(layer), common: sum(common), domain: sum(domain) },
        skills: [...first].map(([id, via]) => ({ id, via })), next: [...second].map(([id, v]) => ({ id, ...v })), docs: docs.slice(0, 8), docCount: docs.length,
    };
}).sort((a, b) => areas.find((x) => x.id === a.area).order - areas.find((x) => x.id === b.area).order || b.files - a.files);

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
            action: `그 폴더에만 걸리는 내용이면 \`${s.narrow.dir}/CLAUDE.md\` 로 옮기고 이 지시문에는 한 줄만 남깁니다. 다른 앱에도 같은 규약이 있으면 폴더 이름 기준의 경로 규칙 하나로 묶습니다.`,
            saves: s.chars,
        });
    }
}

const lineSet = (text) => new Set(text.split("\n").map((l) => l.trim()).filter((l) => l.length >= 12 && !l.startsWith("#")));
// 도구가 써 넣고 다시 써 넣는 블록(`<!-- BEGIN:nextjs-agent-rules -->` … `<!-- END:… -->`)은 겹침으로 세지 않습니다.
// 앱마다 같은 글이 있는 것이 정상이고, 지워도 `next dev` 가 다시 만들어 고칠 길이 없습니다.
const withoutGenerated = (t) => t.replace(/<!--\s*BEGIN:([\w-]+)\s*-->[\s\S]*?<!--\s*END:\1\s*-->/g, "");
const secs = nodes.filter((x) => ["root", "nested", "rule"].includes(x.kind)).flatMap((node) => sections(withoutGenerated(read(node.path))).filter((s) => s.chars >= 400).map((s) => ({ node, title: s.title, chars: s.chars, set: lineSet(s.text) })));
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
// 제목만 같고 내용이 다른 섹션(「지금 선 것」 · 「명령어」처럼 폴더마다 쓰는 틀)은 같은 규약의 사본이 아닙니다.
// 낱말 집합이 얼마나 겹치는지 재서 겹침이 작은 짝은 빼고, 서로 이어지는 섹션이 둘 이상 남을 때만 알립니다.
const words = (text) => new Set((text.match(/[\p{L}\p{N}_]{2,}/gu) ?? []).map((w) => w.toLowerCase()));
const similarity = (a, b) =>
{
    let both = 0;
    for (const w of a) if (b.has(w)) both++;
    return both / (a.size + b.size - both || 1);
};
const SAME_TOPIC_MIN = 0.2;
for (const s of secs) s.words = words([...s.set].join("\n"));
for (const [title, all] of [...byTitle])
{
    const g = all.filter((s) => all.some((o) => o !== s && o.node !== s.node && similarity(s.words, o.words) >= SAME_TOPIC_MIN));
    if (new Set(g.map((s) => s.node.id)).size < 2) continue;
    const top = Math.max(...g.flatMap((s) => g.filter((o) => o !== s).map((o) => similarity(s.words, o.words))));
    suggestions.push({
        id: `same-topic:${title}`, kind: "placement", severity: "low", confidence: "heuristic", targets: [...new Set(g.map((s) => s.node.id))],
        title: `「${title}」 섹션을 폴더 ${g.length}곳이 따로 적고 있습니다`,
        evidence: `${g.map((s) => `${s.node.title} ${s.chars.toLocaleString()}자`).join(", ")}. 제목이 같고 낱말이 최대 ${Math.round(top * 100)}% 겹칩니다. 같은 규약의 다른 사본인지, 폴더마다 정말 다른 규약인지는 읽어 봐야 압니다.`,
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

const free = named.filter((n) => n.level === 5 && n.kind === "skill" && n.listing === "on").sort((a, b) => b.listingChars - a.listingChars);
if (free.length)
{
    const freeChars = free.reduce((a, n) => a + n.listingChars, 0);
    suggestions.push({
        id: "free-skills", kind: "demote", severity: freeChars / alwaysChars >= 0.3 ? "high" : "medium", confidence: "needs-test", targets: free.map((n) => n.id),
        title: `항상 로드되는 내용의 ${Math.round(freeChars / alwaysChars * 100)}% 는 아무 지시문도 언급하지 않는 스킬 ${free.length}종의 설명입니다`,
        evidence: `설명 ${freeChars.toLocaleString()}자가 모든 세션에 로드되는데, 어느 지시문도 이 스킬들의 이름을 언급하지 않습니다. 본문이 읽힐지는 모델이 설명만 보고 정합니다. 긴 것부터 ${free.slice(0, 3).map((n) => `\`${n.name}\` ${n.listingChars.toLocaleString()}자`).join(", ")} 입니다.`,
        action: "기록과 시나리오에서 한 번도 호출되지 않은 스킬을 고릅니다. 사람이 직접 호출할 때만 쓰는 것은 `.claude/settings.json` 의 `skillOverrides` 에 `user-invocable-only` 로 적어 목록에서 빼고, 안 쓰는 것은 `off` 로 끄거나 지웁니다. 꼭 읽혀야 하는 것은 그 작업의 경로 규칙에서 이름을 언급합니다.",
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

// ── 겹침과 빈칸 ─────────────────────────────────────────────────────────────
// 지시문끼리는 우선순위가 없습니다. 모두 이어 붙여 로드되고, 서로 어긋나면 어느 쪽을 따를지 정해져 있지 않습니다.
// 그래서 같은 말은 한 곳에만 두고(겹침 없이), 건드리는 파일마다 필요한 규약이 빠짐없이 로드되게(빈칸 없이) 맞춥니다.
const pathRules = nodes.filter((n) => n.source === "rule-paths");
const domainRules = pathRules.filter((n) => n.role === "domain");
const matchSet = new Map(pathRules.map((n) => [n.id, new Set(files.filter((x) => n.globs.some((g) => new RegExp(g.re).test(x))))]));

// 같은 용어가 두 곳에 정의됨
const termHomes = new Map();
for (const n of nodes.filter((x) => ["root", "nested", "rule"].includes(x.kind)))
{
    for (const term of new Set(termsOf(read(n.path)))) termHomes.set(term, [...(termHomes.get(term) ?? []), n.id]);
}
const termDups = [...termHomes].filter(([, ids]) => ids.length >= 2);
const dupByPair = new Map();
for (const [term, ids] of termDups) dupByPair.set(ids.join("+"), { ids, terms: [...(dupByPair.get(ids.join("+"))?.terms ?? []), term] });
for (const { ids, terms } of dupByPair.values())
{
    suggestions.push({
        id: `term-dup:${ids.join("+")}`, kind: "mece", severity: "high", confidence: "measured", targets: ids,
        title: `용어 ${terms.length}개가 ${ids.length}곳에 정의되어 있습니다`,
        evidence: `${terms.slice(0, 8).map((t) => `「${t}」`).join(", ")}${terms.length > 8 ? ` 외 ${terms.length - 8}개` : ""}. ${ids.map((id) => byId.get(id).title).join(", ")} 에 각각 있습니다. 두 곳이 함께 로드되면 어느 뜻을 따를지 정해져 있지 않고, 한 곳만 고치면 어긋납니다.`,
        action: "용어마다 그 말을 소유한 도메인 한 곳에만 정의합니다. 다른 도메인이 같은 말을 쓰면 정의하지 않고 소유한 쪽의 규칙 경로에 그 폴더를 더합니다.",
        items: terms,
    });
}

// 용어 표가 항상 로드되거나 폴더 지시문에 있음
for (const n of nodes.filter((x) => ["root", "nested"].includes(x.kind)))
{
    for (const sec of sections(read(n.path)).filter((x) => termsOf(x.text).length >= 3))
    {
        const terms = termsOf(sec.text);
        suggestions.push({
            id: `terms-home:${n.id}:${sec.title}`, kind: "mece", severity: n.kind === "root" ? "medium" : "low", confidence: "heuristic", targets: [n.id, ...domainRules.slice(0, 3).map((x) => x.id)],
            title: `${n.title} 의 「${sec.title}」 용어 ${terms.length}개는 도메인 용어 규칙으로 옮길 수 있습니다`,
            evidence: n.kind === "root"
                ? `${sec.chars.toLocaleString()}자가 모든 세션에 로드됩니다. 용어는 그 도메인의 코드를 건드릴 때만 필요합니다.${domainRules.length ? ` 도메인 용어 규칙이 이미 ${domainRules.length}개 있습니다.` : " 아직 도메인 용어 규칙이 없습니다."}`
                : `${sec.chars.toLocaleString()}자가 이 폴더에서만 로드됩니다. 같은 도메인의 코드가 패키지나 다른 앱에도 있으면 그곳에서는 이 용어가 보이지 않습니다.`,
            action: "`.claude/rules/glossary/<도메인>.md` 를 만들고 `paths` 에 그 도메인의 코드가 있는 폴더(도메인 패키지 · 앱의 해당 폴더 · 어댑터)를 적습니다. 표는 용어 · 뜻 · 코드 이름 · 쓰지 않는 말 네 칸으로 두고 비즈니스 규칙은 넣지 않습니다.",
            items: terms, saves: n.kind === "root" ? sec.chars : undefined,
        });
    }
}

// 두 규칙이 거의 같은 파일에 걸림
for (let i = 0; i < pathRules.length; i++)
{
    for (let j = i + 1; j < pathRules.length; j++)
    {
        const [a, b] = [pathRules[i], pathRules[j]];
        if (a.role !== b.role) continue;
        // 둘 다 저장소 대부분에 걸리는 규칙이면 「broad:」 제안이 이미 다룹니다.
        if (a.matchedFiles / files.length >= 0.5 && b.matchedFiles / files.length >= 0.5) continue;
        const [sa, sb] = [matchSet.get(a.id), matchSet.get(b.id)];
        if (sa.size < 5 || sb.size < 5) continue;
        let both = 0;
        for (const f of sa) if (sb.has(f)) both++;
        const share = both / Math.min(sa.size, sb.size);
        if (share < 0.8 || both / Math.max(sa.size, sb.size) < 0.5) continue;
        suggestions.push({
            id: `rule-overlap:${a.id}+${b.id}`, kind: "mece", severity: "low", confidence: "measured", targets: [a.id, b.id],
            title: `${a.title} 와 ${b.title} 규칙은 거의 같은 파일에 걸립니다`,
            evidence: `두 규칙의 경로에 함께 맞는 파일이 ${both.toLocaleString()}개로, 작은 쪽의 ${Math.round(share * 100)}% 입니다. 그 파일을 열면 두 규칙 ${(a.chars + b.chars).toLocaleString()}자가 늘 함께 로드되므로 나눠 둔 효과가 없습니다.`,
            action: "같은 주제면 하나로 합칩니다. 다른 주제면 각 규칙의 경로를 그 주제가 실제로 걸리는 폴더나 파일 종류로 좁혀 서로 겹치지 않게 합니다.",
        });
    }
}

// 규칙이 자세한 내용을 폴더 지시문에 넘기는데, 그 폴더 지시문은 규칙이 걸리는 파일 일부에서만 로드됨
for (const n of pathRules)
{
    for (const to of softTo(n.id).map((id) => byId.get(id)).filter((x) => x?.kind === "nested"))
    {
        const set = matchSet.get(n.id);
        const inside = [...set].filter((f) => f.startsWith(to.dir)).length;
        if (!set.size || inside / set.size >= 0.8) continue;
        suggestions.push({
            id: `defer:${n.id}:${to.id}`, kind: "mece", severity: n.chars < 1200 ? "medium" : "low", confidence: "measured", targets: [n.id, to.id],
            title: `${n.title} 규칙이 넘기는 ${to.title} 지시문은 규칙이 걸리는 파일의 ${Math.round(inside / set.size * 100)}% 에서만 로드됩니다`,
            evidence: `이 규칙은 파일 ${set.size.toLocaleString()}개에 걸리는데 \`${to.path}\` 는 그 가운데 \`${to.dir}\` 아래 ${inside.toLocaleString()}개를 열 때만 자동으로 로드됩니다. 나머지 ${(set.size - inside).toLocaleString()}개에서는 규칙이 가리키는 내용이 보이지 않고, 모델이 그 파일을 따로 읽어야 합니다.`,
            action: "여러 폴더에 공통인 규약이면 그 내용을 규칙으로 옮기고 폴더 지시문에는 그 폴더만의 차이를 남깁니다. 그 폴더에만 해당하면 규칙의 경로를 그 폴더로 좁힙니다.",
        });
    }
}

// 영역의 빈칸: 같은 영역인데 어떤 위치에는 계층 규칙이 걸리고 어떤 위치에는 걸리지 않음
for (const area of areas)
{
    const row = flows.filter((f) => f.area === area.id);
    const total = row.reduce((a, f) => a + f.files, 0);
    const own = (f) => f.layer;
    const covered = row.filter((f) => own(f).length);
    const bare = row.filter((f) => !covered.includes(f));
    if (!row.length || total < 5 || ["package", "app"].includes(area.id)) continue;
    if (covered.length && bare.length)
    {
        suggestions.push({
            id: `gap:${area.id}`, kind: "mece", severity: bare.reduce((a, f) => a + f.files, 0) >= 20 ? "medium" : "low", confidence: "measured", targets: [...new Set(covered.flatMap(own))],
            title: `${area.label} 영역은 ${bare.length}곳에서 계층 규칙이 로드되지 않습니다`,
            evidence: `${covered.map((f) => f.scope).slice(0, 4).join(", ")} 에서는 ${[...new Set(covered.flatMap(own))].map((id) => byId.get(id).title).join(", ")} 규칙이 걸리는데, ${bare.map((f) => `${f.scope}(${f.files.toLocaleString()}개)`).slice(0, 6).join(", ")}${bare.length > 6 ? ` 외 ${bare.length - 6}곳` : ""} 에서는 걸리지 않습니다. 같은 종류의 파일인데 위치에 따라 규약이 보이기도 하고 안 보이기도 합니다.`,
            action: "같은 규약을 따라야 하는 곳이면 규칙의 `paths` 를 폴더 이름 기준(`apps/*/src/...`)으로 넓힙니다. 일부러 다르게 둔 곳이면 그대로 둡니다.",
        });
    }
    else if (!covered.length && total >= 20)
    {
        const inFolder = row.filter((f) => f.folder.length);
        suggestions.push({
            id: `no-layer:${area.id}`, kind: "mece", severity: "low", confidence: "heuristic", targets: [...new Set(row.flatMap((f) => f.folder))].slice(0, 6),
            title: `${area.label} 영역에는 계층 규칙이 없습니다`,
            evidence: `${row.length}곳에 파일 ${total.toLocaleString()}개가 있습니다.${inFolder.length ? ` ${inFolder.length}곳에서는 폴더 지시문만 로드됩니다. 그 안에 이 영역의 규약이 있는지는 읽어 봐야 알고, 있더라도 그 폴더의 다른 종류 파일을 열 때도 함께 로드됩니다.` : " 이 파일을 열어도 그 종류에 맞는 규약은 로드되지 않습니다."}`,
            action: `이 영역을 만드는 규약(금지와 핵심)이 여러 곳에 공통이면 \`paths: ${JSON.stringify(area.paths.slice(0, 2))}\` 인 계층 규칙 하나로 둡니다. 1,500자 안팎으로 쓰고 절차와 예시는 스킬로 넘깁니다.`,
        });
    }
}

// 도메인 용어 규칙이 있는데 일부 패키지에는 걸리지 않음
if (domainRules.length)
{
    const bare = flows.filter((f) => f.area === "package" && !f.domain.length && f.files >= 5);
    if (bare.length)
    {
        suggestions.push({
            id: "no-glossary", kind: "mece", severity: "low", confidence: "heuristic", targets: domainRules.slice(0, 4).map((n) => n.id),
            title: `패키지 ${bare.length}곳에는 도메인 용어 규칙이 걸리지 않습니다`,
            evidence: `${bare.map((f) => f.scope).slice(0, 10).join(", ")}${bare.length > 10 ? ` 외 ${bare.length - 10}곳` : ""}. 도메인 용어 규칙은 ${domainRules.length}개 있습니다.`,
            action: "고유한 용어가 있는 도메인 패키지면 용어 규칙을 만듭니다. 기반 패키지(공용 UI · DB 연결 등)처럼 도메인 용어가 없는 곳은 그대로 둡니다.",
            items: bare.map((f) => f.scope),
        });
    }
}

// 긴 규칙: 규칙은 금지와 핵심만 두고 절차와 예시는 스킬로 넘김
const RULE_TARGET = 1500;
// 계층 규칙만이 아니라 영역을 가리지 않는 규칙도 봅니다. 영역이 정해지지 않았다고 길이 검사에서 빠지면 안 됩니다.
for (const n of pathRules.filter((x) => x.role !== "domain" && x.chars >= RULE_TARGET * 2))
{
    const skills = softTo(n.id).filter((id) => byId.get(id)?.kind === "skill");
    const code = (read(n.path).match(/^```/gm) ?? []).length / 2;
    suggestions.push({
        id: `long-rule:${n.id}`, kind: "mece", severity: n.chars >= RULE_TARGET * 4 ? "medium" : "low", confidence: "heuristic", targets: [n.id, ...skills],
        title: `${n.title} 규칙은 ${n.chars.toLocaleString()}자로 깁니다`,
        evidence: `파일 ${n.matchedFiles.toLocaleString()}개 가운데 하나만 열어도 전부 로드됩니다.${code >= 1 ? ` 코드 예시가 ${Math.floor(code)}개 들어 있습니다.` : ""} ${skills.length ? `이미 ${skills.map((id) => `\`${byId.get(id).name}\``).join(", ")} 스킬을 가리킵니다.` : "스킬을 가리키는 줄은 없습니다."}`,
        action: skills.length
            ? "금지와 핵심만 남기고(1,500자 안팎) 절차와 예시는 이미 가리키는 스킬로 옮깁니다."
            : "금지와 핵심만 남기고(1,500자 안팎) 절차와 예시는 스킬로 옮깁니다. 규칙의 마지막 줄에 「…할 때는 `.claude/skills/<이름>/SKILL.md` 를 연다」처럼 조건과 경로를 적습니다.",
        saves: n.chars - RULE_TARGET,
    });
}

// 규칙이 가리키는 스킬은 규칙이 입구이므로 설명을 항상 로드할 필요가 없음
const pointed = nodes.filter((n) => n.kind === "skill" && n.listing === "on" && n.namedBy.length && n.namedBy.every((id) => byId.get(id).level === 2));
if (pointed.length)
{
    const save = pointed.reduce((a, n) => a + n.listingChars - chars(n.name), 0);
    suggestions.push({
        id: "pointed-skills", kind: "mece", severity: save >= 2000 ? "medium" : "low", confidence: "needs-test", targets: pointed.map((n) => n.id),
        title: `스킬 ${pointed.length}종은 경로 규칙이나 폴더 지시문이 가리키므로 설명을 항상 로드하지 않아도 됩니다`,
        evidence: `이 스킬들은 해당하는 파일을 열 때 로드되는 지시문이 이름을 적어 안내합니다. 그런데 설명 ${pointed.reduce((a, n) => a + n.listingChars, 0).toLocaleString()}자가 모든 세션에도 로드되어 같은 안내가 두 번 들어갑니다.`,
        action: "`.claude/settings.json` 의 `skillOverrides` 에 이 스킬들을 `name-only`(이름만 남김)나 `user-invocable-only`(목록에서 뺌)로 적습니다. 목록에서 뺄 때는 지시문에 이름 대신 `SKILL.md` 의 경로를 적어야 모델이 읽을 수 있습니다. 바꾼 뒤 시나리오로 그 스킬이 여전히 읽히는지 확인합니다.",
        items: pointed.map((n) => n.name), saves: save,
    });
}

// 목록에서 뺀 스킬을 이름으로만 가리키면 모델이 찾지 못함
for (const n of nodes.filter((x) => x.kind === "skill" && ["user-invocable-only", "off"].includes(x.listing)))
{
    const byName = n.namedBy.filter((id) => !read(byId.get(id).path).includes(n.path.slice(0, -"SKILL.md".length)));
    if (!byName.length) continue;
    suggestions.push({
        id: `hidden-skill:${n.id}`, kind: "dead-ref", severity: "medium", confidence: "measured", targets: [n.id, ...byName],
        title: `${byName.map((id) => byId.get(id).title).join(", ")} 이 목록에 없는 \`${n.name}\` 스킬을 이름으로만 가리킵니다`,
        evidence: "이 스킬은 설정이 목록에서 빼 두어서 모델이 이름으로 호출할 수 없습니다.",
        action: `가리키는 줄에 \`${n.path}\` 경로를 적습니다.`,
    });
}

// `hooks/{usage,inquiries}/CLAUDE.md` 처럼 중괄호로 묶어 적은 경로를 펼쳐서 봅니다.
const expandBraces = (text) => text.replace(/([^\s`{}]*)\{([^{}\s]+,[^{}\s]+)\}([^\s`{}]*)/g, (_, a, list, b) => list.split(",").map((x) => a + x + b).join(" "));
// 앱 지시문이 색인 역할을 하는지: 하위 폴더의 지시문을 상위가 적어 두지 않으면 있는지조차 알 수 없음
for (const n of nested)
{
    const parent = [...nested].reverse().find((p) => p !== n && n.dir.startsWith(p.dir));
    if (!parent || expandBraces(read(parent.path)).includes(n.dir.slice(parent.dir.length).replace(/\/$/, ""))) continue;
    suggestions.push({
        id: `unindexed:${n.id}`, kind: "mece", severity: "low", confidence: "measured", targets: [parent.id, n.id],
        title: `${parent.title} 지시문에 하위 폴더 \`${n.dir.slice(parent.dir.length)}\` 의 지시문이 적혀 있지 않습니다`,
        evidence: `\`${n.path}\` 는 그 폴더의 파일을 열 때만 로드됩니다. 상위 지시문이 어디에 무엇이 있는지 적어 두지 않으면, 그 폴더를 열지 않은 세션은 그런 규약이 있다는 것을 알 수 없고 같은 내용을 상위에 다시 적게 됩니다.`,
        action: "상위 지시문에 하위 폴더 지시문의 목록을 한 줄씩 둡니다(폴더 · 무엇을 다루나).",
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
    meta: { areas: [...areas].sort((a, b) => a.order - b.order).map(({ id, label, paths }) => ({ id, label, paths })), repo: basename(root), commit, generatedAt: new Date().toISOString(), limits: LIMITS, notes: ["항상 로드되는 내용은 이 저장소의 루트 CLAUDE.md · 규칙 · `.claude/skills` · `.claude/agents` 만 셉니다. 켜 둔 플러그인과 사용자 설정의 스킬 설명은 세션마다 달라서 빠져 있습니다."], files: files.length, sourceFiles: src.length, alwaysChars, sources },
    nodes, edges, stacks, flows, suggestions,
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(map));
console.log(`맵: 노드 ${nodes.length} · 간선 ${edges.length} · 플로우 ${flows.length} · 제안 ${suggestions.length} · 항상 로드되는 내용 ${alwaysChars.toLocaleString()}자 → ${out}`);

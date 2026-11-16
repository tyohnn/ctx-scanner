#!/usr/bin/env node
// 맵 · 기록 · 시나리오 결과를 보고서 템플릿에 채워 HTML 문서 하나를 냅니다.
// 쓰는 법: node build-report.mjs [--root <저장소>] [--data <자료 폴더>] [--title <제목>] [--out <report.html>] [--baseline <지난 자료 폴더> --baseline-label <이름>]
// 자료 폴더에서 map.json · traces/ · tests.json · advice.json 을 찾아 있는 것만 넣습니다.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { argOf, dataDir } from "./lib-paths.mjs";
import { readTrace } from "./lib-trace.mjs";

const arg = argOf(process.argv.slice(2));
const root = resolve(arg("root", process.cwd()));
const data = resolve(arg("data", dataDir(root)));
const here = dirname(fileURLToPath(import.meta.url));
const template = readFileSync(join(here, "..", "templates", "report.html"), "utf8");
const SLOT = /(<script id="ctxscope-data" type="application\/json">)[\s\S]*?(<\/script>)/;
if (!SLOT.test(template)) throw new Error("보고서 템플릿에 자료 칸이 없습니다");

const json = (name) => existsSync(join(data, name)) ? JSON.parse(readFileSync(join(data, name), "utf8")) : null;
const map = json("map.json");
if (!map) throw new Error(`맵이 없습니다. 먼저 scan.mjs 를 돌립니다: ${join(data, "map.json")}`);
const traces = [];
let skipped = 0;
const dir = join(data, "traces");
if (existsSync(dir))
{
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".jsonl")))
    {
        const t = readTrace(join(dir, f), map);
        if (!t) continue;
        // 마지막 줄이 「응답 끝」이 아닌 기록은 아직 진행 중인 세션입니다. 보고서를 만드는 이 세션이 대개 그렇고, 측정하는 동안의
        // 도구 호출이 결과에 섞이지 않도록 뺍니다. 넣으려면 `--include-open` 을 줍니다.
        if (t.rows.at(-1)?.kind !== "stop" && !process.argv.includes("--include-open")) { skipped++; continue; }
        traces.push(t);
    }
    traces.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}
const tests = json("tests.json");

// 기록이 있으면 「아무 지시문도 언급하지 않는 스킬」 제안에 실제로 호출된 것과 안 호출된 것을 덧붙입니다.
const free = map.suggestions.find((s) => s.id === "free-skills");
if (free && traces.length)
{
    const called = new Set(traces.flatMap((t) => t.totals.skills.map((x) => String(x).split(":").pop())));
    const used = free.items.filter((x) => called.has(x));
    free.evidence += ` 세션 ${traces.length}건의 기록에서는 이 가운데 ${used.length ? used.map((x) => `\`${x}\``).join(", ") + ` ${used.length}종만 호출됐습니다.` : "하나도 호출되지 않았습니다."}`;
}

// 에이전트가 내용을 읽고 내린 판단은 advice.json 으로 받습니다. 같은 id 는 스크립트가 낸 제안을 덮어씁니다.
const advice = json("advice.json");
for (const a of advice?.suggestions ?? [])
{
    const i = map.suggestions.findIndex((s) => s.id === a.id);
    if (i >= 0) map.suggestions[i] = { ...map.suggestions[i], ...a };
    else map.suggestions.push(a);
}
const order = { high: 0, medium: 1, low: 2 };
map.suggestions.sort((a, b) => order[a.severity] - order[b.severity]);

// 지난 측정의 맵이 있으면 요약 화면이 항상 로드되는 양을 그것과 견줍니다.
const baselineDir = arg("baseline");
const baselineMap = baselineDir ? JSON.parse(readFileSync(join(resolve(baselineDir), "map.json"), "utf8")) : null;
const baseline = baselineMap ? { label: arg("baseline-label") ?? "지난 측정", alwaysChars: baselineMap.meta.alwaysChars, commit: baselineMap.meta.commit } : null;

const report = { title: arg("title") ?? null, map, traces, tests, baseline };
// 내용 속의 닫는 태그가 문서를 끊지 않게 합니다.
const body = JSON.stringify(report).replace(/</g, "\\u003c");
const out = resolve(arg("out", join(data, "report.html")));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, template.replace(SLOT, (_, a, b) => a + body + b));
console.log(`보고서: 맵 노드 ${map.nodes.length} · 기록 ${traces.length}건${skipped ? `(진행 중인 기록 ${skipped}건 뺌)` : ""} · 시나리오 ${tests?.scenarios?.length ?? 0}개 → ${out}`);

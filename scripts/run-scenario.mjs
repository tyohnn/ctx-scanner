#!/usr/bin/env node
// 시나리오를 새 세션으로 여러 번 돌리고, 세션이 남긴 기록만 보고 판정합니다.
// 세션에는 요청 문장만 건넵니다. 가설과 기대는 건네지 않습니다. 건네면 모델이 그 답을 맞히러 갑니다.
// 쓰는 법: node run-scenario.mjs --scenarios <scenarios.json> [--root <저장소>] [--data <자료 폴더>] [--concurrency 3] [--max-turns 20] [--reuse [--rerun <id,id>]]
// `--reuse` 는 자료 폴더의 tests.json 에 이미 세션이 있는 시나리오를 다시 돌리지 않고 판정만 다시 합니다. 기대(`expect`)만 고쳤을 때 씁니다.
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { argOf, dataDir } from "./lib-paths.mjs";
import { readTrace } from "./lib-trace.mjs";

const arg = argOf(process.argv.slice(2));
const root = resolve(arg("root", process.cwd()));
const data = resolve(arg("data", dataDir(root)));
const plugin = join(dirname(fileURLToPath(import.meta.url)), "..");
const spec = JSON.parse(readFileSync(resolve(arg("scenarios")), "utf8"));
const concurrency = Number(arg("concurrency", 3));
const maxTurns = arg("max-turns", "20");
mkdirSync(join(data, "traces"), { recursive: true });

const sh = (cmd, args, opts) => new Promise((done) => execFile(cmd, args, { maxBuffer: 1 << 28, ...opts }, (err, stdout) => done({ err, stdout })));

// 세션마다 작업 폴더를 따로 떼어 줍니다. 한 세션이 고친 파일이 다음 세션의 출발점을 바꾸면 안 됩니다.
async function runOnce(prompt)
{
    const dir = mkdtempSync(join(tmpdir(), "context-scanner-"));
    execFileSync("git", ["-C", root, "worktree", "add", "--detach", "--force", dir, "HEAD"], { stdio: "ignore" });
    try
    {
        const { stdout } = await sh("claude", ["-p", prompt, "--plugin-dir", plugin, "--permission-mode", "acceptEdits", "--max-turns", maxTurns, "--output-format", "json"], {
            cwd: dir, timeout: 600000, env: { ...process.env, CONTEXT_SCANNER_DIR: data, CONTEXT_SCANNER_PROMPT_PREVIEW: "1" },
        });
        try { return JSON.parse(stdout).session_id ?? null; }
        catch { return null; }
    }
    finally
    {
        execFileSync("git", ["-C", root, "worktree", "remove", "--force", dir], { stdio: "ignore" });
    }
}

const own = spec.scenarios.filter((s) => !s.sameRunsAs);
// 지난 결과의 세션을 다시 씁니다. 기록이 남아 있는 세션만 쓰고, `--rerun` 에 적은 시나리오는 새로 돌립니다.
const rerun = new Set(String(arg("rerun", "")).split(",").filter(Boolean));
const prior = process.argv.includes("--reuse") && existsSync(join(data, "tests.json")) ? JSON.parse(readFileSync(join(data, "tests.json"), "utf8")).scenarios : [];
const kept = new Map(own.filter((s) => !rerun.has(s.id)).map((s) => [s.id, (prior.find((p) => p.id === s.id)?.runs ?? []).filter((r) => existsSync(join(data, "traces", `${r.session}.jsonl`))).map((r) => ({ scenario: s.id, variant: r.variant, prompt: r.prompt, session: r.session }))]).filter(([, runs]) => runs.length));
const jobs = own.filter((s) => !kept.has(s.id)).flatMap((s) => Array.from({ length: s.runs ?? 5 }, (_, i) => ({ scenario: s.id, variant: i % s.variants.length, prompt: s.variants[i % s.variants.length] })));
const sessions = new Map(own.map((s) => [s.id, kept.get(s.id) ?? []]));
for (const [id, runs] of kept) console.log(`${id}: 지난 세션 ${runs.length}개로 판정만 다시 합니다`);
let next = 0;
await Promise.all(Array.from({ length: concurrency }, async () =>
{
    while (next < jobs.length)
    {
        const job = jobs[next++];
        const session = await runOnce(job.prompt);
        console.log(`${job.scenario} #${job.variant} → ${session ?? "기록 없음"}`);
        if (session) sessions.get(job.scenario).push({ ...job, session });
    }
}));

const has = (list, x) => list.some((y) => y === x || y.endsWith(`:${x}`));
const scenarios = spec.scenarios.map((s) =>
{
    const runs = (sessions.get(s.sameRunsAs ?? s.id) ?? []).map((job) =>
    {
        const t = readTrace(join(data, "traces", `${job.session}.jsonl`), null);
        const skills = t.rows.filter((r) => r.kind === "skill").map((r) => r.name);
        const loads = t.rows.filter((r) => r.kind === "instruction").map((r) => r.name);
        const e = s.expect ?? {};
        const want = [...(e.skills ?? []).map((x) => [x, has(skills, x)]), ...(e.loads ?? []).map((x) => [x, loads.includes(x)])];
        const ban = [...(e.notSkills ?? []).map((x) => [x, has(skills, x)]), ...(e.notLoads ?? []).map((x) => [x, loads.includes(x)])];
        // 로드되지는 않았지만 세션이 Read 나 Bash(cat · sed · grep)로 그 파일을 직접 읽은 경우를 따로 적습니다. 판정은 그대로 「빠짐」입니다.
        const raw = readFileSync(join(data, "traces", `${job.session}.jsonl`), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.ev === "PreToolUse");
        const read = raw.flatMap((r) => [...(r.reads ?? []), ...(r.tool === "Read" ? [String(r.target ?? "")] : [])]);
        const direct = (x, file) => read.some((p) => p === file || p.endsWith(`/${file}`)) ? [x] : [];
        const readDirect = [...want.filter(([, ok]) => !ok).flatMap(([x]) => (e.loads ?? []).includes(x) ? direct(x, x) : direct(x, `skills/${x.split(":").pop()}/SKILL.md`))];
        const first = t.rows.filter((r) => (r.kind === "skill" && (e.skills ?? []).some((x) => has([r.name], x))) || (r.kind === "instruction" && (e.loads ?? []).includes(r.name))).map((r) => r.at);
        return {
            session: job.session, variant: job.variant, prompt: job.prompt,
            pass: want.every(([, ok]) => ok) && ban.every(([, hit]) => !hit),
            hit: [...want.filter(([, ok]) => ok).map(([x]) => x)], missed: [...want.filter(([, ok]) => !ok).map(([x]) => x), ...ban.filter(([, hit]) => hit).map(([x]) => `${x} (로드되면 안 됨)`)],
            readDirect, firstLoadAt: first.length ? Math.min(...first) : null, duration: t.duration,
        };
    });
    return { id: s.id, hypothesis: s.hypothesis, control: !!s.control, variants: kept.has(s.sameRunsAs ?? s.id) ? [...new Set(runs.map((r) => r.prompt))] : s.variants ?? spec.scenarios.find((x) => x.id === s.sameRunsAs)?.variants ?? [], expect: s.expect ?? {}, runs };
});
const out = join(data, "tests.json");
writeFileSync(out, JSON.stringify({ ranAt: new Date().toISOString(), scenarios }, null, 1));
for (const s of scenarios) console.log(`${s.id}: ${s.runs.filter((r) => r.pass).length} / ${s.runs.length}  ${s.hypothesis}`);
console.log(`→ ${out}`);

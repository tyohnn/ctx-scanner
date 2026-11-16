// 수집기가 적은 줄을 화면이 그리는 모양으로 고칩니다. 맵을 받으면 이벤트를 맵의 노드에 연결합니다.
import { readFileSync } from "node:fs";

// 맵에 없는 지시문(저장소 밖의 사용자 지시문 등)은 로드된 이유로 출처를 추정합니다.
const SOURCE_BY_REASON = { nested_traversal: "folder", path_glob_match: "rule-paths" };
const READ_COMMANDS = new Set(["cat", "head", "tail", "sed", "grep", "rg", "less", "awk", "find", "ls", "wc"]);

export function readTrace(file, map)
{
    const rows = readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).sort((a, b) => a.t - b.t);
    if (!rows.length) return null;
    const t0 = rows[0].t;
    const nodes = new Map((map?.nodes ?? []).map((n) => [n.id, n]));
    const skillByName = new Map((map?.nodes ?? []).filter((n) => n.kind === "skill" || n.kind === "agent").map((n) => [n.name, n]));
    const post = new Map(rows.filter((r) => r.ev === "PostToolUse").map((r) => [r.id, r]));
    const out = [];
    let prompt = null;
    let model = null;

    for (const r of rows)
    {
        const at = r.t - t0;
        const agent = r.agent ?? null;
        if (r.ev === "SessionStart")
        {
            model = r.model ?? null;
            out.push({ at, dur: 0, kind: "session", name: "세션 시작", reason: r.source ?? "startup" });
        }
        else if (r.ev === "UserPromptSubmit")
        {
            prompt ??= { chars: r.chars, preview: r.preview ?? null };
            out.push({ at, dur: 0, kind: "prompt", name: r.preview ?? `프롬프트 ${r.chars}자`, chars: r.chars });
        }
        else if (r.ev === "InstructionsLoaded")
        {
            out.push({ at, dur: 0, kind: "instruction", name: r.path, reason: r.reason, trigger: r.trigger ?? null, parent: r.parent ?? null, chars: r.chars ?? 0, nodeId: nodes.has(r.path) ? r.path : null, source: nodes.get(r.path)?.source ?? SOURCE_BY_REASON[r.reason] ?? null, agent });
        }
        else if (r.ev === "PreToolUse")
        {
            const done = post.get(r.id);
            const base = { at, dur: done ? Math.max(done.ms ?? done.t - r.t, 1) : 0, open: !done, agent };
            if (r.tool === "Skill")
            {
                const node = skillByName.get(String(r.target ?? "").split(":").pop());
                out.push({ ...base, kind: "skill", name: r.target, reason: "skill_invoke", chars: node?.chars ?? 0, nodeId: node?.id ?? null });
            }
            else if (r.tool === "Task" || r.tool === "Agent")
            {
                const node = skillByName.get(r.target);
                out.push({ ...base, kind: "subagent", name: r.target ?? "서브에이전트", reason: "agent_spawn", chars: done?.chars ?? 0, nodeId: node?.id ?? null });
            }
            else
            {
                out.push({ ...base, kind: "tool", name: r.tool, target: r.target ?? null, reads: r.reads ?? null, chars: done?.chars ?? 0 });
            }
        }
        else if (r.ev === "PreCompact") out.push({ at, dur: 0, kind: "compact", name: "압축", reason: r.trigger ?? null });
        else if (r.ev === "Stop") out.push({ at, dur: 0, kind: "stop", name: "응답 끝" });
    }
    out.forEach((r, i) => { r.i = i; });

    const duration = rows.at(-1).t - t0;
    const instr = out.filter((r) => r.kind === "instruction");
    const onDemand = instr.filter((r) => r.reason !== "session_start");
    const firstOnDemand = onDemand[0];
    const findings = [];
    if (firstOnDemand)
    {
        const before = out.filter((r) => r.kind === "tool" && r.at < firstOnDemand.at && r.name === "Bash" && READ_COMMANDS.has(r.target));
        if (before.length >= 3)
        {
            findings.push({
                id: "bash-before-rules", severity: "medium",
                title: `처음 ${Math.round(firstOnDemand.at / 1000)}초 동안 폴더 규약 없이 일했습니다`,
                evidence: `그동안 Bash(${[...new Set(before.map((r) => r.target))].join(" · ")}) 로 ${before.length}번 살폈는데 규약은 하나도 로드되지 않았습니다. 규약은 Read 도구로 \`${firstOnDemand.trigger ?? "파일"}\` 을 열었을 때 처음 로드됐습니다.`,
                action: "루트에 「파일은 Read 로 연다」를 한 줄 두거나, 훅으로 Bash 의 cat · grep 을 Read · Grep 으로 돌립니다. 그 뒤 같은 시나리오로 규약이 로드되는 시점가 당겨지는지 봅니다.",
                rows: before.map((r) => r.i),
            });
        }
    }
    else if (out.some((r) => r.kind === "tool"))
    {
        findings.push({
            id: "no-on-demand", severity: "low", title: "이 세션에서는 폴더 규약과 경로 규칙이 하나도 로드되지 않았습니다",
            evidence: "세션이 시작될 때 로드된 것만으로 끝났습니다.", action: "규약이 필요한 작업이었다면 파일을 어떤 도구로 열었는지 봅니다.", rows: [],
        });
    }
    const big = [...onDemand].sort((a, b) => b.chars - a.chars)[0];
    const onDemandChars = onDemand.reduce((a, r) => a + r.chars, 0);
    if (big && onDemandChars > 30000)
    {
        findings.push({
            id: "heavy-open", severity: "low",
            title: `파일 몇 개를 열자 지시문 ${onDemandChars.toLocaleString()}자가 로드됐습니다`,
            evidence: `가장 큰 것은 \`${big.name}\` ${big.chars.toLocaleString()}자이고 \`${big.trigger ?? ""}\` 을 열 때 로드됐습니다. 모두 ${onDemand.length}개입니다.`,
            action: "큰 CLAUDE.md 는 섹션을 경로 규칙으로 나눠, 여는 파일에 맞는 섹션만 로드되게 합니다.",
            rows: onDemand.map((r) => r.i),
        });
    }

    // 폴더 지시문은 통째로 로드됩니다. 범위가 좁은 섹션(폴더의 한 곳만 다루는 섹션) 가운데 이 세션이 그곳을 열지 않은 것을 셉니다.
    const opened = [...new Set(out.flatMap((r) => [r.trigger, ["Read", "Edit", "Write"].includes(r.name) ? r.target : null, ...(r.reads ?? [])]).filter(Boolean))];
    const idle = [];
    for (const r of onDemand.filter((x) => x.source === "folder" && x.nodeId))
    {
        for (const s of nodes.get(r.nodeId).sections ?? [])
        {
            if (s.narrow && !opened.some((p) => p.includes(s.narrow.dir + "/"))) idle.push({ row: r.i, node: nodes.get(r.nodeId).title, title: s.title, chars: s.chars, dir: s.narrow.dir });
        }
    }
    const idleChars = idle.reduce((a, s) => a + s.chars, 0);
    if (idleChars >= 2000)
    {
        idle.sort((a, b) => b.chars - a.chars);
        findings.push({
            id: "idle-sections", severity: idleChars >= 8000 ? "medium" : "low",
            title: `폴더 지시문에서 이 세션이 열지 않은 곳의 섹션 ${idleChars.toLocaleString()}자가 함께 로드됐습니다`,
            evidence: `${idle.slice(0, 4).map((s) => `${s.node} 「${s.title}」 ${s.chars.toLocaleString()}자(\`${s.dir}/\`)`).join(", ")}${idle.length > 4 ? ` 외 ${idle.length - 4}개` : ""}. 폴더 지시문은 그 폴더의 어느 파일을 열어도 전부 로드되기 때문입니다. 경로 규칙이었다면 로드되지 않았을 내용입니다.`,
            action: "이 섹션들을 그 경로의 규칙으로 옮기면 그곳의 파일을 열 때만 로드됩니다.",
            rows: [...new Set(idle.map((s) => s.row))],
        });
    }

    const bySource = {};
    for (const r of instr)
    {
        const k = r.source ?? "other";
        bySource[k] = { count: (bySource[k]?.count ?? 0) + 1, chars: (bySource[k]?.chars ?? 0) + r.chars };
    }

    return {
        session: rows[0].session, startedAt: new Date(t0).toISOString(), model, prompt, duration, rows: out, findings,
        totals: {
            instructions: instr.length, instructionChars: instr.reduce((a, r) => a + r.chars, 0), bySource,
            skills: out.filter((r) => r.kind === "skill").map((r) => r.name),
            tools: out.filter((r) => r.kind === "tool").length, subagents: out.filter((r) => r.kind === "subagent").length,
            toolChars: out.filter((r) => r.kind === "tool").reduce((a, r) => a + r.chars, 0),
        },
    };
}

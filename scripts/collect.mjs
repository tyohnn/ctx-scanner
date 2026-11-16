#!/usr/bin/env node
// 훅이 부르는 수집기입니다. 한 사건을 한 줄로 적고 아무것도 내지 않습니다.
// 적는 것은 이름 · 경로 · 크기 · 시각뿐입니다. 파일의 내용과 도구의 입력 · 출력은 적지 않습니다.
// 어떤 까닭으로든 실패하면 조용히 끝냅니다. 수집기가 세션을 막아서는 안 됩니다.
import { appendFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, isAbsolute } from "node:path";

try
{
    const input = JSON.parse(readFileSync(0, "utf8"));
    const cwd = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
    const base = process.env.CTXSCOPE_DIR ?? process.env.CLAUDE_PLUGIN_DATA ?? join(homedir(), ".claude", "ctxscope");
    const dir = join(base, "traces");
    mkdirSync(dir, { recursive: true });

    const rel = (p) => typeof p === "string" && isAbsolute(p) && !relative(cwd, p).startsWith("..") ? relative(cwd, p) : p;
    const size = (p) =>
    {
        try { return [...readFileSync(p, "utf8")].length; }
        catch { return null; }
    };
    const ev = input.hook_event_name;
    const row = { t: Date.now(), ev, session: input.session_id };
    if (input.agent_id) row.agent = { id: input.agent_id, type: input.agent_type ?? null };

    if (ev === "InstructionsLoaded")
    {
        Object.assign(row, {
            path: rel(input.file_path), memoryType: input.memory_type, reason: input.load_reason,
            globs: input.globs, trigger: rel(input.trigger_file_path), parent: rel(input.parent_file_path), chars: size(input.file_path),
        });
    }
    else if (ev === "PreToolUse" || ev === "PostToolUse")
    {
        const ti = input.tool_input ?? {};
        row.tool = input.tool_name;
        row.id = input.tool_use_id;
        // 무엇을 향한 호출인지만 남깁니다. 명령은 첫 낱말만, 프롬프트와 내용은 길이만 남깁니다.
        row.target = rel(ti.file_path ?? ti.path ?? ti.notebook_path) ?? ti.skill ?? ti.subagent_type ?? ti.pattern ?? (typeof ti.command === "string" ? ti.command.trim().split(/\s+/)[0] : undefined);
        // Bash 로 파일을 읽으면 폴더 규약이 실리지 않습니다. 그 자리를 찾을 수 있게, 명령 속의 실제 파일 경로만 골라 남깁니다.
        if (input.tool_name === "Bash" && typeof ti.command === "string")
        {
            const reads = [...new Set(ti.command.split(/[\s"'|;&<>()]+/).filter((w) => w.includes("/") || w.includes(".")).filter((w) =>
            {
                try { return statSync(isAbsolute(w) ? w : join(cwd, w)).isFile(); }
                catch { return false; }
            }).map(rel))].slice(0, 12);
            if (reads.length) row.reads = reads;
        }
        if (ev === "PostToolUse")
        {
            row.ms = input.duration_ms;
            const r = input.tool_response;
            row.chars = r == null ? 0 : [...(typeof r === "string" ? r : JSON.stringify(r))].length;
        }
    }
    else if (ev === "UserPromptSubmit")
    {
        const p = String(input.prompt ?? "");
        row.chars = [...p].length;
        if (process.env.CTXSCOPE_PROMPT_PREVIEW === "1") row.preview = [...p].slice(0, 120).join("");
    }
    else if (ev === "SessionStart")
    {
        row.source = input.source;
        row.model = input.model;
        row.cwd = cwd;
    }
    else if (ev === "PreCompact" || ev === "PostCompact")
    {
        row.trigger = input.trigger;
    }
    else if (ev === "Stop" || ev === "SubagentStop")
    {
        try { row.transcriptBytes = statSync(input.agent_transcript_path ?? input.transcript_path).size; }
        catch { /* 기록 파일이 없으면 비워 둡니다 */ }
    }
    appendFileSync(join(dir, `${input.session_id}.jsonl`), JSON.stringify(row) + "\n");
}
catch
{
    // 수집 실패는 세션에 알리지 않습니다.
}
process.exit(0);

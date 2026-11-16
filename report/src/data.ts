// 보고서가 읽는 자료의 모양입니다. 스크립트(scan · lib-trace · run-scenario)가 이 모양으로 냅니다.
export type Level = 1 | 2 | 3 | 4 | 5;
export type Kind = "root" | "nested" | "rule" | "skill" | "agent" | "hook";
// 지시문의 위치입니다. 폴더 지시문과 경로 규칙은 둘 다 조건이 맞을 때 로드되지만 로드 단위가 다릅니다(폴더 전체 · 경로 패턴).
export type Source = "root" | "folder" | "rule-always" | "rule-paths";

export interface MapNode
{
    id: string; kind: Kind; source?: Source; path: string; title: string; chars: number; lines: number; level: Level;
    name?: string; description?: string; listingChars?: number; dir?: string; event?: string; matcher?: string | null;
    sections?: { title: string; chars: number; lines: number; narrow?: { dir: string; files: number; share: number; paths: number } }[];
    globs?: { glob: string; re: string; files: number }[];
    when: { how: string; text: string; globs?: string[] }[];
    matchedFiles?: number; namedBy?: string[]; extraFiles?: number;
    role?: "layer" | "domain" | "common" | "general"; areas?: string[]; listing?: "on" | "name-only" | "user-invocable-only" | "off"; fullListingChars?: number;
    refs?: { path: string; resolved: string | null; state: "ok" | "suffix" | "dead" }[];
}
export interface MapEdge { from: string; to: string; kind: "hard" | "soft"; reason: string }
export interface Stack { parts: string[]; files: number; chars: number; examples: string[]; topDirs: [string, number][] }
// 영역 × 위치 하나에서 파일을 건드릴 때 로드되는 것입니다. 자동으로 로드되는 것은 세 축(폴더 · 계층 · 도메인)으로 나눕니다.
export interface Flow
{
    id: string; area: string; areaLabel: string; scope: string; files: number; example: string; exampleFiles: number; variants: number;
    folder: string[]; layer: string[]; common: string[]; domain: string[]; chars: { folder: number; layer: number; common: number; domain: number };
    skills: { id: string; via: string }[]; next: { id: string; via: string; files: number }[]; docs: string[]; docCount: number;
}
export interface Suggestion
{
    id: string; kind: string; severity: "high" | "medium" | "low"; confidence?: "measured" | "heuristic" | "needs-test";
    title: string; evidence: string; action: string; targets?: string[]; saves?: number; items?: string[]; rows?: number[];
}
export interface ContextMap
{
    meta: { repo: string; commit: string; generatedAt: string; limits: { onDemand200k: number; onDemand1m: number; skillListing: number }; files: number; sourceFiles: number; alwaysChars: number; areas?: { id: string; label: string; paths: string[] }[]; sources?: Partial<Record<Source, { count: number; chars: number }>> };
    nodes: MapNode[]; edges: MapEdge[]; stacks: Stack[]; flows?: Flow[]; suggestions: Suggestion[];
}
export type RowKind = "session" | "prompt" | "instruction" | "skill" | "tool" | "subagent" | "compact" | "stop";
export interface TraceRow
{
    i: number; at: number; dur: number; kind: RowKind; name: string; target?: string | null; reason?: string | null; trigger?: string | null;
    chars?: number; nodeId?: string | null; source?: Source | null; agent?: { id: string; type: string | null } | null; reads?: string[] | null; open?: boolean;
}
export interface Trace
{
    session: string; startedAt: string; model: string | null; prompt: { chars: number; preview: string | null } | null; duration: number;
    rows: TraceRow[]; findings: Suggestion[];
    totals: { instructions: number; instructionChars: number; skills: string[]; tools: number; subagents: number; toolChars: number; bySource?: Record<string, { count: number; chars: number }> };
}
export interface ScenarioRun { session: string; variant: number; prompt: string; pass: boolean; hit: string[]; missed: string[]; firstLoadAt: number | null; duration: number }
export interface Scenario
{
    id: string; hypothesis: string; control?: boolean; variants: string[];
    expect: { loads?: string[]; skills?: string[]; notLoads?: string[]; notSkills?: string[] }; runs: ScenarioRun[];
}
export interface Report { title: string | null; map: ContextMap; traces: Trace[]; tests: { ranAt: string; scenarios: Scenario[] } | null }

export function loadReport(): Report | null
{
    const el = document.getElementById("ctxscope-data");
    try { return JSON.parse(el?.textContent ?? "null"); }
    catch { return null; }
}

export const LEVELS: Record<Level, { label: string; short: string; who: string; color: string }> = {
    1: { label: "항상 로드", short: "항상", who: "세션이 시작되면 자동으로 로드됩니다", color: "var(--lv1)" },
    2: { label: "조건부 로드", short: "조건", who: "맞는 파일을 열면 자동으로 로드됩니다", color: "var(--lv2)" },
    3: { label: "훅이 강제", short: "훅", who: "이벤트가 발생하면 자동으로 실행됩니다", color: "var(--lv3)" },
    4: { label: "지시문이 참조", short: "지시", who: "모델이 지시를 따라야 읽힙니다", color: "var(--lv4)" },
    5: { label: "모델이 고름", short: "자유", who: "모델이 설명만 보고 정합니다", color: "var(--lv5)" },
};
export const KIND_LABEL: Record<Kind, string> = { root: "루트 지시문", nested: "폴더 지시문", rule: "경로 규칙", skill: "스킬", agent: "서브에이전트", hook: "훅" };
export const SOURCE_LABEL: Record<Source, string> = { root: "루트 지시문", folder: "폴더 지시문", "rule-always": "항상 로드되는 규칙", "rule-paths": "경로 규칙" };
export const ROLE_LABEL: Record<string, string> = { layer: "계층 규약", domain: "도메인 용어", common: "공통 규칙", general: "항상 로드되는 규칙" };
export const kindLabel = (node: Pick<MapNode, "kind" | "source">) => node.source ? SOURCE_LABEL[node.source] : KIND_LABEL[node.kind];
export const REASON_LABEL: Record<string, string> = {
    session_start: "세션 시작", nested_traversal: "폴더 진입", path_glob_match: "경로 일치", include: "@가져오기", compact: "압축 뒤 복원",
    skill_invoke: "모델이 호출", agent_spawn: "모델이 실행", startup: "새 세션", resume: "이어 하기",
};
export const ROW_COLOR: Record<RowKind, string> = {
    session: "var(--muted-foreground)", prompt: "var(--lv1)", instruction: "var(--lv2)", skill: "var(--lv4)", tool: "var(--lv5)", subagent: "var(--lv3)", compact: "var(--destructive)", stop: "var(--muted-foreground)",
};
export const ROW_LABEL: Record<RowKind, string> = { session: "세션", prompt: "프롬프트", instruction: "지시문", skill: "스킬", tool: "도구", subagent: "서브에이전트", compact: "압축", stop: "끝" };

export const n = (v: number | undefined | null) => (v ?? 0).toLocaleString("ko-KR");
export const secs = (ms: number) => ms < 1000 ? `${Math.round(ms)}ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)}초` : `${Math.floor(ms / 60000)}분 ${Math.round(ms % 60000 / 1000)}초`;
export const shortPath = (p: string, keep = 3) => { const s = p.split("/"); return s.length <= keep ? p : "…/" + s.slice(-keep).join("/"); };

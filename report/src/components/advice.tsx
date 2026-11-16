import type { Suggestion, Trace, ContextMap } from "@/data";

export const VERDICT: Record<NonNullable<Suggestion["verdict"]>, string> = { accept: "받아들임", modify: "고쳐서 받아들임", keep: "그대로 둠", "false-positive": "거짓 신호" };

// 「그대로 둠」과 「거짓 신호」로 판정한 제안은 할 일에서 접어 둡니다.
// 판정 칸이 생기기 전의 자료(버전 2)는 그대로 둘 것을 제목 머리 「그대로 둡니다」로 적었습니다. 그것도 판정이 끝난 것으로 봅니다.
export const settled = (s: Suggestion) => s.verdict === "keep" || s.verdict === "false-positive" || (!s.verdict && s.title.startsWith("그대로 둡니다"));

// 줄어드는 양이 항상 로드되는 내용에서인지, 파일을 열 때 로드되는 내용에서인지 정합니다.
export function savesScope(s: Suggestion): "always" | "conditional"
{
    if (s.savesScope) return s.savesScope;
    if (s.kind === "demote" || s.id.startsWith("always-rule:") || s.id === "pointed-skills" || s.id.startsWith("terms-home:CLAUDE.md")) return "always";
    return "conditional";
}

// 맵의 제안과 세션 기록에서 본 것을 합쳐, 할 일 순서로 세웁니다.
// 접지 않은 것 → 항상 로드에서 줄어드는 것 → 줄어드는 양 → 급한 정도 순입니다.
export function rankSuggestions(map: ContextMap, trace: Trace | null): Suggestion[]
{
    const all: Suggestion[] = [...map.suggestions, ...(trace?.findings ?? []).map((f) => ({ ...f, kind: "trace", confidence: "measured" as const }))];
    const order = { high: 0, medium: 1, low: 2 };
    const always = (s: Suggestion) => s.saves && savesScope(s) === "always" ? 1 : 0;
    return all.sort((a, b) => Number(settled(a)) - Number(settled(b)) || always(b) - always(a) || (b.saves ?? 0) - (a.saves ?? 0) || order[a.severity] - order[b.severity]);
}

// 근거의 첫 문장만 꺼냅니다. 목록에서는 이것만 보이고 나머지는 펼쳐야 보입니다.
export const firstSentence = (t: string) => t.split(/(?<=[.?!])\s+/)[0];

// 스크립트가 낸 내용의 백틱 구간을 코드 글꼴로 바꿉니다.
export function Marked({ text }: { text: string })
{
    return <>{text.split("`").map((part, i) => i % 2 ? <code key={i} className="num rounded bg-muted px-1 text-[0.92em] text-foreground">{part}</code> : part)}</>;
}

import { ArrowRight, ChevronRight } from "lucide-react";
import { useState } from "react";

import { firstSentence, Marked, rankSuggestions, savesScope, settled, VERDICT } from "@/components/advice";
import { CONFIDENCE, SEVERITY } from "@/components/bits";
import { n, type ContextMap, type Suggestion, type Trace } from "@/data";
import { cn } from "@/lib/utils";

interface Props { map: ContextMap; trace: Trace | null; onSelect: (id: string | null) => void }

// 할 일: 한 줄에 제목과 근거의 첫 문장, 판정, 줄어드는 양, 어디서 줄어드는지를 둡니다. 줄을 누르면 근거 전체와 행동이 펼쳐집니다.
// 「그대로 둠 · 거짓 신호」는 맨 아래에 접어 둡니다.
export function TodoView({ map, trace, onSelect }: Props)
{
    const all = rankSuggestions(map, trace);
    const active = all.filter((s) => !settled(s));
    const rest = all.filter(settled);
    const [open, setOpen] = useState<string | null>(null);
    const [showRest, setShowRest] = useState(false);
    const max = Math.max(1, ...all.map((s) => s.saves ?? 0));
    const byId = new Map(map.nodes.map((x) => [x.id, x]));
    const judged = all.some((s) => s.verdict);

    const row = (s: Suggestion, i: number) =>
    {
        const isOpen = open === s.id;
        return (
            <li key={s.id} className={cn("border-b last:border-b-0", settled(s) && "opacity-70")}>
                <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : s.id)} className="grid w-full cursor-pointer grid-cols-[28px_minmax(0,1fr)_120px_150px_64px] items-start gap-3 px-4 py-3 text-left hover:bg-muted/50">
                    <span className="num pt-0.5 text-muted-foreground">{i + 1}</span>
                    <span className="min-w-0">
                        <span className="flex items-start gap-1.5 text-sm font-medium leading-snug"><ChevronRight className={cn("mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} /><span><Marked text={s.title} /></span></span>
                        {!isOpen && <span className="mt-0.5 block truncate pl-5 text-xs text-muted-foreground"><Marked text={firstSentence(s.evidence)} /></span>}
                    </span>
                    <span>{s.verdict ? <span className={cn("cn-badge inline-flex items-center whitespace-nowrap", s.verdict === "accept" || s.verdict === "modify" ? "cn-badge-variant-secondary" : "cn-badge-variant-outline")}>{VERDICT[s.verdict]}</span> : <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><span className="inline-block size-2 rounded-full" style={{ background: SEVERITY[s.severity].color }} />{SEVERITY[s.severity].label}</span>}</span>
                    <span className="flex items-center justify-end gap-2">
                        {s.saves ? <><span className="relative h-1.5 w-16 rounded bg-muted"><span className="absolute inset-y-0 left-0 rounded bg-foreground/70" style={{ width: `${s.saves / max * 100}%` }} /></span><span className="num text-xs">−{n(s.saves)}</span></> : <span className="text-xs text-muted-foreground">—</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">{s.saves ? savesScope(s) === "always" ? "항상" : "그 영역" : "—"}</span>
                </button>
                {isOpen && (
                    <div className="space-y-2.5 px-4 pb-4 pl-[60px]">
                        <p className="max-w-[80ch] text-xs leading-relaxed text-muted-foreground"><Marked text={s.evidence} /></p>
                        <div className="flex max-w-[80ch] gap-2 rounded bg-secondary px-3 py-2 text-xs leading-relaxed"><ArrowRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" /><span><Marked text={s.action} /></span></div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                            {s.confidence && <span className="cn-badge cn-badge-variant-outline inline-flex items-center whitespace-nowrap" title={CONFIDENCE[s.confidence].hint}>{CONFIDENCE[s.confidence].label}</span>}
                            {(s.targets ?? []).filter((t) => byId.has(t)).slice(0, 8).map((t) => (
                                <button key={t} type="button" onClick={() => onSelect(t)} className="cn-button cn-button-variant-outline cn-button-size-xs inline-flex cursor-pointer items-center whitespace-nowrap">{byId.get(t)!.title}</button>
                            ))}
                        </div>
                    </div>
                )}
            </li>
        );
    };

    return (
        <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-[1040px] px-6 py-5">
                <h2 className="text-sm font-semibold">무엇부터 고치나</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    {judged ? "받아들인 제안을 위에, 그대로 둘 것과 거짓 신호는 맨 아래에 접어 둡니다. " : "아직 advise 스킬이 판정하지 않은 제안입니다. "}
                    항상 로드에서 줄어드는 것 → 줄어드는 양 순서입니다. 「그 영역」은 그 파일을 열 때만 줄어든다는 뜻입니다. 줄을 누르면 근거와 행동이 펼쳐집니다.
                </p>
                <div className="cn-card mt-4 gap-0 p-0">
                    <div className="grid grid-cols-[28px_minmax(0,1fr)_120px_150px_64px] gap-3 border-b px-4 py-2 text-[11px] text-muted-foreground">
                        <span>#</span><span>할 일</span><span>판정</span><span className="text-right">줄어드는 양</span><span>어디서</span>
                    </div>
                    <ol>{active.map(row)}</ol>
                    {rest.length > 0 && (
                        <>
                            <button type="button" onClick={() => setShowRest(!showRest)} className="flex w-full cursor-pointer items-center gap-1.5 border-t px-4 py-2.5 text-left text-xs text-muted-foreground hover:text-foreground">
                                <ChevronRight className={cn("size-3.5 transition-transform", showRest && "rotate-90")} />
                                그대로 둘 것 {rest.filter((s) => s.verdict !== "false-positive").length}건 · 거짓 신호 {rest.filter((s) => s.verdict === "false-positive").length}건
                            </button>
                            {showRest && <ol className="border-t">{rest.map((s, i) => row(s, active.length + i))}</ol>}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

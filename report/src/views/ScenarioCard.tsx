import { Check, X } from "lucide-react";

import { n, secs, type Scenario } from "@/data";
import { cn } from "@/lib/utils";

// 시나리오 하나의 판정 카드입니다. 타임라인에서 시나리오 제목을 누르면 오른쪽에 펼칩니다.
export function ScenarioCard({ s, onOpenTrace }: { s: Scenario; onOpenTrace: (session: string) => void })
{
    const pass = s.runs.filter((r) => r.pass).length;
    const expects = [
        ...(s.expect.skills ?? []).map((x) => ({ label: `스킬 ${x}`, want: true })), ...(s.expect.loads ?? []).map((x) => ({ label: x, want: true })),
        ...(s.expect.notSkills ?? []).map((x) => ({ label: `스킬 ${x}`, want: false })), ...(s.expect.notLoads ?? []).map((x) => ({ label: x, want: false })),
    ];
    return (
        <article className="cn-card gap-0 py-0">
            <div className="flex items-start gap-4 p-4">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="num">{s.id}</span>{s.control && <span className="cn-badge cn-badge-variant-secondary inline-flex shrink-0 items-center whitespace-nowrap">대조 시나리오</span>}
                    </div>
                    <h3 className="mt-1 text-sm font-semibold leading-snug">{s.hypothesis}</h3>
                    <div className="mt-2 flex flex-wrap gap-1">
                        {expects.map((e) => <span key={e.label + e.want} className="num cn-badge cn-badge-variant-secondary inline-flex shrink-0 items-center whitespace-nowrap">{e.want ? "로드되어야 함" : "로드되면 안 됨"} · {e.label}</span>)}
                    </div>
                </div>
                <div className="shrink-0 text-right">
                    <div className="num text-2xl font-semibold leading-none">{pass}<span className="text-base text-muted-foreground"> / {s.runs.length}</span></div>
                    <div className="mt-1.5 flex justify-end gap-1">
                        {s.runs.map((r) => <span key={r.session} className="inline-block size-2.5 rounded-sm" style={{ background: r.pass ? "var(--lv4)" : "var(--destructive)" }} />)}
                    </div>
                </div>
            </div>
            <div className="border-t">
                {s.runs.map((r) => (
                    <button key={r.session} type="button" onClick={() => onOpenTrace(r.session)} className="grid w-full grid-cols-[20px_minmax(0,1.6fr)_minmax(0,1fr)_84px_70px] items-center gap-3 border-b px-4 py-1.5 text-left text-xs last:border-b-0 hover:bg-muted/60">
                        {r.pass ? <Check className="size-3.5" style={{ color: "var(--lv4)" }} /> : <X className="size-3.5" style={{ color: "var(--destructive)" }} />}
                        <span className="truncate">「{r.prompt}」</span>
                        <span className={cn("num truncate text-[11px]", r.missed.length ? "" : "text-muted-foreground")} style={r.missed.length ? { color: "var(--destructive)" } : undefined}>
                            {r.missed.length ? `빠짐 ${r.missed.join(", ")}` : `로드 ${r.hit.join(", ") || "없음"}`}
                        </span>
                        <span className="num text-right text-[11px] text-muted-foreground">{r.firstLoadAt != null ? `+${secs(r.firstLoadAt)}` : ""}</span>
                        <span className="num text-right text-[11px] text-muted-foreground">{secs(r.duration)}</span>
                    </button>
                ))}
            </div>
            <div className="px-4 py-2 text-[11px] text-muted-foreground">줄을 누르면 그 세션의 기록이 열립니다. 넷째 칸은 기대한 것이 처음 로드된 시점이고 마지막 칸은 세션이 걸린 시간입니다. 표본 {n(s.runs.length)}번의 비율이라 경향으로만 읽습니다.</div>
        </article>
    );
}

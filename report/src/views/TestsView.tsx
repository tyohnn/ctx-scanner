import { Check, X } from "lucide-react";

import { n, secs, type Report, type Scenario } from "@/data";
import { cn } from "@/lib/utils";

interface Props { tests: NonNullable<Report["tests"]>; onOpenTrace: (session: string) => void }

export function TestsView({ tests, onOpenTrace }: Props)
{
    const sessions = new Set(tests.scenarios.flatMap((s) => s.runs.map((r) => r.session)));
    return (
        <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-[1040px] px-6 py-5">
                <div className="mb-4 text-xs text-muted-foreground">
                    시나리오 {tests.scenarios.length}개를 새 세션 {sessions.size}번으로 돌렸습니다. 판정은 세션이 남긴 기록만 봅니다. 세션에게는 가설을 알려 주지 않습니다.
                </div>
                <div className="space-y-3 pb-8">{tests.scenarios.map((s) => <ScenarioCard key={s.id} s={s} onOpenTrace={onOpenTrace} />)}</div>
            </div>
        </div>
    );
}

function ScenarioCard({ s, onOpenTrace }: { s: Scenario; onOpenTrace: (session: string) => void })
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
                        {expects.map((e) => <span key={e.label + e.want} className="num cn-badge cn-badge-variant-secondary inline-flex shrink-0 items-center whitespace-nowrap">{e.want ? "실려야 함" : "실리면 안 됨"} · {e.label}</span>)}
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
                            {r.missed.length ? `빠짐 ${r.missed.join(", ")}` : `실림 ${r.hit.join(", ") || "없음"}`}
                        </span>
                        <span className="num text-right text-[11px] text-muted-foreground">{r.firstLoadAt != null ? `+${secs(r.firstLoadAt)}` : ""}</span>
                        <span className="num text-right text-[11px] text-muted-foreground">{secs(r.duration)}</span>
                    </button>
                ))}
            </div>
            <div className="px-4 py-2 text-[11px] text-muted-foreground">줄을 누르면 그 세션의 기록이 열립니다. 넷째 칸은 기대한 것이 처음 실린 때이고 마지막 칸은 세션이 걸린 시간입니다. 표본 {n(s.runs.length)}번의 비율이라 경향으로만 읽습니다.</div>
        </article>
    );
}

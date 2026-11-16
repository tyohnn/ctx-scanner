import { Check, X } from "lucide-react";
import { useState } from "react";

import { secs, type Report, type Scenario, type ScenarioRun, type Trace } from "@/data";
import { cn } from "@/lib/utils";

import { ScenarioCard } from "./ScenarioCard";
import { TimelineView } from "./TimelineView";

interface Props
{
    traces: Trace[]; tests: Report["tests"]; traceIndex: number; onTrace: (i: number) => void;
    selected: string | null; onSelect: (id: string | null) => void;
}

// 타임라인: 왼쪽에서 세션을 고르고 오른쪽에서 그 세션의 기록을 봅니다. 시나리오로 돌린 세션은 시나리오별로 묶고,
// 시나리오 제목을 누르면 그 시나리오의 판정 전체(기대 · 돌린 횟수 · 빠진 것)를 오른쪽에 펼칩니다.
export function SessionsView({ traces, tests, traceIndex, onTrace, selected, onSelect }: Props)
{
    const scenarios = tests?.scenarios ?? [];
    const [scenarioId, setScenarioId] = useState<string | null>(() => traces.length ? null : scenarios[0]?.id ?? null);
    const indexOf = new Map(traces.map((t, i) => [t.session, i]));
    const inScenario = new Set(scenarios.flatMap((s) => s.runs.map((r) => r.session)));
    const others = traces.map((t, i) => ({ t, i })).filter(({ t }) => !inScenario.has(t.session));
    const trace = traces[traceIndex] ?? null;
    const runOf = trace ? scenarios.flatMap((s) => s.runs.map((r) => ({ s, r }))).find((x) => x.r.session === trace.session) : undefined;
    const openScenario = scenarios.find((s) => s.id === scenarioId) ?? null;
    const pick = (i: number) => { setScenarioId(null); onTrace(i); };

    return (
        <div className="flex h-full">
            <aside aria-label="세션" className="flex w-72 shrink-0 flex-col overflow-y-auto border-r bg-sidebar text-xs">
                {scenarios.length > 0 && (
                    <section className="border-b py-2">
                        <h3 className="px-3 pb-1 text-[11px] font-medium text-muted-foreground">시나리오 {scenarios.length}개 · {tests?.ranAt.slice(0, 10)}</h3>
                        {scenarios.map((s) => (
                            <div key={s.id} className="pb-1">
                                <ScenarioHead s={s} active={scenarioId === s.id} onClick={() => setScenarioId(s.id)} />
                                {s.runs.map((r) => (
                                    <RunRow key={r.session} r={r} index={indexOf.get(r.session)} active={!scenarioId && trace?.session === r.session} onPick={pick} />
                                ))}
                            </div>
                        ))}
                    </section>
                )}
                {others.length > 0 && (
                    <section className="py-2">
                        <h3 className="px-3 pb-1 text-[11px] font-medium text-muted-foreground">{scenarios.length ? "그 밖의 세션" : "세션"} {others.length}개</h3>
                        {others.map(({ t, i }) => (
                            <button
                                key={t.session} type="button" onClick={() => pick(i)} aria-current={!scenarioId && i === traceIndex ? "true" : undefined}
                                className="grid w-full grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/60 aria-[current]:bg-muted"
                            >
                                <span className="num text-muted-foreground">{t.session.slice(0, 6)}</span>
                                <span className="truncate">{t.prompt?.preview ?? "세션"}</span>
                                <span className="num text-right whitespace-nowrap text-muted-foreground">{secs(t.duration)}</span>
                            </button>
                        ))}
                    </section>
                )}
            </aside>
            <div className="flex min-w-0 flex-1 flex-col">
                {openScenario
                    ? (
                        <div className="h-full overflow-y-auto">
                            <div className="mx-auto max-w-[1040px] px-6 py-5">
                                <p className="mb-3 text-xs text-muted-foreground">판정은 세션이 남긴 기록만 봅니다. 세션에게는 가설을 알려 주지 않습니다. 줄을 누르면 그 세션의 기록이 열립니다.</p>
                                <ScenarioCard s={openScenario} onOpenTrace={(session) => { const i = indexOf.get(session); if (i != null) pick(i); }} />
                            </div>
                        </div>
                    )
                    : trace
                        ? (
                            <>
                                {runOf && <RunStrip s={runOf.s} r={runOf.r} onOpen={() => setScenarioId(runOf.s.id)} />}
                                <div className="min-h-0 flex-1"><TimelineView key={trace.session} trace={trace} selected={selected} onSelect={onSelect} /></div>
                            </>
                        )
                        : <div className="grid h-full place-items-center text-xs text-muted-foreground">왼쪽에서 세션을 고릅니다.</div>}
            </div>
        </div>
    );
}

function ScenarioHead({ s, active, onClick }: { s: Scenario; active: boolean; onClick: () => void })
{
    const pass = s.runs.filter((r) => r.pass).length;
    return (
        <button type="button" onClick={onClick} aria-current={active ? "true" : undefined} className="flex w-full items-start gap-2 px-3 pt-1.5 pb-1 text-left hover:bg-muted/60 aria-[current]:bg-muted">
            <span className="min-w-0 flex-1 font-medium leading-snug">{s.control && <span className="text-muted-foreground">대조 · </span>}{s.hypothesis}</span>
            <span className={cn("num shrink-0", pass === s.runs.length ? "text-muted-foreground" : "")} style={pass < s.runs.length ? { color: "var(--destructive)" } : undefined}>{pass}/{s.runs.length}</span>
        </button>
    );
}

function RunRow({ r, index, active, onPick }: { r: ScenarioRun; index: number | undefined; active: boolean; onPick: (i: number) => void })
{
    const Icon = r.pass ? Check : X;
    return (
        <button
            type="button" disabled={index == null} onClick={() => index != null && onPick(index)} aria-current={active ? "true" : undefined}
            title={index == null ? "이 세션의 기록이 보고서에 없습니다" : undefined}
            className="grid w-full grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-2 py-1 pr-3 pl-5 text-left hover:bg-muted/60 disabled:cursor-default disabled:opacity-50 aria-[current]:bg-muted"
        >
            <Icon className="size-3" style={{ color: r.pass ? "var(--lv4)" : "var(--destructive)" }} />
            <span className="truncate text-muted-foreground">「{r.prompt}」</span>
            <span className="num text-right whitespace-nowrap text-muted-foreground">{secs(r.duration)}</span>
        </button>
    );
}

// 시나리오로 돌린 세션이면 기록 위에 그 판정을 한 줄로 붙입니다.
function RunStrip({ s, r, onOpen }: { s: Scenario; r: ScenarioRun; onOpen: () => void })
{
    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-secondary px-3 py-2 text-xs">
            <span className="inline-flex items-center gap-1 font-medium" style={{ color: r.pass ? "var(--lv4)" : "var(--destructive)" }}>
                {r.pass ? <Check className="size-3.5" /> : <X className="size-3.5" />}{r.pass ? "통과" : "실패"}
            </span>
            <button type="button" onClick={onOpen} className="min-w-0 truncate text-left underline-offset-2 hover:underline">{s.hypothesis}</button>
            <span className="num text-muted-foreground">{r.missed.length ? `빠짐 ${r.missed.join(", ")}` : `로드 ${r.hit.join(", ") || "없음"}`}</span>
            {r.firstLoadAt != null && <span className="num text-muted-foreground">처음 로드 +{secs(r.firstLoadAt)}</span>}
        </div>
    );
}

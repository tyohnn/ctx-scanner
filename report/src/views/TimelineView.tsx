import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Pill, SEVERITY } from "@/components/bits";
import { REASON_LABEL, ROW_COLOR, ROW_LABEL, n, secs, shortPath, type RowKind, type Trace, type TraceRow } from "@/data";
import { cn } from "@/lib/utils";

const FILTERS: { key: string; label: string; kinds: RowKind[] | null }[] = [
    { key: "all", label: "전체", kinds: null },
    { key: "context", label: "컨텍스트에 실린 것", kinds: ["instruction", "skill", "prompt"] },
    { key: "instruction", label: "지시문", kinds: ["instruction"] },
    { key: "skill", label: "스킬", kinds: ["skill"] },
    { key: "tool", label: "도구", kinds: ["tool"] },
    { key: "subagent", label: "서브에이전트", kinds: ["subagent"] },
];
const GRID = "grid grid-cols-[minmax(220px,1.4fr)_76px_84px_minmax(120px,1fr)_72px_64px_minmax(260px,2.2fr)] items-center";

function rowName(r: TraceRow)
{
    if (r.kind === "tool") return <><span>{r.name}</span>{r.target && <span className="text-muted-foreground"> · {r.name === "Bash" ? r.target : shortPath(r.target, 3)}</span>}</>;
    if (r.kind === "instruction") return <span title={r.name}>{shortPath(r.name, 3)}</span>;
    return <span>{r.name}</span>;
}

// 폭포 칸의 눈금을 정합니다. 다섯 칸 안팎이 되게 간격을 고릅니다.
function ticksFor(duration: number)
{
    const steps = [1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000];
    const step = steps.find((s) => duration / s <= 6) ?? 600000;
    const out: number[] = [];
    for (let t = 0; t <= duration; t += step) out.push(t);
    return out;
}

interface Props { trace: Trace; selected: string | null; onSelect: (id: string | null) => void }

export function TimelineView({ trace, selected, onSelect }: Props)
{
    const [filter, setFilter] = useState("all");
    const [query, setQuery] = useState("");
    const [finding, setFinding] = useState<string | null>(null);
    const D = Math.max(trace.duration, 1);
    const ticks = useMemo(() => ticksFor(D), [D]);
    const marked = new Set(trace.findings.find((f) => f.id === finding)?.rows ?? []);
    const kinds = FILTERS.find((f) => f.key === filter)!.kinds;
    const rows = trace.rows.filter((r) => (!kinds || kinds.includes(r.kind)) && (!query || `${r.name} ${r.target ?? ""} ${r.trigger ?? ""}`.toLowerCase().includes(query.toLowerCase())));

    // 위쪽 띠는 그때까지 컨텍스트에 쌓인 글자 수를 계단으로 그립니다. 지시문과 도구 결과를 나눠 쌓습니다.
    const strip = useMemo(() =>
    {
        let instr = 0;
        let tool = 0;
        const pts = [{ at: 0, instr: 0, tool: 0 }];
        for (const r of trace.rows)
        {
            if (r.kind === "instruction" || r.kind === "skill" || r.kind === "prompt") instr += r.chars ?? 0;
            else if (r.kind === "tool" || r.kind === "subagent") tool += r.chars ?? 0;
            else continue;
            pts.push({ at: r.at + r.dur, instr, tool });
        }
        pts.push({ at: D, instr, tool });
        const max = Math.max(instr + tool, 1);
        const path = (f: (p: (typeof pts)[number]) => number) =>
        {
            let d = `M0,100`;
            let prev = 0;
            for (const p of pts)
            {
                const x = p.at / D * 1000;
                d += ` L${x},${100 - prev} L${x},${100 - f(p) / max * 100}`;
                prev = f(p) / max * 100;
            }
            return d + ` L1000,100 Z`;
        };
        return { instr, tool, total: path((p) => p.instr + p.tool), instrPath: path((p) => p.instr) };
    }, [trace, D]);

    return (
        <div className="flex h-full flex-col">
            <div className="flex flex-wrap items-center gap-1 border-b px-3 py-2">
                {FILTERS.map((f) => <Pill key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}</Pill>)}
                <label className="no-print ml-2 flex items-center gap-1.5 rounded border bg-card px-2 py-1 text-xs">
                    <Search className="size-3.5 text-muted-foreground" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="이름이나 경로로 거르기" className="w-44 bg-transparent outline-none placeholder:text-muted-foreground" />
                </label>
                {trace.prompt?.preview && <span className="ml-auto max-w-[44%] truncate text-xs text-muted-foreground">요청 「{trace.prompt.preview}」</span>}
            </div>

            {trace.findings.length > 0 && (
                <div className="flex gap-2 border-b bg-secondary px-3 py-2">
                    {trace.findings.map((f) => (
                        <button
                            key={f.id} type="button" onClick={() => setFinding(finding === f.id ? null : f.id)}
                            className={cn("min-w-0 flex-1 rounded border bg-card px-3 py-2 text-left", finding === f.id && "ring-2 ring-primary")}
                        >
                            <div className="flex items-center gap-1.5 font-medium">
                                <span className="inline-block size-1.5 shrink-0 rounded-full" style={{ background: SEVERITY[f.severity].color }} />{f.title}
                            </div>
                            <div className="mt-0.5 text-xs leading-snug text-muted-foreground">{f.evidence.replaceAll("`", "")}</div>
                        </button>
                    ))}
                </div>
            )}

            <div className={cn(GRID, "border-b bg-secondary px-3 text-[11px] text-muted-foreground")}>
                <div className="col-span-6 py-1.5">
                    쌓인 글 <span className="num text-foreground">{n(strip.instr + strip.tool)}자</span>
                    <span className="ml-2 inline-block size-2 rounded-sm align-middle" style={{ background: "var(--lv2)" }} /> 지시문 · 스킬 <span className="num">{n(strip.instr)}</span>
                    <span className="ml-2 inline-block size-2 rounded-sm align-middle" style={{ background: "var(--lv5)" }} /> 도구 결과 <span className="num">{n(strip.tool)}</span>
                    <span className="ml-2">(글자 수로 어림한 값)</span>
                </div>
                <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="h-12 w-full">
                    <path d={strip.total} fill="var(--lv5)" opacity="0.35" />
                    <path d={strip.instrPath} fill="var(--lv2)" opacity="0.55" />
                </svg>
            </div>

            <div className={cn(GRID, "border-b px-3 py-1.5 text-[11px] font-medium text-muted-foreground")}>
                <div>이름</div><div>종류</div><div>까닭</div><div>일으킨 것</div><div className="text-right">크기</div><div className="text-right">때</div>
                <div className="relative ml-3 h-4">
                    {ticks.map((t) => <span key={t} className="num absolute top-0 -translate-x-1/2 whitespace-nowrap font-normal" style={{ left: `${t / D * 100}%`, display: t / D > 0.96 ? "none" : undefined }}>{t === 0 ? "0" : secs(t)}</span>)}
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
                {rows.map((r) =>
                {
                    const color = ROW_COLOR[r.kind];
                    const left = r.at / D * 100;
                    const loaded = r.kind === "instruction" || r.kind === "skill";
                    return (
                        <div
                            key={r.i} role={r.nodeId ? "button" : undefined} onClick={() => r.nodeId && onSelect(r.nodeId)}
                            className={cn(GRID, "border-b border-border/60 px-3 text-xs hover:bg-muted/60", r.nodeId && "cursor-pointer", r.nodeId && r.nodeId === selected && "bg-muted", marked.has(r.i) && "bg-[color-mix(in_oklch,var(--warn)_14%,transparent)]")}
                            style={{ height: 26 }}
                        >
                            <div className={cn("flex min-w-0 items-center gap-2 truncate", r.agent && "pl-4")}>
                                <span className="inline-block size-2 shrink-0 rounded-sm" style={{ background: color }} />
                                <span className={cn("truncate", r.kind !== "prompt" && r.kind !== "session" && r.kind !== "stop" && "num", loaded && "font-medium")}>{rowName(r)}</span>
                            </div>
                            <div className="text-muted-foreground">{ROW_LABEL[r.kind]}</div>
                            <div className="truncate text-muted-foreground">{r.reason ? REASON_LABEL[r.reason] ?? r.reason : ""}</div>
                            <div className="num truncate text-[11px] text-muted-foreground" title={r.trigger ?? r.reads?.join(", ") ?? ""}>{r.trigger ? shortPath(r.trigger, 2) : r.reads ? shortPath(r.reads[0], 2) + (r.reads.length > 1 ? ` 외 ${r.reads.length - 1}` : "") : ""}</div>
                            <div className="num text-right">{r.chars ? n(r.chars) : ""}</div>
                            <div className="num text-right text-muted-foreground">{secs(r.at)}</div>
                            <div className="relative ml-3 h-full">
                                {ticks.map((t) => <span key={t} className="absolute top-0 h-full w-px bg-border/70" style={{ left: `${t / D * 100}%` }} />)}
                                {r.dur > 0
                                    ? <span className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-[2px]" style={{ left: `${left}%`, width: `max(${r.dur / D * 100}%, 3px)`, background: color }} />
                                    : loaded
                                        ? <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px]" style={{ left: `${left}%`, background: color }} />
                                        : <span className="absolute top-1/2 h-3.5 w-0.5 -translate-y-1/2" style={{ left: `${left}%`, background: color }} />}
                                {loaded && r.chars ? <span className="num absolute top-1/2 -translate-y-1/2 text-[10.5px] text-muted-foreground" style={left > 80 ? { right: `${100 - left + 1.2}%` } : { left: `calc(${left + r.dur / D * 100}% + 10px)` }}>+{n(r.chars)}자</span> : null}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="flex items-center gap-4 border-t bg-secondary px-3 py-1.5 text-[11px] text-muted-foreground">
                <span>사건 <span className="num text-foreground">{rows.length}</span> / {trace.rows.length}</span>
                <span>실린 지시문 <span className="num text-foreground">{trace.totals.instructions}</span>개 · <span className="num text-foreground">{n(trace.totals.instructionChars)}</span>자</span>
                <span>부른 스킬 <span className="text-foreground">{trace.totals.skills.length ? trace.totals.skills.join(", ") : "없음"}</span></span>
                <span>도구 <span className="num text-foreground">{trace.totals.tools}</span>번</span>
                <span>걸린 시간 <span className="num text-foreground">{secs(trace.duration)}</span></span>
                <span className="num ml-auto">{trace.session.slice(0, 8)}</span>
            </div>
        </div>
    );
}

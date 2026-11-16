import {
    visibleWaterfallRows, Waterfall, WaterfallAxis, WaterfallBar, WaterfallCell, WaterfallColumnHeader, WaterfallHeaderRow, WaterfallIndicator,
    WaterfallMark, WaterfallRow, WaterfallRowHeader, WaterfallTick, type WaterfallData, type WaterfallDataItem,
} from "@ui-sdk/react/waterfall";
import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { SEVERITY } from "@/components/bits";
import { Input, Segmented, Select } from "@/components/ui";
import { REASON_LABEL, ROW_COLOR, ROW_LABEL, SOURCE_LABEL, n, secs, shortPath, type RowKind, type Trace, type TraceRow } from "@/data";
import { cn } from "@/lib/utils";

const FILTERS: { key: string; label: string; kinds: RowKind[] | null }[] = [
    { key: "all", label: "전체", kinds: null },
    { key: "context", label: "컨텍스트에 로드된 것", kinds: ["instruction", "skill", "prompt"] },
    { key: "instruction", label: "지시문", kinds: ["instruction"] },
    { key: "skill", label: "스킬", kinds: ["skill"] },
    { key: "tool", label: "도구", kinds: ["tool"] },
    { key: "subagent", label: "서브에이전트", kinds: ["subagent"] },
];
const ZOOMS = [{ value: "all", label: "전체" }, { value: "30", label: "첫 30초" }, { value: "10", label: "첫 10초" }];
const GRID = "grid grid-cols-[minmax(220px,1.4fr)_76px_84px_minmax(120px,1fr)_72px_64px_minmax(260px,2.2fr)] items-center";
// 눈금은 딱 떨어지는 시각에 놓이므로 소수 없이 적습니다.
const axisTime = (ms: number) => ms === 0 ? "0" : ms % 1000 ? secs(ms) : ms < 60000 ? `${ms / 1000}초` : `${Math.floor(ms / 60000)}분${ms % 60000 ? ` ${ms % 60000 / 1000}초` : ""}`;
const idOf = (r: TraceRow) => `r${r.i}`;

function rowName(r: TraceRow)
{
    if (r.kind === "tool") return <><span>{r.name}</span>{r.target && <span className="text-muted-foreground"> · {r.name === "Bash" ? r.target : shortPath(r.target, 3)}</span>}</>;
    if (r.kind === "instruction") return <span title={r.name}>{shortPath(r.name, 3)}</span>;
    return <span>{r.name}</span>;
}

// 기록의 줄을 폭포가 읽는 모양으로 바꿉니다. 서브에이전트 안에서 일어난 일은 그 서브에이전트 줄의 아래로 넣습니다.
function toItems(rows: TraceRow[]): WaterfallData
{
    const items: WaterfallDataItem[] = [];
    const open = new Map<string, WaterfallDataItem & { children: WaterfallDataItem[] }>();
    for (const r of rows)
    {
        const item: WaterfallDataItem = { value: idOf(r), label: r.name, start: r.at, duration: r.dur };
        const parent = r.agent?.type ? open.get(r.agent.type) : undefined;
        if (r.kind === "subagent")
        {
            const branch = { ...item, children: [] as WaterfallDataItem[] };
            open.set(r.name, branch);
            items.push(branch);
        }
        else if (parent) parent.children.push(item);
        else items.push(item);
    }
    for (const b of open.values()) if (!b.children.length) delete (b as WaterfallDataItem).children;
    return items;
}

interface Props { trace: Trace; traces: Trace[]; onPickTrace: (i: number) => void; selected: string | null; onSelect: (id: string | null) => void }

export function TimelineView({ trace, traces, onPickTrace, selected, onSelect }: Props)
{
    const [filter, setFilter] = useState("all");
    const [zoom, setZoom] = useState("all");
    const [query, setQuery] = useState("");
    const [finding, setFinding] = useState<string | null>(null);
    const [picked, setPicked] = useState<string | null>(null);
    const D = Math.max(trace.duration, 1);
    const end = zoom === "all" ? D : Math.min(Number(zoom) * 1000, D);
    const marked = new Set(trace.findings.find((f) => f.id === finding)?.rows ?? []);
    const kinds = FILTERS.find((f) => f.key === filter)!.kinds;
    const rows = useMemo(
        () => trace.rows.filter((r) => (!kinds || kinds.includes(r.kind)) && (!query || `${r.name} ${r.target ?? ""} ${r.trigger ?? ""}`.toLowerCase().includes(query.toLowerCase()))),
        [trace, kinds, query],
    );
    const items = useMemo(() => toItems(rows), [rows]);
    const byValue = useMemo(() => new Map(trace.rows.map((r) => [idOf(r), r])), [trace]);
    const [expanded, setExpanded] = useState(() => trace.rows.filter((r) => r.kind === "subagent").map(idOf));
    const shown = visibleWaterfallRows(items, expanded);
    const prompt = trace.rows.find((r) => r.kind === "prompt");
    // 맵이나 상세 패널에서 고른 파일이 이 기록에 있으면 그 줄을 고른 것으로 보입니다.
    const fromNode = selected ? rows.find((r) => r.nodeId === selected) : undefined;
    const value = picked && (byValue.get(picked)?.nodeId ?? null) === selected ? picked : fromNode ? idOf(fromNode) : null;

    // 위쪽 띠는 그때까지 컨텍스트에 누적된 글자 수를 계단으로 그립니다. 지시문과 도구 결과를 나눠 표시합니다.
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
                const x = p.at / end * 1000;
                d += ` L${x},${100 - prev} L${x},${100 - f(p) / max * 100}`;
                prev = f(p) / max * 100;
            }
            return d + ` L${D / end * 1000},100 Z`;
        };
        return { instr, tool, total: path((p) => p.instr + p.tool), instrPath: path((p) => p.instr) };
    }, [trace, D, end]);

    return (
        <div className="flex h-full flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
                {/* 볼 세션은 타임라인에서만 쓰이므로 머리가 아니라 이 줄에서 고릅니다. */}
                {traces.length > 1 && (
                    <Select
                        label="볼 세션" value={String(traces.indexOf(trace))} onChange={(v) => onPickTrace(Number(v))} className="no-print max-w-72"
                        items={traces.map((t, i) => ({
                            value: String(i), label: `${t.session.slice(0, 6)} · ${secs(t.duration)} · ${t.prompt?.preview?.slice(0, 22) ?? "세션"}`,
                            node: <><span className="num text-muted-foreground">{t.session.slice(0, 6)}</span><span className="num w-14 text-right text-muted-foreground">{secs(t.duration)}</span><span className="truncate">{t.prompt?.preview?.slice(0, 34) ?? "세션"}</span></>,
                        }))}
                    />
                )}
                <Segmented label="보일 이벤트" value={filter} onChange={setFilter} items={FILTERS.map((f) => ({ value: f.key, label: f.label }))} />
                {D > 30000 && <Segmented label="보는 구간" value={zoom} onChange={setZoom} items={ZOOMS} />}
                <Input aria-label="이름이나 경로로 거르기" value={query} onValueChange={(v) => setQuery(v)} placeholder="이름이나 경로로 거르기" className="no-print w-52" />
                {trace.prompt?.preview && <span className="ml-auto max-w-[36%] truncate text-xs text-muted-foreground">요청 「{trace.prompt.preview}」</span>}
            </div>

            {trace.findings.length > 0 && (
                <div className="flex gap-2 border-b bg-secondary px-3 py-2">
                    {trace.findings.map((f) => (
                        <button
                            key={f.id} type="button" aria-pressed={finding === f.id} onClick={() => setFinding(finding === f.id ? null : f.id)}
                            className={cn("cn-card min-w-0 flex-1 cursor-pointer gap-0 px-3 py-2 text-left", finding === f.id && "ring-2 ring-ring")}
                        >
                            <div className="flex items-center gap-1.5 font-medium">
                                <span className="inline-block size-1.5 shrink-0 rounded-full" style={{ background: SEVERITY[f.severity].color }} />{f.title}
                            </div>
                            <div className="mt-0.5 text-xs leading-snug text-muted-foreground">{f.evidence.replaceAll("`", "")}</div>
                        </button>
                    ))}
                </div>
            )}

            <div className={cn(GRID, "border-b bg-secondary pl-2.5 pr-5 text-[11px] text-muted-foreground")}>
                <div className="col-span-6 py-1.5">
                    누적 컨텍스트 <span className="num text-foreground">{n(strip.instr + strip.tool)}자</span>
                    <span className="ml-2 inline-block size-2 rounded-sm align-middle" style={{ background: "var(--lv2)" }} /> 지시문 · 스킬 <span className="num">{n(strip.instr)}</span>
                    <span className="ml-2 inline-block size-2 rounded-sm align-middle" style={{ background: "var(--lv5)" }} /> 도구 결과 <span className="num">{n(strip.tool)}</span>
                    <span className="ml-2">(글자 수로 추정한 값)</span>
                </div>
                <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="ml-3 h-12 w-[calc(100%-12px)]" aria-hidden="true">
                    <path d={strip.total} fill="var(--lv5)" opacity="0.35" />
                    <path d={strip.instrPath} fill="var(--lv2)" opacity="0.55" />
                </svg>
            </div>

            <Waterfall
                aria-label="세션 기록" items={items} range={[0, end]}
                expanded={expanded} onExpandedChange={setExpanded}
                value={value} onValueChange={(v) => { setPicked(v); onSelect((v ? byValue.get(v)?.nodeId : null) ?? null); }}
                format={axisTime}
                getBarLabel={(_, { start, duration }) => `${start}에 시작, ${duration} 걸림`}
                className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-scroll"
            >
                <WaterfallHeaderRow className={cn(GRID, "cx-waterfall-head sticky top-0 z-10")}>
                    <WaterfallColumnHeader>이름</WaterfallColumnHeader>
                    <WaterfallColumnHeader>종류</WaterfallColumnHeader>
                    <WaterfallColumnHeader>이유</WaterfallColumnHeader>
                    <WaterfallColumnHeader>트리거</WaterfallColumnHeader>
                    <WaterfallColumnHeader className="text-right">크기</WaterfallColumnHeader>
                    <WaterfallColumnHeader className="text-right">때</WaterfallColumnHeader>
                    <WaterfallColumnHeader aria-label="시간" className="relative ml-3 h-full">
                        <WaterfallAxis maxTicks={6} className="relative block h-full">
                            {({ ticks }) => ticks.map((t) => (
                                <WaterfallTick key={t.time} time={t.time} className="cx-waterfall-tick num pointer-events-none absolute top-0 h-screen pl-1 leading-(--waterfall-head-height) whitespace-nowrap" style={{ left: "var(--waterfall-tick)" }}>
                                    {t.label}
                                </WaterfallTick>
                            ))}
                        </WaterfallAxis>
                        {prompt && (
                            <WaterfallMark time={prompt.at} className="pointer-events-none absolute top-0 h-screen border-l border-dashed pl-1 font-normal whitespace-nowrap data-[outside]:hidden" style={{ left: "var(--waterfall-mark)", borderColor: "var(--lv1)", color: "var(--lv1)" }}>
                                <span className="relative top-(--waterfall-head-height) bg-background/80">요청</span>
                            </WaterfallMark>
                        )}
                    </WaterfallColumnHeader>
                </WaterfallHeaderRow>

                {shown.map(({ item }) =>
                {
                    const r = byValue.get(item.value)!;
                    const color = ROW_COLOR[r.kind];
                    const loaded = r.kind === "instruction" || r.kind === "skill";
                    const late = r.at / end > 0.8;
                    return (
                        <WaterfallRow
                            key={item.value} value={item.value}
                            data-marked={marked.has(r.i) ? "" : undefined} className={cn(GRID, "cx-waterfall-row cursor-default select-none")}
                        >
                            <WaterfallRowHeader className={"flex h-full min-w-0 items-center gap-1.5 pl-[calc((var(--waterfall-level)-1)*16px)]"}>
                                {item.children
                                    ? <WaterfallIndicator className="flex text-muted-foreground [&>svg]:transition-transform data-[expanded]:[&>svg]:rotate-90"><ChevronRight className="size-3" aria-hidden="true" /></WaterfallIndicator>
                                    : null}
                                <span className="inline-block size-2 shrink-0 rounded-sm" style={{ background: color }} />
                                <span className={cn("truncate", r.kind !== "prompt" && r.kind !== "session" && r.kind !== "stop" && "num", loaded && "font-medium")}>{rowName(r)}</span>
                                {item.children && <span className="num shrink-0 text-[11px] text-muted-foreground">{item.children.length}</span>}
                            </WaterfallRowHeader>
                            <WaterfallCell className={"truncate text-muted-foreground"}>{r.kind === "instruction" && r.source ? SOURCE_LABEL[r.source] : ROW_LABEL[r.kind]}</WaterfallCell>
                            <WaterfallCell className={"truncate text-muted-foreground"}>{r.reason ? REASON_LABEL[r.reason] ?? r.reason : ""}</WaterfallCell>
                            <WaterfallCell className={"num truncate text-[11px] text-muted-foreground"} title={r.trigger ?? r.reads?.join(", ") ?? ""}>
                                {r.trigger ? shortPath(r.trigger, 2) : r.reads ? shortPath(r.reads[0], 2) + (r.reads.length > 1 ? ` 외 ${r.reads.length - 1}` : "") : ""}
                            </WaterfallCell>
                            <WaterfallCell className={"num text-right"}>{r.chars ? n(r.chars) : ""}</WaterfallCell>
                            <WaterfallCell className={"num text-right text-muted-foreground"}>{secs(r.at)}</WaterfallCell>
                            <WaterfallBar className={"relative ml-3 h-full overflow-hidden"}>
                                {r.at > end ? null : r.dur > 0
                                    ? <span className="cx-waterfall-bar absolute top-1/2 -translate-y-1/2" style={{ left: "var(--waterfall-start)", width: "max(var(--waterfall-size), 3px)", background: color }} />
                                    : loaded
                                        ? <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px]" style={{ left: "var(--waterfall-start)", background: color }} />
                                        : <span className="absolute top-1/2 h-3.5 w-0.5 -translate-y-1/2" style={{ left: "var(--waterfall-start)", background: color }} />}
                                {loaded && r.chars && r.at <= end
                                    ? <span className="num absolute top-1/2 -translate-y-1/2 text-[10.5px] text-muted-foreground" style={late ? { right: "calc(100% - var(--waterfall-start) + 10px)" } : { left: "calc(var(--waterfall-start) + var(--waterfall-size) + 10px)" }}>+{n(r.chars)}자</span>
                                    : null}
                            </WaterfallBar>
                        </WaterfallRow>
                    );
                })}
            </Waterfall>

            <div className="flex items-center gap-4 border-t bg-secondary px-3 py-1.5 text-[11px] text-muted-foreground">
                <span>이벤트 <span className="num text-foreground">{rows.length}</span> / {trace.rows.length}</span>
                {trace.totals.bySource
                    ? (["root", "folder", "rule-always", "rule-paths"] as const).filter((k) => trace.totals.bySource![k]).map((k) => (
                        <span key={k}>{SOURCE_LABEL[k]} <span className="num text-foreground">{trace.totals.bySource![k].count}</span>개 · <span className="num text-foreground">{n(trace.totals.bySource![k].chars)}</span>자</span>
                    ))
                    : <span>로드된 지시문 <span className="num text-foreground">{trace.totals.instructions}</span>개 · <span className="num text-foreground">{n(trace.totals.instructionChars)}</span>자</span>}
                <span>호출한 스킬 <span className="text-foreground">{trace.totals.skills.length ? trace.totals.skills.join(", ") : "없음"}</span></span>
                <span>도구 <span className="num text-foreground">{trace.totals.tools}</span>번</span>
                <span>걸린 시간 <span className="num text-foreground">{secs(trace.duration)}</span></span>
                <span className="num ml-auto">{trace.session.slice(0, 8)}</span>
            </div>
        </div>
    );
}

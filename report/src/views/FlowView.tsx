import { sankey, sankeyLinkHorizontal, type SankeyLink, type SankeyNode } from "d3-sankey";
import { useEffect, useMemo, useRef, useState } from "react";

import { Switch } from "@/components/ui";
import { n, type ContextMap } from "@/data";
import { buildCircuit, buildGraph, cellChars, KIND_NAME, scopeName, TYPE_COLOR, TYPE_NAME, type FlowFilter, type GLink, type GNode } from "@/lib/flowgraph";
import { cn } from "@/lib/utils";

import { CircuitDiagram } from "./CircuitDiagram";

interface Props { map: ContextMap; filter: FlowFilter; onFilter: (f: FlowFilter) => void; onSelect: (id: string | null) => void }

type SNode = SankeyNode<GNode, GLink>;
type SLink = SankeyLink<GNode, GLink>;
// 배치를 마친 선의 양 끝은 마디 객체입니다. 배치 전에는 id 문자열이라 타입이 둘 다 열려 있어 좁혀 씁니다.
const endOf = (v: SLink["source"]): SNode => (typeof v === "object" ? v : { id: String(v), label: String(v), type: "etc", col: 0 }) as SNode;
const HEADS = ["① 건드린 영역", "② 자동으로 로드되는 지시문", "③ 지시문이 가리키는 스킬", "④ 그 스킬이 가리키는 스킬"];

// 플로우는 두 단계로 봅니다. 위는 저장소 전체의 흐름 그래프(웹 사용자 흐름 그래프와 같은 꼴), 아래는 고른 칸 하나의 회로도입니다.
// 두 그림 모두 선의 모양이 같은 뜻입니다: 실선 자동 로드, 굵은 점선 지시, 가는 점선 색인, 붉은 가지 OPEN.
export function FlowView({ map, filter, onFilter, onSelect }: Props)
{
    const flows = map.flows ?? [];
    const areas = (map.meta.areas ?? []).filter((a) => flows.some((f) => f.area === a.id));
    const wrap = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(1000);
    const [hover, setHover] = useState<{ node?: SNode; link?: SLink } | null>(null);
    useEffect(() =>
    {
        if (!wrap.current) return;
        const ro = new ResizeObserver(([e]) => setWidth(Math.max(880, Math.floor(e.contentRect.width))));
        ro.observe(wrap.current);
        return () => ro.disconnect();
    }, []);

    const graph = useMemo(() =>
    {
        const g = buildGraph(map, filter);
        const perCol = [0, 1, 2, 3].map((c) => g.nodes.filter((x) => x.col === c).length);
        const height = Math.max(380, Math.max(...perCol) * 30 + 60);
        if (!g.links.length) return { ...g, layout: null, height };
        const layout = sankey<GNode, GLink>().nodeId((d) => d.id).nodeWidth(12).nodePadding(12).nodeAlign((d) => d.col).nodeSort(null as never)
            .extent([[1, 30], [width - 1, height - 6]])({ nodes: g.nodes.map((d) => ({ ...d })), links: g.links.map((d) => ({ ...d })) });
        return { ...g, layout, height };
    }, [map, filter, width]);

    // 마디 하나에서 위아래로 이어진 길만 남깁니다.
    const lit = useMemo(() =>
    {
        if (!hover) return null;
        const nodes = new Set<SNode>(), links = new Set<SLink>();
        if (hover.link) { links.add(hover.link); nodes.add(endOf(hover.link.source)); nodes.add(endOf(hover.link.target)); return { nodes, links }; }
        const walk = (x: SNode, up: boolean) =>
        {
            for (const l of (up ? x.targetLinks : x.sourceLinks) ?? [])
            {
                if (links.has(l)) continue;
                links.add(l);
                const m = endOf(up ? l.source : l.target);
                nodes.add(m); walk(m, up);
            }
        };
        nodes.add(hover.node!); walk(hover.node!, true); walk(hover.node!, false);
        return { nodes, links };
    }, [hover]);

    // 회로도로 펼칠 칸: 고른 칸, 아니면 고른 영역에서 파일이 가장 많은 칸, 아니면 요약 화면의 첫 줄과 같은 칸(테스트를 뺀 가장 무거운 칸)입니다.
    const cell = useMemo(() =>
    {
        if (filter.scope) return flows.find((f) => f.area === filter.area && f.scope === filter.scope);
        if (filter.area) return flows.filter((f) => f.area === filter.area).sort((a, b) => b.files - a.files)[0];
        return flows.filter((f) => f.area !== "test").sort((a, b) => cellChars(b) - cellChars(a))[0];
    }, [flows, filter]);
    const circuit = useMemo(() => cell ? buildCircuit(map, cell) : null, [map, cell]);

    if (!flows.length) return <div className="grid h-full place-items-center text-xs text-muted-foreground">이 맵에는 플로우가 없습니다. 맵을 다시 만들면 채워집니다.</div>;

    const { layout, height, areaFiles } = graph;
    const describe = () =>
    {
        if (!hover) return "마디나 선에 마우스를 올리면 그 길만 남고 나머지는 흐려집니다. 왼쪽 영역을 누르면 그 영역의 흐름만 보고, 아래 회로도도 그 영역으로 바뀝니다.";
        if (hover.link) { const l = hover.link; return `${endOf(l.source).label} → ${endOf(l.target).label} · ${KIND_NAME[l.kind]} · 파일 ${n(l.value)}개`; }
        const d = hover.node!;
        const len = d.ref ? map.nodes.find((x) => x.id === d.ref)?.chars : undefined;
        if (d.type === "area") return `${d.label} — 파일 ${n(areaFiles.get(d.ref!) ?? 0)}개. 누르면 이 영역의 흐름만 봅니다.`;
        if (d.type === "gap") return `${d.label} — 파일 ${n(d.value ?? 0)}개를 열어도 이 축의 지시문이 로드되지 않습니다.`;
        if (d.type === "skill") return `${d.label} 스킬 — 파일 ${n(d.value ?? 0)}개에서 이어집니다${len ? ` · 길이 ${n(len)}자` : ""}. 가리킬 때만 읽힙니다.`;
        return `${d.label} (${TYPE_NAME[d.type]}) — 파일 ${n(d.value ?? 0)}개가 이 지시문을 로드합니다${len ? ` · 길이 ${n(len)}자` : ""}.`;
    };
    const dash = (k: GLink["kind"]) => k === "cmd" ? "7 4" : k === "idx" ? "2 4" : undefined;
    const colX = [0, 1, 2, 3].map((c) => layout?.nodes.find((x) => x.col === c)?.x0);

    return (
        <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-[1280px] space-y-4 px-6 py-5">
                <div>
                    <h2 className="text-sm font-semibold">파일을 열면 컨텍스트가 어디로 이어지나</h2>
                    <p className="mt-0.5 max-w-[80ch] text-xs text-muted-foreground">굵기는 그 연결을 지나는 파일 수입니다. 실선은 자동 로드, 굵은 점선은 규칙의 「엽니다」 지시, 가는 점선은 CLAUDE.md 색인의 안내, 붉은 가지는 있어야 할 지시문이 없는 곳(OPEN)입니다.</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="영역 고르기">
                    {[{ id: null as string | null, label: "전체" }, ...areas].map((a) => (
                        <button
                            key={a.id ?? "all"} type="button" aria-pressed={filter.area === a.id && !filter.scope}
                            onClick={() => onFilter({ ...filter, area: a.id, scope: null })}
                            className={cn("cn-button cn-button-size-xs inline-flex cursor-pointer items-center whitespace-nowrap", filter.area === a.id ? "cn-button-variant-secondary" : "cn-button-variant-ghost")}
                        >{a.label}</button>
                    ))}
                    <label className="ml-auto inline-flex items-center gap-2 text-xs text-muted-foreground">
                        <Switch aria-label="공통 규칙도 보기" checked={filter.common} onCheckedChange={(v) => onFilter({ ...filter, common: v })} />
                        공통 규칙도 보기
                    </label>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    {(["folder", "layer", "domain", "skill", "gap"] as const).map((t) => <span key={t} className="inline-flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm" style={{ background: TYPE_COLOR[t] }} />{t === "gap" ? "OPEN (지시문 없음)" : TYPE_NAME[t]}</span>)}
                    {(["auto", "cmd", "idx"] as const).map((k) => <span key={k} className="inline-flex items-center gap-1.5"><svg width="30" height="8" aria-hidden><line x1="1" y1="4" x2="29" y2="4" stroke="currentColor" strokeWidth={k === "idx" ? 1.5 : 2.5} strokeDasharray={dash(k)} /></svg>{KIND_NAME[k]}</span>)}
                </div>
                <div ref={wrap} className="overflow-x-auto">
                    {layout && (
                        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="영역에서 지시문, 스킬로 이어지는 흐름 그래프" className="cx-flowgraph block" data-lit={lit ? "" : undefined}>
                            {HEADS.map((h, c) => colX[c] != null && <text key={h} className="cx-colhead" x={c === 3 ? colX[c]! + 12 : colX[c]} y={14} textAnchor={c === 3 ? "end" : "start"}>{h}</text>)}
                            <g>
                                {layout.links.map((l, i) => (
                                    <path
                                        key={i} d={sankeyLinkHorizontal()(l) ?? undefined} fill="none" stroke={TYPE_COLOR[endOf(l.target).type]} strokeWidth={Math.max(1, l.width ?? 1)}
                                        className={cn("cx-band", l.kind !== "auto" && l.kind !== "open" && "ptr", lit?.links.has(l) && "on")}
                                        onMouseEnter={() => setHover({ link: l })} onMouseLeave={() => setHover(null)}
                                    />
                                ))}
                            </g>
                            <g pointerEvents="none">
                                {layout.links.filter((l) => l.kind === "cmd" || l.kind === "idx").map((l, i) => (
                                    <path key={i} d={sankeyLinkHorizontal()(l) ?? undefined} fill="none" stroke={TYPE_COLOR[endOf(l.target).type]} strokeWidth={l.kind === "cmd" ? 2 : 1.4} strokeDasharray={dash(l.kind)} className={cn("cx-center", lit?.links.has(l) && "on")} />
                                ))}
                            </g>
                            {layout.nodes.map((d) => (
                                <g
                                    key={d.id} tabIndex={0} role="button" aria-label={d.label} className={cn("cx-node", lit?.nodes.has(d) && "on")}
                                    onMouseEnter={() => setHover({ node: d })} onMouseLeave={() => setHover(null)} onFocus={() => setHover({ node: d })} onBlur={() => setHover(null)}
                                    onClick={() => d.type === "area" ? onFilter({ ...filter, area: filter.area === d.ref ? null : d.ref!, scope: null }) : d.ref && onSelect(d.ref)}
                                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (d.type === "area") onFilter({ ...filter, area: filter.area === d.ref ? null : d.ref!, scope: null }); else if (d.ref) onSelect(d.ref); } }}
                                >
                                    <rect x={d.x0} y={d.y0} width={(d.x1 ?? 0) - (d.x0 ?? 0)} height={Math.max(2, (d.y1 ?? 0) - (d.y0 ?? 0))} rx={2} fill={TYPE_COLOR[d.type]} />
                                    <text x={d.col === 3 ? (d.x0 ?? 0) - 6 : (d.x1 ?? 0) + 6} y={((d.y0 ?? 0) + (d.y1 ?? 0)) / 2} dy="0.35em" textAnchor={d.col === 3 ? "end" : "start"}>
                                        {d.col === 0 ? `${d.label} · ${n(areaFiles.get(d.ref!) ?? 0)}` : d.label}
                                    </text>
                                </g>
                            ))}
                        </svg>
                    )}
                </div>
                <p className="min-h-10 border-l-2 pl-3 text-xs text-muted-foreground" aria-live="polite">{describe()}</p>

                {circuit && (
                    <div className="space-y-3 border-t pt-5">
                        <div>
                            <h2 className="text-sm font-semibold">회로도 · {circuit.flow.areaLabel} · {circuit.flow.scope}</h2>
                            <p className="mt-0.5 max-w-[80ch] text-xs text-muted-foreground">고른 칸 하나를 회로도로 펼칩니다. 입력 핀이 건드린 파일, 실선이 자동으로 로드되는 지시문, 점선 박스가 가리켜야 열리는 스킬입니다. 위치를 바꾸면 그 위치의 회로가 그려집니다.</p>
                        </div>
                        <div className="flex flex-wrap gap-1.5" role="group" aria-label="위치 고르기">
                            {flows.filter((f) => f.area === circuit.flow.area).sort((a, b) => b.files - a.files).map((f) => (
                                <button
                                    key={f.scope} type="button" aria-pressed={f.scope === circuit.flow.scope}
                                    onClick={() => onFilter({ ...filter, area: f.area, scope: f.scope })}
                                    className={cn("cn-button cn-button-size-xs inline-flex cursor-pointer items-center whitespace-nowrap", f.scope === circuit.flow.scope ? "cn-button-variant-secondary" : "cn-button-variant-ghost")}
                                >{scopeName(f.scope)} <span className="num ml-1 opacity-70">{n(f.files)}</span></button>
                            ))}
                        </div>
                        <CircuitDiagram circuit={circuit} alwaysChars={map.meta.alwaysChars} onSelect={onSelect} />
                    </div>
                )}
            </div>
        </div>
    );
}

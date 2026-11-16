import { Switch, SwitchThumb } from "@ui-sdk/react/switch";
import { Background, BaseEdge, Controls, getBezierPath, Handle, MarkerType, Panel, Position, ReactFlow, type Edge as FlowEdge, type EdgeProps, type Node as FlowNode, type NodeProps } from "@xyflow/react";
import { FileText, FolderTree, ListTree, Play, Route, Sparkles, Bot, Webhook, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import "@xyflow/react/dist/style.css";

import { LevelDot, Meter } from "@/components/bits";
import { LEVELS, n, secs, type ContextMap, type Kind, type Level, type MapNode, type Trace } from "@/data";
import { cn } from "@/lib/utils";

const W = 196;
const H = 52;
const GAP = 8;
const ICON: Record<Kind, typeof FileText> = { root: FileText, nested: FolderTree, rule: Route, skill: Sparkles, agent: Bot, hook: Webhook };

interface CtxData extends Record<string, unknown> { node?: MapNode; label?: string; sub?: string; level?: Level; limit: number; order?: number; at?: number; dim?: false | "far" | "quiet"; picked?: boolean; pseudo?: "trigger" | "listing"; chars?: number }

function CtxNode({ data }: NodeProps<FlowNode<CtxData>>)
{
    const { node, limit } = data;
    const Icon = data.pseudo === "trigger" ? (data.label === "세션 시작" ? Play : Zap) : data.pseudo === "listing" ? ListTree : ICON[node!.kind];
    const level = data.level ?? node?.level;
    return (
        <div
            className={cn("relative w-[196px] rounded-md border bg-card text-card-foreground transition-opacity", data.dim === "far" && "opacity-25", data.dim === "quiet" && "opacity-75", data.picked && "ring-2 ring-primary", data.pseudo === "trigger" && "bg-secondary")}
        >
            <Handle position={Position.Left} type="target" />
            <Handle position={Position.Right} type="source" />
            <div className="px-2.5 py-2">
                <div className="flex items-center gap-1.5">
                    {level ? <LevelDot level={level} /> : null}
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">{data.label ?? node!.title}</span>
                    {data.order != null && <span className="num shrink-0 rounded bg-primary px-1 text-[10px] text-primary-foreground">{data.order}</span>}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10.5px] text-muted-foreground">
                    {data.sub
                        ? <span className="truncate">{data.sub}</span>
                        : node!.level === 2
                            ? <><Meter value={node!.chars} max={limit} className="flex-1" /><span className="num shrink-0">{n(node!.chars)}자</span></>
                            : node!.kind === "skill" || node!.kind === "agent"
                                ? <><span className="truncate">설명 <span className="num">{n(node!.listingChars)}</span> · 본문 <span className="num">{n(node!.chars)}</span>자</span></>
                                : <span className="num">{n(node!.chars)}자</span>}
                    {data.at != null && <span className="num ml-auto shrink-0 text-foreground">+{secs(data.at)}</span>}
                </div>
            </div>
        </div>
    );
}

function LaneNode({ data }: NodeProps<FlowNode<{ level?: Level; title: string; who: string }>>)
{
    return (
        <div className="pointer-events-none w-[196px]">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                {data.level && <LevelDot level={data.level} />}{data.level && <span className="num">{data.level}</span>}{data.title}
            </div>
            <div className="text-[10.5px] text-muted-foreground">{data.who}</div>
        </div>
    );
}

// 모델이 골라야 가는 길은 점선으로 그립니다.
function SoftEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style }: EdgeProps)
{
    const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
    return <BaseEdge id={id} path={path} style={{ strokeDasharray: "4 4", ...style }} />;
}

// 이 세션이 실제로 지나간 길에는 점 하나가 길을 따라 흐릅니다.
function WalkedEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style }: EdgeProps)
{
    const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
    return (
        <>
            <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
            <circle r="3.5" fill="var(--primary)"><animateMotion dur="2s" path={path} repeatCount="indefinite" /></circle>
        </>
    );
}

const nodeTypes = { ctx: CtxNode, lane: LaneNode };
const edgeTypes = { animated: WalkedEdge, soft: SoftEdge };

interface Props { map: ContextMap; trace: Trace | null; selected: string | null; onSelect: (id: string | null) => void }

export function MapView({ map, trace, selected, onSelect }: Props)
{
    const [overlay, setOverlay] = useState(true);
    const showTrace = overlay && !!trace;

    const { nodes, edges } = useMemo(() =>
    {
        const limit = map.meta.limits.onDemand200k;
        const of = (kind: Kind[], level?: Level) => map.nodes.filter((x) => kind.includes(x.kind) && (level == null || x.level === level));
        const nested = of(["nested"]).sort((a, b) => b.chars - a.chars);
        const rules = of(["rule"], 2).sort((a, b) => b.chars - a.chars);
        const hooks = of(["hook"]);
        const always = [...of(["root"]), ...of(["rule"], 1)];
        const l4 = of(["skill", "agent"], 4);
        const l5 = of(["skill", "agent"], 5).sort((a, b) => (b.listingChars ?? 0) - (a.listingChars ?? 0));
        const listingChars = of(["skill", "agent"]).reduce((a, x) => a + (x.listingChars ?? 0), 0);

        // 이 세션에서 실린 차례와 때를 노드에 붙입니다.
        const hit = new Map<string, { order: number; at: number }>();
        if (showTrace)
        {
            let k = 0;
            for (const r of trace!.rows) if (r.nodeId && !hit.has(r.nodeId)) hit.set(r.nodeId, { order: ++k, at: r.at });
        }
        const neighbors = new Set<string>();
        if (selected)
        {
            neighbors.add(selected);
            for (const e of map.edges)
            {
                if (e.from === selected) neighbors.add(e.to);
                if (e.to === selected) neighbors.add(e.from);
            }
        }

        const X = { trig: 0, l1: 236, nested: 472, rules: 684, l4: 926, l5: 1162 };
        const ns: FlowNode[] = [];
        const lane = (id: string, x: number, title: string, who: string, level?: Level) => ns.push({ id: `lane:${id}`, type: "lane", position: { x, y: -48 }, data: { level, title, who }, selectable: false, draggable: false });
        const put = (node: MapNode, x: number, row: number, y0 = 0) =>
        {
            const h = hit.get(node.id);
            const dim = selected ? (!neighbors.has(node.id) && "far") : showTrace && !h && node.level !== 1 ? "quiet" : false;
            ns.push({ id: node.id, type: "ctx", position: { x, y: y0 + row * (H + GAP) }, data: { node, limit, order: h?.order, at: h?.at, dim, picked: selected === node.id } satisfies CtxData });
        };
        const pseudo = (id: string, x: number, y: number, label: string, sub: string, kind: "trigger" | "listing", level?: Level) =>
            ns.push({ id, type: "ctx", position: { x, y }, data: { label, sub, limit, pseudo: kind, level, dim: selected ? "far" : false } satisfies CtxData });

        lane("trig", X.trig, "일어나는 일", "무엇이 싣기를 일으키나");
        lane("l1", X.l1, LEVELS[1].label, LEVELS[1].who, 1);
        lane("nested", X.nested, LEVELS[2].label, "폴더 지시문", 2);
        lane("rules", X.rules, LEVELS[2].label, "경로 규칙", 2);
        lane("l4", X.l4, LEVELS[4].label, LEVELS[4].who, 4);
        lane("l5", X.l5, LEVELS[5].label, LEVELS[5].who, 5);

        const hooksY = (rules.length + 1) * (H + GAP) + 40;
        pseudo("t:session", X.trig, 0, "세션 시작", "압축 뒤에도 다시", "trigger");
        pseudo("t:file", X.trig, 3 * (H + GAP), "파일을 읽거나 고칠 때", "Read · Edit · Write", "trigger");
        if (hooks.length) pseudo("t:event", X.trig, hooksY, "도구를 쓰거나 응답이 끝날 때", "훅 사건", "trigger");
        always.forEach((x, i) => put(x, X.l1, i));
        pseudo("listing", X.l1, always.length * (H + GAP), "스킬 · 서브에이전트 목록", `설명 ${l4.length + l5.length}개 · ${n(listingChars)}자`, "listing", 1);
        nested.forEach((x, i) => put(x, X.nested, i));
        rules.forEach((x, i) => put(x, X.rules, i));
        if (hooks.length) ns.push({ id: "lane:l3", type: "lane", position: { x: X.rules, y: hooksY - 48 }, data: { level: 3, title: LEVELS[3].label, who: LEVELS[3].who }, selectable: false, draggable: false });
        hooks.forEach((x, i) => put(x, X.rules, i, hooksY));
        l4.forEach((x, i) => put(x, X.l4, i));
        const rows = Math.ceil(l5.length / 2);
        l5.forEach((x, i) => put(x, X.l5 + Math.floor(i / rows) * (W + 16), i % rows));

        const es: FlowEdge[] = [];
        const arrow = { type: MarkerType.ArrowClosed, width: 14, height: 14 };
        const push = (from: string, to: string, kind: "hard" | "soft" | "pick") =>
        {
            const walked = showTrace && hit.has(to) && (kind !== "soft" || hit.has(from) || from === "listing");
            const near = selected ? from === selected || to === selected : true;
            // 설명만 보고 고르는 길은 수가 많아서, 실제로 지나갔거나 그 스킬을 골랐을 때만 그립니다.
            if (kind === "pick" && !walked && to !== selected) return;
            const faded = selected ? !near : showTrace ? !walked : false;
            es.push({
                id: `${from}→${to}`, source: from, target: to,
                type: walked && !selected ? "animated" : kind === "hard" ? "default" : "soft",
                markerEnd: kind === "hard" ? arrow : undefined,
                style: { opacity: faded ? (selected ? 0.15 : 0.4) : 1, strokeWidth: near && selected ? 1.6 : 1 },
            });
        };
        always.forEach((x) => push("t:session", x.id, "hard"));
        push("t:session", "listing", "hard");
        [...nested, ...rules].forEach((x) => push("t:file", x.id, "hard"));
        hooks.forEach((x) => push("t:event", x.id, "hard"));
        const ids = new Set(map.nodes.map((x) => x.id));
        const namedTargets = new Set<string>();
        for (const e of map.edges)
        {
            if (!ids.has(e.from) || !ids.has(e.to)) continue;
            const src = map.nodes.find((x) => x.id === e.from)!;
            const dst = map.nodes.find((x) => x.id === e.to)!;
            // 그림에는 왼쪽에서 오른쪽으로 가는 길만 그립니다. 스킬끼리 부르는 길은 검사기에서 봅니다.
            if (e.kind === "soft" && ["root", "nested", "rule"].includes(src.kind) && ["skill", "agent"].includes(dst.kind))
            {
                push(e.from, e.to, "soft");
                namedTargets.add(e.to);
            }
        }
        [...l4, ...l5].forEach((x) => { if (!namedTargets.has(x.id) || x.level === 5) push("listing", x.id, "pick"); });
        return { nodes: ns, edges: es };
    }, [map, trace, selected, showTrace]);

    return (
        <div className="relative h-full">
            <ReactFlow
                nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
                fitView panOnScroll zoomOnDoubleClick={false} panOnDrag selectionOnDrag={false} nodesDraggable={false} nodesConnectable={false} elementsSelectable minZoom={0.25} maxZoom={1.5}
                fitViewOptions={{ padding: 0.04 }}
                onNodeClick={(_, node) => onSelect(node.type === "ctx" && !(node.data as CtxData).pseudo ? node.id : null)}
                onPaneClick={() => onSelect(null)}
            >
                <Background bgColor="var(--sidebar)" />
                <Controls showInteractive={false} position="bottom-left" className="gap-px overflow-hidden rounded-md border bg-card p-1 shadow-none! [&>button]:rounded-md [&>button]:border-none! [&>button]:bg-transparent! [&>button]:hover:bg-secondary!" />
                <Panel position="bottom-center" className="m-3 flex overflow-hidden rounded-md border bg-card items-center gap-4 px-3 py-1.5 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1.5"><svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="currentColor" strokeWidth="1.5" /></svg>기계가 싣는 길</span>
                    <span className="flex items-center gap-1.5"><svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" /></svg>모델이 골라야 가는 길</span>
                    {trace && (
                        <label className="no-print flex cursor-pointer items-center gap-1.5 text-foreground">
                            <Switch checked={overlay} onCheckedChange={(v) => setOverlay(v)} className="relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full bg-ring outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 data-[checked]:bg-primary">
                                <SwitchThumb className="block size-3 translate-x-0.5 rounded-full bg-card transition-transform data-[checked]:translate-x-3.5" />
                            </Switch>
                            이 세션이 지나간 길 겹쳐 보기
                        </label>
                    )}
                </Panel>
            </ReactFlow>
        </div>
    );
}

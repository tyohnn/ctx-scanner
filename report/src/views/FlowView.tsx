import { ArrowRight, CornerDownRight } from "lucide-react";
import { useMemo, useState } from "react";

import { Chars } from "@/components/bits";
import { Input, Segmented } from "@/components/ui";
import { n, type ContextMap, type Flow, type MapNode } from "@/data";
import { cn } from "@/lib/utils";

interface Props { map: ContextMap; selected: string | null; onSelect: (id: string | null) => void; onOpenAdvice: () => void }

// 한 줄이 플로우 하나입니다. 왼쪽에서 오른쪽으로 「건드리는 파일 → 자동으로 로드되는 것(폴더 · 계층 · 도메인) → 필요할 때만 읽는 것」 순서입니다.
// 같은 영역의 줄을 위아래로 나란히 두어서, 어느 위치에서 어느 축이 비어 있는지가 한눈에 보입니다.
const COLS = "grid grid-cols-[minmax(220px,1.3fr)_minmax(150px,1fr)_minmax(150px,1fr)_minmax(150px,1fr)_84px_minmax(200px,1.2fr)] gap-x-4";

export function FlowView({ map, selected, onSelect, onOpenAdvice }: Props)
{
    const flows = map.flows ?? [];
    const byId = useMemo(() => new Map(map.nodes.map((x) => [x.id, x])), [map]);
    const areas = (map.meta.areas ?? []).filter((a) => flows.some((f) => f.area === a.id));
    const [area, setArea] = useState("all");
    const [query, setQuery] = useState("");
    const q = query.trim().toLowerCase();
    const shown = flows.filter((f) => (area === "all" || f.area === area) && (!q || f.scope.toLowerCase().includes(q) || f.example.toLowerCase().includes(q) || [...f.folder, ...f.layer, ...f.domain].some((id) => byId.get(id)?.title.toLowerCase().includes(q))));
    const groups = areas.map((a) => ({ area: a, rows: shown.filter((f) => f.area === a.id) })).filter((g) => g.rows.length);
    const notes = (id: string) => map.suggestions.filter((s) => s.kind === "mece" && (s.id === `gap:${id}` || s.id === `no-layer:${id}`));

    if (!flows.length) return <div className="grid h-full place-items-center text-xs text-muted-foreground">이 맵에는 플로우가 없습니다. 맵을 다시 만들면 채워집니다.</div>;

    return (
        <div className="flex h-full flex-col">
            <div className="flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-2.5">
                <Segmented
                    label="개발 영역" value={area} onChange={setArea}
                    items={[{ value: "all", label: <>전체 <span className="num opacity-70">{flows.length}</span></> }, ...areas.map((a) => ({ value: a.id, label: <>{a.label} <span className="num opacity-70">{flows.filter((f) => f.area === a.id).length}</span></> }))]}
                />
                <Input aria-label="위치나 지시문 이름으로 찾기" value={query} onValueChange={(v) => setQuery(v)} spellCheck={false} placeholder="위치나 지시문으로 찾기" className="num w-64" />
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
                <div className="min-w-[1080px]">
                    <div className={cn(COLS, "sticky top-0 z-10 border-b bg-background px-4 py-2 text-[11px] font-semibold text-muted-foreground")}>
                        <div>① 건드리는 파일</div>
                        <div className="flex items-center gap-1.5"><ArrowRight className="size-3" />② 폴더 <span className="font-normal">어느 폴더 아래인가</span></div>
                        <div>② 계층 <span className="font-normal">어떤 종류의 파일인가</span></div>
                        <div>② 도메인 <span className="font-normal">어느 도메인의 코드인가</span></div>
                        <div className="text-right">자동 로드</div>
                        <div className="flex items-center gap-1.5"><CornerDownRight className="size-3" />③ 필요할 때만 <span className="font-normal">지시문이 가리키는 스킬</span></div>
                    </div>

                    {groups.map(({ area: a, rows }) =>
                    {
                        const any = { layer: rows.some((f) => f.layer.length), domain: rows.some((f) => f.domain.length) };
                        return (
                            <section key={a.id}>
                                <div className="flex items-baseline gap-3 border-b bg-sidebar px-4 py-1.5">
                                    <h3 className="text-xs font-semibold">{a.label}</h3>
                                    <code className="num truncate text-[11px] text-muted-foreground">{a.paths.join("  ")}</code>
                                    <span className="num ml-auto shrink-0 text-[11px] text-muted-foreground">{rows.length}곳 · 파일 {n(rows.reduce((s, f) => s + f.files, 0))}개</span>
                                </div>
                                {notes(a.id).map((s) => (
                                    <button key={s.id} type="button" onClick={onOpenAdvice} className="flex w-full items-center gap-2 border-b px-4 py-1.5 text-left text-[11px] text-muted-foreground hover:text-foreground">
                                        <span className="inline-block size-1.5 shrink-0 rounded-full" style={{ background: "var(--warning)" }} />{s.title}
                                    </button>
                                ))}
                                {rows.map((f) => <FlowRow key={f.id} flow={f} byId={byId} any={any} selected={selected} onSelect={onSelect} />)}
                            </section>
                        );
                    })}
                    {!groups.length && <div className="px-4 py-10 text-center text-xs text-muted-foreground">조건에 맞는 플로우가 없습니다.</div>}
                </div>
            </div>
        </div>
    );
}

function FlowRow({ flow, byId, any, selected, onSelect }: { flow: Flow; byId: Map<string, MapNode>; any: { layer: boolean; domain: boolean }; selected: string | null; onSelect: (id: string) => void })
{
    const auto = flow.chars.folder + flow.chars.layer + flow.chars.domain + flow.chars.common;
    const chips = (ids: string[]) => ids.map((id) => byId.get(id)).filter((x): x is MapNode => !!x).map((x) => <Chip key={x.id} node={x} scope={flow.scope} picked={selected === x.id} onSelect={onSelect} chars />);
    // 같은 영역의 다른 위치에는 있는데 이 위치에만 없으면 빈칸으로 표시합니다. 영역 전체에 없으면 그냥 비워 둡니다.
    const empty = (siblings: boolean) => siblings ? <span className="cn-badge cn-badge-variant-secondary inline-flex items-center whitespace-nowrap" style={{ color: "var(--warning)" }}>빈칸</span> : <span className="text-[11px] text-muted-foreground">없음</span>;
    return (
        <div className={cn(COLS, "items-start border-b px-4 py-2 text-xs")}>
            <div className="min-w-0">
                <div className="flex items-baseline gap-2"><span className="num font-medium">{flow.scope}</span><span className="num text-[11px] text-muted-foreground">{n(flow.files)}개</span></div>
                <div className="num truncate text-[11px] text-muted-foreground" title={flow.example}>{flow.example.startsWith(flow.scope + "/") ? flow.example.slice(flow.scope.length + 1) : flow.example}</div>
                {flow.variants > 1 && <div className="text-[10.5px] text-muted-foreground">이 가운데 {n(flow.exampleFiles)}개 기준 · 로드되는 조합이 {flow.variants}가지</div>}
            </div>
            <div className="flex min-w-0 flex-wrap gap-1">{flow.folder.length ? chips(flow.folder) : empty(false)}</div>
            <div className="flex min-w-0 flex-wrap gap-1">
                {flow.layer.length ? chips(flow.layer) : empty(any.layer)}
                {flow.common.length > 0 && <span className="w-full truncate text-[10.5px] text-muted-foreground" title={flow.common.map((id) => byId.get(id)?.title).join(", ")}>그 밖의 규칙 {flow.common.map((id) => byId.get(id)?.title).join(" · ")}</span>}
            </div>
            <div className="flex min-w-0 flex-wrap gap-1">{flow.domain.length ? chips(flow.domain) : empty(any.domain)}</div>
            <div className="text-right"><Chars value={auto} /></div>
            <div className="min-w-0 space-y-1">
                {flow.skills.length === 0 && <span className="text-[11px] text-muted-foreground">가리키는 스킬 없음</span>}
                {flow.skills.map((s) =>
                {
                    const node = byId.get(s.id);
                    const next = flow.next.filter((x) => x.via === s.id);
                    if (!node) return null;
                    return (
                        <div key={s.id} className="flex flex-wrap items-center gap-1" title={`${byId.get(s.via)?.title ?? s.via} 이 가리킵니다`}>
                            <Chip node={node} picked={selected === node.id} onSelect={onSelect} dashed />
                            {next.map((x) => byId.get(x.id) && (
                                <span key={x.id} className="inline-flex items-center gap-1">
                                    <ArrowRight className="size-3 text-muted-foreground" />
                                    <Chip node={byId.get(x.id)!} picked={selected === x.id} onSelect={onSelect} dashed sub={x.files ? `파일 ${x.files}` : undefined} />
                                </span>
                            ))}
                        </div>
                    );
                })}
                {flow.docCount > 0 && <div className="truncate text-[10.5px] text-muted-foreground" title={flow.docs.join("\n")}>문서 {flow.docCount}곳 참조</div>}
            </div>
        </div>
    );
}

function Chip({ node, scope, picked, onSelect, chars, dashed, sub }: { node: MapNode; scope?: string; picked: boolean; onSelect: (id: string) => void; chars?: boolean; dashed?: boolean; sub?: string })
{
    // 폴더 지시문은 그 위치에서 본 상대 경로로 적습니다. 위치 바로 아래의 것은 파일 이름만 남습니다.
    const rel = node.kind === "nested" && scope && node.path.startsWith(scope + "/") ? node.path.slice(scope.length + 1) : node.path;
    const label = node.kind === "nested" ? (rel.length > 30 ? "…" + rel.slice(-29) : rel) : node.title;
    return (
        <button
            type="button" onClick={() => onSelect(node.id)} title={node.path}
            className={cn("num inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded border bg-background px-1.5 py-0.5 text-[11px] hover:bg-muted", dashed && "border-dashed", picked && "bg-muted ring-1 ring-ring")}
        >
            <span className="truncate">{label}</span>
            {chars && <span className="shrink-0 text-muted-foreground">{n(node.chars)}</span>}
            {sub && <span className="shrink-0 text-muted-foreground">{sub}</span>}
            {node.kind === "skill" && node.listing && node.listing !== "on" && <span className="shrink-0 text-muted-foreground">목록에 없음</span>}
        </button>
    );
}

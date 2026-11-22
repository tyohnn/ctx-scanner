import { useMemo, useState } from "react";
import { FileCode } from "lucide-react";

import { CanvasPage, Chip, Crumb, FlowColumns, Note, PanelHead, Pill, SideHead, SideLabel, Stats, TableBar, td, th, type CardData } from "@/canvas/parts";
import { canvasKind, kindIcon, kindTint, nodeIndex, skillName } from "@/canvas/kinds";
import { n, shortPath, type ContextMap, type Flow } from "@/data";

interface Props { map: ContextMap; onSelect: (id: string) => void }

const AXES = [
    { key: "folder", label: "폴더", title: "폴더 지시문", bar: "var(--bar-folder)", kind: "folder" },
    { key: "layer", label: "계층", title: "계층 규칙", bar: "var(--bar-layer)", kind: "rule" },
    { key: "common", label: "공통", title: "공통 규칙", bar: "var(--bar-common)", kind: "common" },
    { key: "domain", label: "용어", title: "용어 규칙", bar: "var(--bar-term)", kind: "term" },
] as const;
const PILLS = 8;
const sumOf = (f: Flow) => f.chars.folder + f.chars.layer + f.chars.common + f.chars.domain;

// 위치(앱 · 패키지) 하나를 고르면 그 안의 영역마다 「파일을 건드리면 무엇이 로드되고, 그것이 어떤 스킬을 가리키는지」를 왼쪽에서
// 오른쪽으로 그립니다. 아래 표는 같은 위치의 영역을 견주고, 오른쪽 패널은 고른 영역의 지시문을 나열합니다.
export function AreaCanvasView({ map, onSelect }: Props)
{
    const flows = map.flows ?? [];
    const nodes = useMemo(() => nodeIndex(map), [map]);
    const scopes = useMemo(() =>
    {
        const files = new Map<string, number>();
        for (const f of flows) files.set(f.scope, (files.get(f.scope) ?? 0) + f.files);
        return [...files].sort((a, b) => b[1] - a[1]).map(([s]) => s);
    }, [flows]);
    const [scope, setScope] = useState(scopes[0] ?? "");
    const inScope = useMemo(() => flows.filter((f) => f.scope === scope).sort((a, b) => b.files - a.files), [flows, scope]);
    const [areaId, setAreaId] = useState<string | null>(null);
    const flow = inScope.find((f) => f.id === areaId) ?? inScope[0];
    const gapIds = new Set([...(map.gaps?.layer ?? []), ...(map.gaps?.domain ?? [])].filter((g) => g.scope === scope).map((g) => g.id));
    const pickScope = (s: string) => { setScope(s); setAreaId(null); };

    if (!flow) return <CanvasPage main={<div className="p-6 text-muted-foreground">이 맵에는 영역 플로우가 없습니다.</div>} />;

    const chars = (p: string) => nodes.get(p)?.chars ?? 0;
    const open = (p: string) => { const x = nodes.get(p); if (x) onSelect(x.id); };
    const autoCards: CardData[] = AXES.filter((a) => flow[a.key].length).map((a) =>
    {
        const paths = flow[a.key];
        const name = paths.length === 1 ? (a.key === "folder" ? shortPath(paths[0], 2) : paths[0].split("/").pop()?.replace(/\.md$/, "")) : `${paths.length}개`;
        return {
            key: a.key, title: a.title, meta: [name, `${n(flow.chars[a.key])}자`], icon: kindIcon(a.kind), tint: kindTint(a.kind),
            titleAttr: paths.join("\n"), onClick: () => open(paths[0]),
        };
    });
    const skills = [...new Map(flow.skills.map((s) => [s.id, s])).values()];
    const skillCards: CardData[] = skills.slice(0, 4).map((s) => ({
        key: s.id, title: skillName(s.id), meta: [`${shortPath(s.via, 2)} 가 가리킴`], icon: kindIcon("skill"), tint: kindTint("skill"), titleAttr: s.id, onClick: () => open(s.id),
    }));
    const next = [...new Map(flow.next.filter((x) => !skills.some((s) => s.id === x.id)).map((x) => [x.id, x])).values()];
    const nextCards: CardData[] = next.slice(0, 4).map((x) => ({
        key: `next:${x.id}`, title: skillName(x.id), meta: [`${skillName(x.via)} 가 가리킴`], icon: kindIcon("skill"), tint: kindTint("skill"), titleAttr: x.id, onClick: () => open(x.id),
    }));
    const autoAxes = AXES.filter((a) => flow[a.key].length);
    const skillFrom = autoAxes.map((a, i) => skills.slice(0, 4).some((s) => flow[a.key].includes(s.via)) ? i : -1).filter((i) => i >= 0);
    const nextFrom = [...new Set(next.slice(0, 4).map((x) => skills.slice(0, 4).findIndex((s) => s.id === x.via)).filter((i) => i >= 0))];
    const fileCard: CardData = {
        key: "file", title: flow.areaLabel, meta: [`파일 ${n(flow.files)}개`], icon: <FileCode />, tint: "var(--kind-root)", picked: true, titleAttr: flow.example,
    };
    const max = Math.max(1, ...inScope.map(sumOf));
    const total = sumOf(flow);
    const top = AXES.map((a) => ({ a, v: flow.chars[a.key] })).sort((x, y) => y.v - x.v)[0];
    const biggest = flow[top.a.key].map((p) => ({ p, c: chars(p) })).sort((x, y) => y.c - x.c)[0];
    const loaded = AXES.flatMap((a) => flow[a.key].map((p) => ({ p, kind: a.kind }))).sort((x, y) => chars(y.p) - chars(x.p));

    const main = (
        <>
            <PanelHead left={<Crumb repo={map.meta.repo} view="영역">{scope}</Crumb>} />
            <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3">
                {scopes.slice(0, PILLS).map((s) => <Pill key={s} on={s === scope} onClick={() => pickScope(s)}>{s.split("/").pop()}</Pill>)}
                {scopes.length > PILLS && (
                    <select
                        aria-label="다른 위치" value={scopes.indexOf(scope) >= PILLS ? scope : ""} onChange={(e) => e.target.value && pickScope(e.target.value)}
                        className="min-h-8 rounded-full border bg-card px-3 text-[13px]"
                    >
                        <option value="">다른 위치 {scopes.length - PILLS}</option>
                        {scopes.slice(PILLS).map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                )}
            </div>
            <FlowColumns
                heads={["건드리는 파일", "자동으로 로드", "지시문이 가리키는 스킬", "그 스킬이 가리키는 스킬"]}
                columns={[{ cards: [fileCard] }, { cards: autoCards }, { cards: skillCards, from: skillFrom }, { cards: nextCards, from: nextFrom }]}
            />
            <TableBar
                left={<div className="flex items-center gap-2 px-1 font-medium">영역별 {gapIds.size > 0 && <Chip tone="orange">빈칸 {gapIds.size}</Chip>}</div>}
                right={AXES.map((a) => <span key={a.key} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: a.bar }} />{a.label}</span>)}
            />
            <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-[13px]">
                    <thead><tr><th className={th}>영역</th><th className={`${th} text-right`}>파일</th><th className={`${th} w-[38%]`}>자동 로드</th><th className={`${th} text-right`}>합계</th><th className={`${th} text-right`}>스킬</th></tr></thead>
                    <tbody>
                        {inScope.map((f) => (
                            <tr key={f.id} onClick={() => setAreaId(f.id)} className="cursor-pointer hover:bg-muted/60" style={f.id === flow.id ? { background: "var(--canvas-picked-soft)" } : undefined}>
                                <td className={`${td} font-medium`}>{f.areaLabel}{gapIds.has(f.id) && <Chip tone="orange" className="ml-2">빈칸</Chip>}</td>
                                <td className={`${td} text-right tabular-nums`}>{n(f.files)}</td>
                                <td className={td}>
                                    <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" style={{ width: `${Math.max(4, sumOf(f) / max * 100)}%` }}>
                                        {AXES.map((a) => f.chars[a.key] > 0 && <span key={a.key} style={{ width: `${f.chars[a.key] / sumOf(f) * 100}%`, background: a.bar }} />)}
                                    </div>
                                </td>
                                <td className={`${td} text-right tabular-nums`}>{n(sumOf(f))}</td>
                                <td className={`${td} text-right tabular-nums text-muted-foreground`}>{new Set(f.skills.map((s) => s.id)).size}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );

    const side = (
        <>
            <SideHead icon={<FileCode />} tint="var(--kind-root)" title={flow.areaLabel} sub={`${flow.scope} · ${shortPath(flow.example, 2)}`} />
            <div className="mt-4"><Note>이 영역의 파일 하나를 고치면 아래 지시문이 함께 로드됩니다. 예: <code className="text-xs">{flow.example}</code></Note></div>
            <div className="mt-4">
                <Stats items={[
                    { label: "자동 로드", value: `${n(total)}자` },
                    { label: "파일", value: n(flow.files) },
                    { label: "가리키는 스킬", value: skills.length },
                    { label: "가리키는 문서", value: flow.docCount },
                ]} />
            </div>
            {total > 0 && biggest && (
                <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                    {top.a.title}가 {Math.round(top.v / total * 100)}% 입니다. <b className="font-medium text-foreground">{shortPath(biggest.p, 2)}</b> 하나가 {n(biggest.c)}자를 차지합니다.
                </p>
            )}
            <SideLabel right="크기">로드되는 지시문 {loaded.length}</SideLabel>
            <ul className="divide-y">
                {loaded.map(({ p, kind }) => (
                    <li key={p}>
                        <button type="button" onClick={() => open(p)} className="flex min-h-10 w-full items-center gap-2 text-left text-[13px] hover:bg-muted/60">
                            <span className="size-2 shrink-0 rounded-full" style={{ background: kindTint(canvasKind(nodes.get(p)) === "root" ? "root" : kind) }} />
                            <span className="min-w-0 flex-1 truncate" title={p}>{shortPath(p, 3)}</span>
                            <span className="tabular-nums text-muted-foreground">{n(chars(p))}</span>
                        </button>
                    </li>
                ))}
            </ul>
            {skills.length + next.length > 8 && <p className="mt-3 text-xs text-muted-foreground">그래프에는 스킬을 열마다 넷까지 그립니다. 전체는 스킬 {skills.length}개, 그 다음 스킬 {next.length}개입니다.</p>}
        </>
    );

    return <CanvasPage main={main} side={side} />;
}

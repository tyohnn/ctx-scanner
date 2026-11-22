import { useMemo, useState, type ReactNode } from "react";
import { CircleAlert, Link2Off } from "lucide-react";

import { BarTab, CanvasPage, Chip, Crumb, Note, PanelHead, SideHead, SideLabel, Stats, TableBar, TreeGraph, td, th, type CardData, type ChipTone } from "@/canvas/parts";
import { kindIcon, kindTint, type CanvasKind } from "@/canvas/kinds";
import { kindLabel, n, shortPath, type ContextMap, type MapNode, type Suggestion } from "@/data";

interface Props { map: ContextMap; onSelect: (id: string) => void }

type GroupKey = "folder" | "rule-paths" | "rule-always" | "skill" | "agent" | "hook" | "gaps" | "dead";
interface Group { key: GroupKey; title: string; sub: string; kind: CanvasKind | null; when: string; nodes: MapNode[]; warn?: boolean }

const SEVERITY: Record<Suggestion["severity"], { label: string; tone: ChipTone }> = { high: { label: "높음", tone: "red" }, medium: { label: "중간", tone: "orange" }, low: { label: "낮음", tone: "gray" } };
const VERDICT: Record<string, string> = { accept: "받아들임", modify: "고쳐서", keep: "두기", "false-positive": "오탐" };
const KIND: Record<string, string> = { mece: "겹침", demote: "내리기", placement: "위치", content: "내용", coverage: "빈칸", "dead-glob": "빈 패턴", "dead-ref": "깨진 참조", truncation: "잘림", skill: "스킬", hook: "훅", agent: "에이전트", rule: "규칙" };

// 저장소의 지시문을 종류별로 묶어 나무로 그립니다. 맨 위가 루트, 그 아래가 종류별 묶음, 마지막 줄이 빈칸과 깨진 참조입니다.
// 묶음을 누르면 오른쪽에 그 묶음의 지시문이 큰 순서로 나옵니다. 지시문 하나를 누르면 상세 패널이 열립니다.
export function StructureView({ map, onSelect }: Props)
{
    const [picked, setPicked] = useState<GroupKey>("folder");
    const [tab, setTab] = useState<"suggestions" | "dead" | "all">("suggestions");
    const [more, setMore] = useState(false);

    const root = map.nodes.find((x) => x.kind === "root");
    const dead = useMemo(() => map.nodes.flatMap((x) => (x.refs ?? []).filter((r) => r.state === "dead").map((r) => ({ node: x, path: r.path }))), [map]);
    const gaps = [...(map.gaps?.layer ?? []).map((g) => ({ ...g, axis: "계층" })), ...(map.gaps?.domain ?? []).map((g) => ({ ...g, axis: "용어" }))];
    const groups = useMemo(() =>
    {
        const by = (f: (x: MapNode) => boolean) => map.nodes.filter(f).sort((a, b) => b.chars - a.chars);
        const all: Group[] = [
            { key: "folder", title: "폴더 지시문", sub: "폴더 안 CLAUDE.md", kind: "folder", nodes: by((x) => x.source === "folder" || x.kind === "nested"), when: "그 폴더 아래 파일을 Read · Write · Edit 할 때 로드됩니다. Bash 로 읽으면 로드되지 않습니다." },
            { key: "rule-paths", title: "경로 규칙", sub: "paths 가 있는 .claude/rules", kind: "rule", nodes: by((x) => x.source === "rule-paths"), when: "머리의 paths 패턴에 맞는 파일을 Read · Write · Edit 할 때 로드됩니다." },
            { key: "rule-always", title: "항상 로드되는 규칙", sub: "paths 가 없는 .claude/rules", kind: "common", nodes: by((x) => x.source === "rule-always"), when: "paths 가 없어 세션이 시작될 때 루트와 함께 로드됩니다." },
            { key: "skill", title: "스킬", sub: ".claude/skills", kind: "skill", nodes: by((x) => x.kind === "skill"), when: "이름과 설명만 항상 실리고, 본문은 모델이 호출할 때 로드됩니다." },
            { key: "agent", title: "서브에이전트", sub: ".claude/agents", kind: "agent", nodes: by((x) => x.kind === "agent"), when: "모델이 서브에이전트를 실행할 때 그 세션에 로드됩니다." },
            { key: "hook", title: "훅", sub: "settings.json 의 hooks", kind: "hook", nodes: by((x) => x.kind === "hook"), when: "이벤트가 일어나면 하네스가 실행합니다. 모델이 고르지 않습니다." },
            { key: "gaps", title: "빈칸", sub: "계층 · 용어 규칙이 없는 칸", kind: null, nodes: [], warn: gaps.length > 0, when: "그 영역의 파일을 고쳐도 계층 규칙이나 도메인 용어 규칙이 하나도 로드되지 않는 칸입니다." },
            { key: "dead", title: "깨진 참조", sub: "지시문이 가리키는 없는 경로", kind: null, nodes: [], warn: dead.length > 0, when: "지시문이 가리키는 경로가 저장소에 없습니다. 모델이 그 경로를 찾다가 시간을 씁니다." },
        ];
        return all.filter((g) => g.nodes.length || (g.key === "gaps" && gaps.length) || (g.key === "dead" && dead.length));
    }, [map, gaps.length, dead.length]);

    const group = groups.find((g) => g.key === picked) ?? groups[0];
    const total = (g: Group) => g.nodes.reduce((a, x) => a + x.chars, 0);
    const meta = (g: Group): ReactNode[] =>
    {
        if (g.key === "gaps") return [`${gaps.length}칸`, `파일 ${n(gaps.reduce((a, x) => a + x.files, 0))}개`];
        if (g.key === "dead") return [`${dead.length}곳`];
        if (g.key === "skill") return [`${g.nodes.length}개`, `설명 ${n(g.nodes.reduce((a, x) => a + (x.listingChars ?? 0), 0))}자 항상`];
        return [`${g.nodes.length}개`, `${n(total(g))}자`];
    };
    const cards: CardData[] = groups.map((g) => ({
        key: g.key, title: g.title, meta: meta(g), picked: g.key === group?.key, warn: g.warn, onClick: () => { setPicked(g.key); setMore(false); },
        icon: g.kind ? kindIcon(g.kind) : g.key === "gaps" ? <CircleAlert /> : <Link2Off />, tint: g.kind ? kindTint(g.kind) : "var(--tag-orange-fg)",
        flag: g.warn ? <Chip tone="orange">살펴보기</Chip> : undefined,
    }));
    const rows: CardData[][] = [];
    for (let i = 0; i < cards.length; i += 4) rows.push(cards.slice(i, i + 4));
    const rootCard: CardData = {
        key: "root", title: "루트 CLAUDE.md", meta: [`항상 로드 ${n(map.meta.alwaysChars)}자`, `파일 ${n(map.meta.files)}개`], icon: kindIcon("root"), tint: kindTint("root"),
        flag: <Chip tone="blue">제안 {map.suggestions.length}</Chip>, onClick: root ? () => onSelect(root.id) : undefined,
    };
    const saves = map.suggestions.reduce((a, s) => a + (s.saves ?? 0), 0);
    const allNodes = useMemo(() => [...map.nodes].sort((a, b) => b.chars - a.chars), [map]);

    const main = (
        <>
            <PanelHead left={<Crumb repo={map.meta.repo} view="구조">{map.meta.commit || undefined}</Crumb>} />
            <TreeGraph root={rootCard} rows={rows} />
            <TableBar
                left={(
                    <div className="flex flex-wrap gap-1">
                        <BarTab on={tab === "suggestions"} onClick={() => setTab("suggestions")}>제안 <span className="text-muted-foreground">{map.suggestions.length}</span></BarTab>
                        <BarTab on={tab === "dead"} onClick={() => setTab("dead")}>깨진 참조 <span className="text-muted-foreground">{dead.length}</span></BarTab>
                        <BarTab on={tab === "all"} onClick={() => setTab("all")}>모든 지시문 <span className="text-muted-foreground">{map.nodes.length}</span></BarTab>
                    </div>
                )}
                right={<><span>노드 {map.nodes.length}</span><span>간선 {map.edges.length}</span><span>줄일 수 있는 글자 {n(saves)}자</span></>}
            />
            <div className="overflow-x-auto">
                {tab === "suggestions" && (
                    <table className="w-full min-w-[720px] text-[13px]">
                        <thead><tr><th className={th}>종류</th><th className={th}>제안</th><th className={th}>정도</th><th className={`${th} text-right`}>줄어드는 글자</th><th className={th}>판정</th></tr></thead>
                        <tbody>
                            {map.suggestions.map((s) => (
                                <tr key={s.id} className={s.targets?.[0] ? "cursor-pointer hover:bg-muted/60" : undefined} onClick={() => s.targets?.[0] && onSelect(s.targets[0])}>
                                    <td className={`${td} whitespace-nowrap text-muted-foreground`}>{KIND[s.kind] ?? s.kind}</td>
                                    <td className={`${td} font-medium`}>{s.title}</td>
                                    <td className={td}><Chip tone={SEVERITY[s.severity].tone}>{SEVERITY[s.severity].label}</Chip></td>
                                    <td className={`${td} text-right tabular-nums`}>{s.saves ? n(s.saves) : "—"}</td>
                                    <td className={`${td} whitespace-nowrap text-muted-foreground`}>{s.verdict ? VERDICT[s.verdict] : "판정 전"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                {tab === "dead" && (
                    <table className="w-full min-w-[720px] text-[13px]">
                        <thead><tr><th className={th}>지시문</th><th className={th}>가리키는 경로</th></tr></thead>
                        <tbody>
                            {dead.map((d, i) => (
                                <tr key={i} className="cursor-pointer hover:bg-muted/60" onClick={() => onSelect(d.node.id)}>
                                    <td className={`${td} font-medium`}>{d.node.path}</td><td className={`${td} text-muted-foreground`}>{d.path}</td>
                                </tr>
                            ))}
                            {!dead.length && <tr><td className={`${td} text-muted-foreground`} colSpan={2}>깨진 참조가 없습니다.</td></tr>}
                        </tbody>
                    </table>
                )}
                {tab === "all" && (
                    <table className="w-full min-w-[720px] text-[13px]">
                        <thead><tr><th className={th}>경로</th><th className={th}>종류</th><th className={`${th} text-right`}>크기</th><th className={`${th} text-right`}>걸리는 파일</th></tr></thead>
                        <tbody>
                            {allNodes.map((x) => (
                                <tr key={x.id} className="cursor-pointer hover:bg-muted/60" onClick={() => onSelect(x.id)}>
                                    <td className={`${td} font-medium`}>{x.path}</td><td className={`${td} text-muted-foreground`}>{kindLabel(x)}</td>
                                    <td className={`${td} text-right tabular-nums`}>{n(x.chars)}</td><td className={`${td} text-right tabular-nums text-muted-foreground`}>{x.matchedFiles != null ? n(x.matchedFiles) : "—"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </>
    );

    if (!group) return <CanvasPage main={main} />;
    const list = group.nodes;
    const shown = more ? list : list.slice(0, 6);
    const side = (
        <>
            <SideHead
                icon={group.kind ? kindIcon(group.kind) : group.key === "gaps" ? <CircleAlert /> : <Link2Off />}
                tint={group.kind ? kindTint(group.kind) : "var(--tag-orange-fg)"}
                title={group.title} sub={`${group.sub} · ${group.key === "gaps" ? gaps.length : group.key === "dead" ? dead.length : list.length}개`}
            />
            <div className="mt-4"><Note>{group.when}</Note></div>
            {list.length > 0 && (
                <>
                    <div className="mt-4">
                        <Stats items={[
                            { label: "파일", value: list.length },
                            { label: "합계", value: `${n(total(group))}자` },
                            { label: "가장 큼", value: `${n(list[0].chars)}자` },
                            { label: "평균", value: `${n(Math.round(total(group) / list.length))}자` },
                        ]} />
                    </div>
                    <SideLabel right={group.key === "folder" || group.key === "rule-paths" ? "걸리는 파일" : "크기"}>큰 순서</SideLabel>
                    <ul className="divide-y">
                        {shown.map((x) => (
                            <li key={x.id}>
                                <button type="button" onClick={() => onSelect(x.id)} className="flex min-h-11 w-full items-center gap-2 text-left text-[13px] hover:bg-muted/60">
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate font-medium" title={x.path}>{shortPath(x.path, 3)}</span>
                                        <span className="text-xs text-muted-foreground tabular-nums">{n(x.chars)}자</span>
                                    </span>
                                    <span className="tabular-nums text-muted-foreground">{group.key === "folder" || group.key === "rule-paths" ? n(x.matchedFiles) : n(x.chars)}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                    {list.length > 6 && <button type="button" onClick={() => setMore(!more)} className="mt-2 min-h-10 w-full rounded-lg border text-[13px] hover:bg-muted">{more ? "접기" : `${list.length - 6}개 더 보기`}</button>}
                </>
            )}
            {group.key === "gaps" && (
                <>
                    <SideLabel right="파일">빈칸</SideLabel>
                    <ul className="divide-y text-[13px]">
                        {gaps.map((g) => <li key={`${g.axis}${g.id}`} className="flex min-h-10 items-center gap-2"><Chip tone="orange">{g.axis}</Chip><span className="min-w-0 flex-1 truncate">{g.scope} · {g.area}</span><span className="tabular-nums text-muted-foreground">{n(g.files)}</span></li>)}
                    </ul>
                </>
            )}
            {group.key === "dead" && (
                <>
                    <SideLabel>깨진 참조</SideLabel>
                    <ul className="divide-y text-[13px]">
                        {dead.map((d, i) => <li key={i}><button type="button" onClick={() => onSelect(d.node.id)} className="min-h-10 w-full py-1.5 text-left hover:bg-muted/60"><span className="block truncate font-medium">{d.path}</span><span className="block truncate text-xs text-muted-foreground">{d.node.path}</span></button></li>)}
                    </ul>
                </>
            )}
        </>
    );
    return <CanvasPage main={main} side={side} />;
}

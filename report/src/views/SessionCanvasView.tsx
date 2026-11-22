import { useMemo, useState } from "react";
import { Terminal } from "lucide-react";

import { BarTab, CanvasPage, Chip, Crumb, Note, PanelHead, SideHead, SideLabel, Stats, TableBar, TreeGraph, td, th, type CardData } from "@/canvas/parts";
import { canvasKind, kindIcon, kindTint, nodeIndex } from "@/canvas/kinds";
import { REASON_LABEL, n, secs, shortPath, type ContextMap, type Trace, type TraceRow } from "@/data";

interface Props { map: ContextMap; trace: Trace; traces: Trace[]; onPickTrace: (i: number) => void; onSelect: (id: string) => void }

// 세션 하나에서 지시문이 로드된 순서를 나무로 그립니다. 루트가 맨 위이고, 그 아래로 로드된 차례대로 넷씩 놓습니다.
// 모델이 Bash 같은 도구로 지시문 파일을 직접 읽은 것은 「직접」으로 표시합니다. 그렇게 읽으면 하네스가 로드한 것으로 치지 않아
// 경로 규칙이 걸리지 않고, 같은 내용이 두 번 실리기도 합니다.
export function SessionCanvasView({ map, trace, traces, onPickTrace, onSelect }: Props)
{
    const [tab, setTab] = useState<"loads" | "direct">("loads");
    const nodes = useMemo(() => nodeIndex(map), [map]);
    const loads = trace.rows.filter((r) => r.kind === "instruction");
    const tools = trace.rows.filter((r) => r.kind === "tool");

    // 직접 읽음: 도구 줄의 reads 가운데 지시문(맵의 노드)인 것입니다. 경로마다 처음 읽은 때만 셉니다.
    const direct = useMemo(() =>
    {
        const first = new Map<string, TraceRow>();
        for (const r of tools) for (const p of r.reads ?? []) if (nodes.has(p) && !first.has(p)) first.set(p, r);
        return [...first].map(([path, row]) => ({ path, row }));
    }, [tools, nodes]);
    const readAt = new Map(direct.map((d) => [d.path, d.row.at]));

    const card = (r: TraceRow): CardData =>
    {
        const node = nodes.get(r.nodeId ?? r.name);
        const k = canvasKind(node ?? { kind: "rule", source: r.source ?? undefined });
        const early = readAt.has(r.name) && (readAt.get(r.name) ?? 0) < r.at;
        return {
            key: `${r.i}`, title: shortPath(r.name, 2), titleAttr: r.name, meta: [`${n(r.chars)}자`, secs(r.at)], icon: kindIcon(k), tint: kindTint(k),
            flag: early ? <Chip tone="orange">직접</Chip> : undefined, warn: early, onClick: node ? () => onSelect(node.id) : undefined,
        };
    };
    const rootRow = loads.find((r) => r.source === "root");
    const rest = loads.filter((r) => r !== rootRow);
    const rows: CardData[][] = [];
    for (let i = 0; i < rest.length; i += 4) rows.push(rest.slice(i, i + 4).map(card));
    const root: CardData = rootRow
        ? card(rootRow)
        : { key: "session", title: `세션 ${trace.session.slice(0, 8)}`, meta: ["루트 지시문 없음"], icon: <Terminal />, tint: "var(--muted-foreground)" };

    let sum = 0;
    const table = loads.map((r) => ({ r, sum: (sum += r.chars ?? 0) }));
    const firstRule = loads.find((r) => r.source !== "root");
    const startChars = loads.filter((r) => r.reason === "session_start").reduce((a, r) => a + (r.chars ?? 0), 0);
    const id8 = trace.session.slice(0, 8);
    const picked = traces.indexOf(trace);

    const main = (
        <>
            <PanelHead
                left={<Crumb repo={map.meta.repo} view="기록">세션 {id8}</Crumb>}
                right={traces.length > 1 && (
                    <select
                        aria-label="세션 고르기" value={picked} onChange={(e) => onPickTrace(Number(e.target.value))}
                        className="min-h-9 max-w-[320px] rounded-lg border bg-card px-2 text-[13px]"
                    >
                        {traces.map((t, i) => <option key={t.session} value={i}>{t.session.slice(0, 8)} · {t.prompt?.preview?.slice(0, 28) ?? "프롬프트 없음"}</option>)}
                    </select>
                )}
            />
            <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
                <span className="text-[13px] text-muted-foreground">세션</span>
                <span className="min-w-0 truncate font-medium">{trace.prompt?.preview ?? "프롬프트 없음"}</span>
                <span className="text-[13px] text-muted-foreground">· {secs(trace.duration)}</span>
                {direct.length > 0 && <Chip tone="orange">직접 읽음 {direct.length}</Chip>}
            </div>
            <TreeGraph root={root} rows={rows} />
            <TableBar
                left={(
                    <div className="flex gap-1">
                        <BarTab on={tab === "loads"} onClick={() => setTab("loads")}>로드 기록</BarTab>
                        <BarTab on={tab === "direct"} onClick={() => setTab("direct")}>직접 읽음 <span className="text-muted-foreground">{direct.length}</span></BarTab>
                    </div>
                )}
                right={<><span>로드 {loads.length}건</span><span>{n(trace.totals.instructionChars)}자</span>{firstRule && <span>첫 규칙 {secs(firstRule.at)}</span>}</>}
            />
            <div className="overflow-x-auto">
                {tab === "loads"
                    ? (
                        <table className="w-full min-w-[720px] text-[13px]">
                            <thead><tr><th className={th}>시각</th><th className={th}>지시문</th><th className={th}>계기</th><th className={th}>방식</th><th className={`${th} text-right`}>크기</th><th className={`${th} text-right`}>누적</th></tr></thead>
                            <tbody>
                                {table.map(({ r, sum }) => (
                                    <tr key={r.i} className="cursor-pointer hover:bg-muted/60" onClick={() => r.nodeId && onSelect(r.nodeId)}>
                                        <td className={`${td} tabular-nums text-muted-foreground`}>{secs(r.at)}</td>
                                        <td className={`${td} font-medium`}>{r.name}{readAt.has(r.name) && (readAt.get(r.name) ?? 0) < r.at && <Chip tone="orange" className="ml-2">직접</Chip>}</td>
                                        <td className={`${td} text-muted-foreground`}>{r.trigger ? shortPath(r.trigger, 3) : "—"}</td>
                                        <td className={td}>{REASON_LABEL[r.reason ?? ""] ?? r.reason ?? "—"}</td>
                                        <td className={`${td} text-right tabular-nums`}>{n(r.chars)}</td>
                                        <td className={`${td} text-right tabular-nums text-muted-foreground`}>{n(sum)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )
                    : (
                        <table className="w-full min-w-[720px] text-[13px]">
                            <thead><tr><th className={th}>시각</th><th className={th}>도구</th><th className={th}>직접 읽은 지시문</th><th className={th}>그 뒤 로드</th></tr></thead>
                            <tbody>
                                {direct.map(({ path, row }) =>
                                {
                                    const later = loads.find((r) => r.name === path);
                                    return (
                                        <tr key={path}>
                                            <td className={`${td} tabular-nums text-muted-foreground`}>{secs(row.at)}</td>
                                            <td className={td}>{row.name}{row.target && <span className="text-muted-foreground"> · {row.target}</span>}</td>
                                            <td className={`${td} font-medium`}>{path}</td>
                                            <td className={td}>{later ? secs(later.at) : <span className="text-muted-foreground">로드 안 됨</span>}</td>
                                        </tr>
                                    );
                                })}
                                {!direct.length && <tr><td className={`${td} text-muted-foreground`} colSpan={4}>이 세션은 지시문을 도구로 직접 읽지 않았습니다.</td></tr>}
                            </tbody>
                        </table>
                    )}
            </div>
        </>
    );

    const side = (
        <>
            <SideHead icon={<Terminal />} tint="var(--kind-root)" title={`세션 ${id8}`} sub={`${trace.model ? `${trace.model} · ` : ""}도구 호출 ${trace.totals.tools}번 · ${secs(trace.duration)}`} />
            {trace.prompt?.preview && <div className="mt-4 rounded-xl bg-muted px-3.5 py-3 text-[13px] leading-relaxed">{trace.prompt.preview}</div>}
            <div className="mt-4">
                <Stats items={[
                    { label: "로드된 지시문", value: loads.length },
                    { label: "직접 읽음", value: direct.length },
                    { label: "시작할 때", value: `${n(startChars)}자` },
                    { label: "끝날 때까지", value: `${n(trace.totals.instructionChars)}자` },
                ]} />
            </div>
            {trace.findings.map((f) => <div key={f.id} className="mt-3"><Note><b className="font-semibold">{f.title}</b><br />{f.evidence}</Note></div>)}
            <SideLabel right="크기">지시문 {loads.length}</SideLabel>
            <ul className="divide-y">
                {loads.map((r) =>
                {
                    const k = canvasKind(nodes.get(r.nodeId ?? r.name) ?? { kind: "rule", source: r.source ?? undefined });
                    return (
                        <li key={r.i}>
                            <button type="button" onClick={() => r.nodeId && onSelect(r.nodeId)} className="flex min-h-10 w-full items-center gap-2 text-left text-[13px] hover:bg-muted/60">
                                <span className="size-2 shrink-0 rounded-full" style={{ background: kindTint(k) }} />
                                <span className="min-w-0 flex-1 truncate" title={r.name}>{shortPath(r.name, 3)}</span>
                                <span className="tabular-nums text-muted-foreground">{n(r.chars)}</span>
                            </button>
                        </li>
                    );
                })}
            </ul>
            <div className="mt-4 flex flex-wrap gap-1.5">
                <Chip tone="blue">항상</Chip><Chip tone="green">폴더 지시문</Chip><Chip tone="purple">경로 규칙</Chip><Chip tone="orange">직접 읽음</Chip>
            </div>
        </>
    );

    return <CanvasPage main={main} side={side} />;
}

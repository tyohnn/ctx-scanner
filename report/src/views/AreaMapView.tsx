import { useState } from "react";

import { n, type ContextMap, type Flow } from "@/data";
import { cellChars, scopeName } from "@/lib/flowgraph";
import { cn } from "@/lib/utils";

interface Props { map: ContextMap; onOpenCell: (area: string, scope: string) => void }

const STEPS = [10, 26, 44, 64, 86];

// 영역 지도: 위치(앱 · 패키지) × 개발 영역 칸마다 파일을 열 때 더 로드되는 양을 진하기로 보여 줍니다.
// 플로우가 「무엇이 무엇을 부르나」라면 이 화면은 「어디가 무겁나」에 답합니다. 칸을 누르면 그 칸의 플로우와 회로도로 갑니다.
export function AreaMapView({ map, onOpenCell }: Props)
{
    const flows = map.flows ?? [];
    const [hover, setHover] = useState<Flow | null>(null);
    if (!flows.length) return <div className="grid h-full place-items-center text-xs text-muted-foreground">이 맵에는 플로우가 없습니다. 맵을 다시 만들면 채워집니다.</div>;

    const areas = (map.meta.areas ?? []).filter((a) => flows.some((f) => f.area === a.id));
    const filesOf = new Map<string, number>();
    for (const f of flows) filesOf.set(f.scope, (filesOf.get(f.scope) ?? 0) + f.files);
    // 앱을 먼저, 그 안에서는 파일이 많은 순서로 둡니다.
    const scopes = [...filesOf.keys()].sort((a, b) => Number(b.startsWith("apps/")) - Number(a.startsWith("apps/")) || filesOf.get(b)! - filesOf.get(a)!);
    const cell = new Map(flows.map((f) => [`${f.area}|${f.scope}`, f]));
    const max = Math.max(1, ...flows.map(cellChars));
    const step = (t: number) => Math.min(4, Math.floor(t / max * 5));
    const bg = (s: number) => `color-mix(in oklab, var(--flow-folder) ${STEPS[s]}%, var(--background))`;

    return (
        <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-[1280px] space-y-4 px-6 py-5">
                <div>
                    <h2 className="text-sm font-semibold">어디가 무겁나</h2>
                    <p className="mt-0.5 max-w-[80ch] text-xs text-muted-foreground">칸마다 그 위치 · 그 영역의 파일을 열 때 항상 로드 위에 더해지는 양입니다(단위 천 자). 진할수록 많이 로드됩니다. 칸을 누르면 그 칸의 플로우와 회로도로 갑니다. 빈칸 표시는 측정값 그대로이고, 그대로 둘지는 할 일에서 판정합니다.</p>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">적음 {STEPS.map((_, i) => <span key={i} className="inline-block h-3 w-5 rounded-sm" style={{ background: bg(i) }} />)} 많음</span>
                    <span className="inline-flex items-center gap-1.5"><span className="cx-mark l" />계층 규칙이 로드되지 않음</span>
                    <span className="inline-flex items-center gap-1.5"><span className="cx-mark d" />도메인 용어 규칙이 로드되지 않음</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="border-separate border-spacing-[3px] text-xs">
                        <thead>
                            <tr>
                                <th />
                                {areas.map((a) => <th key={a.id} scope="col" className="px-1 pb-1 text-center align-bottom font-medium whitespace-nowrap text-muted-foreground">{a.label}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {scopes.map((s) => (
                                <tr key={s}>
                                    <th scope="row" className="num pr-2 text-right align-middle font-normal whitespace-nowrap text-muted-foreground">{scopeName(s)}</th>
                                    {areas.map((a) =>
                                    {
                                        const f = cell.get(`${a.id}|${s}`);
                                        if (!f) return <td key={a.id}><div aria-hidden className="grid h-10 min-w-14 place-items-center rounded border border-dashed text-muted-foreground/60">·</div></td>;
                                        const t = cellChars(f), st = step(t);
                                        return (
                                            <td key={a.id}>
                                                <button
                                                    type="button" onClick={() => onOpenCell(f.area, f.scope)} onMouseEnter={() => setHover(f)} onFocus={() => setHover(f)}
                                                    aria-label={`${scopeName(s)} · ${a.label} ${n(t)}자`}
                                                    className={cn("num relative grid h-10 w-full min-w-14 cursor-pointer place-items-center rounded outline-offset-1 hover:outline-2 hover:outline-foreground focus-visible:outline-2 focus-visible:outline-foreground", st >= 3 ? "text-background" : "text-foreground")}
                                                    style={{ background: bg(st) }}
                                                >
                                                    {(t / 1000).toFixed(1)}
                                                    {(!f.layer.length || !f.domain.length) && (
                                                        <span className="absolute top-1 right-1 flex gap-0.5">{!f.layer.length && <span className="cx-mark l" />}{!f.domain.length && <span className="cx-mark d" />}</span>
                                                    )}
                                                </button>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="min-h-10 border-l-2 pl-3 text-xs text-muted-foreground" aria-live="polite">
                    {hover
                        ? <><b className="font-medium text-foreground">{hover.scope} · {hover.areaLabel}</b> — 파일 {n(hover.files)}개. 열면 {n(cellChars(hover))}자가 더 로드됩니다(폴더 CLAUDE.md {n(hover.chars.folder)}자, 계층 {n(hover.chars.layer)}자, 용어 {n(hover.chars.domain)}자, 공통 {n(hover.chars.common)}자). {hover.layer.length ? `계층 규칙 ${hover.layer.length}개` : "계층 규칙 없음"} · {hover.domain.length ? `용어 규칙 ${hover.domain.length}개` : "용어 규칙 없음"}.</>
                        : "칸에 마우스를 올리면 로드되는 양의 내역이 여기에 나옵니다."}
                </p>
            </div>
        </div>
    );
}

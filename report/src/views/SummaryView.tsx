import { ArrowRight } from "lucide-react";

import { Marked, rankSuggestions, savesScope, settled } from "@/components/advice";
import { Chars } from "@/components/bits";
import { n, type Report, type Trace } from "@/data";
import { cellChars, scopeName } from "@/lib/flowgraph";

interface Props { report: Report; trace: Trace | null; onOpenCell: (area: string, scope: string) => void; onOpenTodo: () => void }

// 처음 여는 화면입니다. 위에서 아래로 「한 문장 답 → 근거 숫자와 기준 → 가장 무거운 곳 → 먼저 할 일 → 항상 로드되는 내용의 구성」 순서입니다.
export function SummaryView({ report, trace, onOpenCell, onOpenTodo }: Props)
{
    const { map, baseline } = report;
    const always = map.meta.alwaysChars;
    // 테스트 칸은 같은 폴더의 다른 칸과 로드되는 것이 거의 같아 「무거운 곳」에서 뺍니다.
    const cells = (map.flows ?? []).filter((f) => f.area !== "test").map((f) => ({ f, t: cellChars(f) })).sort((a, b) => b.t - a.t);
    const top = cells.slice(0, 5);
    const heavy = top[0];
    const ranked = rankSuggestions(map, trace);
    const todo = ranked.filter((s) => !settled(s));
    const judged = ranked.some((s) => s.verdict);
    const delta = baseline ? always - baseline.alwaysChars : null;
    const maxT = Math.max(1, ...top.map((x) => x.t));

    // 항상 로드되는 내용을 무엇이 차지하는지 보여 줍니다. 루트의 섹션과 스킬 설명이 같은 공간을 나눠 씁니다.
    const root = map.nodes.find((x) => x.kind === "root");
    const listed = map.nodes.filter((x) => x.kind === "skill" || x.kind === "agent");
    const named = listed.filter((x) => x.level === 4).reduce((a, x) => a + (x.listingChars ?? 0), 0);
    const free = listed.filter((x) => x.level === 5).reduce((a, x) => a + (x.listingChars ?? 0), 0);
    const parts = [
        ...(root?.sections ?? []).map((s, i) => ({ key: s.title, label: `루트 · ${s.title}`, chars: s.chars, color: "var(--lv1)", fade: i % 2 })),
        { key: "named", label: `지시문이 언급하는 스킬 설명 ${listed.filter((x) => x.level === 4).length}개`, chars: named, color: "var(--lv4)", fade: 0 },
        { key: "free", label: `아무 지시문도 언급하지 않는 스킬 설명 ${listed.filter((x) => x.level === 5).length}개`, chars: free, color: "var(--lv5)", fade: 0 },
    ].filter((p) => p.chars > 0);
    const total = parts.reduce((a, p) => a + p.chars, 0) || 1;

    const answer = [
        baseline
            ? delta === 0 ? `항상 로드되는 양은 ${baseline.label} 측정과 같은 ${n(always)}자입니다.` : `항상 로드되는 양은 ${baseline.label}의 ${Math.round(always / baseline.alwaysChars * 100)}% 수준인 ${n(always)}자로 ${delta! < 0 ? "줄었습니다" : "늘었습니다"}.`
            : `어떤 일을 시키든 처음부터 ${n(always)}자가 로드됩니다.`,
        heavy && `파일을 열 때 가장 많이 더해지는 곳은 ${scopeName(heavy.f.scope)} · ${heavy.f.areaLabel}의 ${n(heavy.t)}자이고, 그 가운데 ${n(heavy.f.chars.folder)}자가 폴더 CLAUDE.md에서 옵니다.`,
    ].filter(Boolean).join(" ");

    return (
        <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-[1040px] space-y-6 px-6 py-6">
                <p className="max-w-[64ch] text-base font-medium leading-relaxed">{answer}</p>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="cn-card gap-0 p-4">
                        <div className="text-xs text-muted-foreground">항상 로드</div>
                        <Chars value={always} className="mt-1 text-2xl font-semibold" />
                        <div className="mt-1 text-xs text-muted-foreground">{baseline ? <>{baseline.label} <span className="num">{n(baseline.alwaysChars)}</span>자 → <span className="num text-foreground">{delta! > 0 ? "+" : delta! < 0 ? "−" : "±"}{n(Math.abs(delta!))}자</span></> : "비교할 지난 측정이 없습니다"}</div>
                    </div>
                    <div className="cn-card gap-0 p-4">
                        <div className="text-xs text-muted-foreground">가장 무거운 칸 (파일을 열 때 더 로드)</div>
                        {heavy ? <><Chars value={heavy.t} className="mt-1 text-2xl font-semibold" /><div className="mt-1 text-xs text-muted-foreground">{scopeName(heavy.f.scope)} · {heavy.f.areaLabel} · 파일 {n(heavy.f.files)}개가 같은 양을 로드</div></> : <div className="mt-1 text-xs text-muted-foreground">플로우가 없습니다</div>}
                    </div>
                    <div className="cn-card gap-0 p-4">
                        <div className="text-xs text-muted-foreground">{judged ? "받아들인 제안" : "제안"}</div>
                        <div className="mt-1 text-2xl font-semibold"><span className="num">{todo.length}</span><span className="ml-0.5 text-sm font-normal text-muted-foreground">건</span></div>
                        <div className="mt-1 text-xs text-muted-foreground">{judged ? `그대로 둠 ${ranked.filter((s) => s.verdict === "keep").length} · 거짓 신호 ${ranked.filter((s) => s.verdict === "false-positive").length}는 접어 둠` : "advise 스킬의 판정 전입니다"}</div>
                    </div>
                </div>

                {top.length > 0 && (
                    <section>
                        <h2 className="text-sm font-semibold">가장 무거운 곳 다섯</h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">그 칸의 파일을 열 때 항상 로드 위에 더해지는 양입니다. 진한 부분이 폴더 CLAUDE.md, 옅은 부분이 경로 규칙입니다. 누르면 그 칸의 플로우와 회로도로 갑니다.</p>
                        <div className="mt-3 space-y-1">
                            {top.map(({ f, t }) => (
                                <button key={f.id} type="button" onClick={() => onOpenCell(f.area, f.scope)} className="grid w-full cursor-pointer grid-cols-[minmax(140px,220px)_1fr_72px] items-center gap-3 rounded px-1.5 py-1.5 text-left text-sm hover:bg-muted">
                                    <span className="truncate">{scopeName(f.scope)} · {f.areaLabel}</span>
                                    <span className="relative h-2.5 rounded bg-muted">
                                        <span className="absolute inset-y-0 left-0 rounded opacity-35" style={{ width: `${t / maxT * 100}%`, background: "var(--flow-folder)" }} />
                                        <span className="absolute inset-y-0 left-0 rounded" style={{ width: `${f.chars.folder / maxT * 100}%`, background: "var(--flow-folder)" }} />
                                    </span>
                                    <span className="num text-right text-xs">{n(t)}</span>
                                </button>
                            ))}
                        </div>
                    </section>
                )}

                {todo.length > 0 && (
                    <section>
                        <div className="flex items-baseline justify-between">
                            <h2 className="text-sm font-semibold">먼저 할 일</h2>
                            <button type="button" onClick={onOpenTodo} className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground">할 일 {todo.length}건 모두 보기 <ArrowRight className="size-3" /></button>
                        </div>
                        <ol className="mt-2 space-y-1">
                            {todo.slice(0, 3).map((s, i) => (
                                <li key={s.id} className="flex items-baseline gap-3 text-sm">
                                    <span className="num w-4 text-muted-foreground">{i + 1}</span>
                                    <span className="min-w-0 flex-1"><Marked text={s.title} /></span>
                                    {s.saves ? <span className="num shrink-0 text-xs text-muted-foreground">−{n(s.saves)}자 · {savesScope(s) === "always" ? "항상" : "그 영역"}</span> : null}
                                </li>
                            ))}
                        </ol>
                    </section>
                )}

                <section className="cn-card gap-0 p-4">
                    <div className="flex items-baseline justify-between">
                        <div>
                            <h2 className="text-sm font-semibold">항상 로드되는 내용의 구성</h2>
                            <p className="text-xs text-muted-foreground">어떤 일을 시키든 처음부터 로드되는 내용입니다. 여기서 뺀 만큼 모든 세션이 가벼워집니다.</p>
                            {map.meta.notes?.map((t) => <p key={t} className="mt-0.5 text-xs text-muted-foreground"><Marked text={t} /></p>)}
                        </div>
                        <Chars value={always} className="text-lg font-semibold" />
                    </div>
                    <div className="mt-3 flex h-5 gap-px overflow-hidden rounded">
                        {parts.map((p) => <div key={p.key} title={`${p.label} ${n(p.chars)}자`} style={{ width: `${p.chars / total * 100}%`, background: p.color, opacity: 1 - p.fade * 0.28 }} />)}
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-1 md:grid-cols-2">
                        {parts.map((p) => (
                            <div key={p.key} className="flex items-center gap-2 text-xs">
                                <span className="inline-block size-2 shrink-0 rounded-sm" style={{ background: p.color }} />
                                <span className="min-w-0 flex-1 truncate">{p.label}</span>
                                <span className="num w-10 shrink-0 text-right text-muted-foreground">{Math.round(p.chars / total * 100)}%</span>
                                <Chars value={p.chars} className="w-16 shrink-0 text-right" />
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}

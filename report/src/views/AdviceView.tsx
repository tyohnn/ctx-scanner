import { ArrowRight } from "lucide-react";
import { useState } from "react";

import { Chars, CONFIDENCE, SEVERITY } from "@/components/bits";
import { Segmented } from "@/components/ui";
import { n, type ContextMap, type Suggestion, type Trace } from "@/data";
import { cn } from "@/lib/utils";

const GROUPS: { key: string; label: string; kinds: string[] }[] = [
    { key: "all", label: "전체", kinds: [] },
    { key: "demote", label: "항상 로드되는 내용 줄이기", kinds: ["demote"] },
    { key: "placement", label: "위치 변경", kinds: ["placement"] },
    { key: "mece", label: "겹침과 빈칸", kinds: ["mece"] },
    { key: "truncation", label: "잘리는 내용", kinds: ["truncation"] },
    { key: "broken", label: "깨진 참조", kinds: ["dead-ref", "dead-glob"] },
    { key: "intent", label: "규약이 닿지 않는 곳", kinds: ["coverage"] },
    { key: "trace", label: "세션에서 본 것", kinds: ["trace"] },
];

interface Props { map: ContextMap; trace: Trace | null; onSelect: (id: string | null) => void }

export function AdviceView({ map, trace, onSelect }: Props)
{
    const [group, setGroup] = useState("all");
    const byId = new Map(map.nodes.map((x) => [x.id, x]));
    const root = map.nodes.find((x) => x.kind === "root");
    const listed = map.nodes.filter((x) => x.kind === "skill" || x.kind === "agent");
    const named = listed.filter((x) => x.level === 4).reduce((a, x) => a + (x.listingChars ?? 0), 0);
    const free = listed.filter((x) => x.level === 5).reduce((a, x) => a + (x.listingChars ?? 0), 0);
    const all: Suggestion[] = [...map.suggestions, ...(trace?.findings ?? []).map((f) => ({ ...f, kind: "trace", confidence: "measured" as const }))];
    const order = { high: 0, medium: 1, low: 2 };
    const kinds = GROUPS.find((g) => g.key === group)!.kinds;
    // 「그대로 둠」과 「거짓 신호」로 판정한 제안은 아래로 내리고 흐리게 보여 줍니다.
    const settled = (s: Suggestion) => s.verdict === "keep" || s.verdict === "false-positive";
    const shown = all.filter((s) => !kinds.length || kinds.includes(s.kind)).sort((a, b) => Number(settled(a)) - Number(settled(b)) || order[a.severity] - order[b.severity]);

    // 항상 로드되는 내용을 무엇이 차지하는지 한 줄로 보여 줍니다. 루트의 섹션과 스킬 설명이 같은 공간을 나눠 씁니다.
    const verdict = (title: string) => all.find((s) => s.id === `demote:${title}`) ? "옮길 수 있음" : all.find((s) => s.id === `ablate:${title}`) ? "테스트 필요" : null;
    const parts = [
        ...(root?.sections ?? []).map((s) => ({ key: s.title, label: s.title, chars: s.chars, color: "var(--lv1)", verdict: verdict(s.title), group: "루트 지시문" })),
        { key: "named", label: `지시문이 언급하는 스킬 · 서브에이전트 설명 ${listed.filter((x) => x.level === 4).length}개`, chars: named, color: "var(--lv4)", verdict: null, group: "스킬 목록" },
        { key: "free", label: `아무 지시문도 언급하지 않는 스킬 · 서브에이전트 설명 ${listed.filter((x) => x.level === 5).length}개`, chars: free, color: "var(--lv5)", verdict: all.some((s) => s.id === "free-skills") ? "뺄 수 있음" : null, group: "스킬 목록" },
    ].filter((p) => p.chars > 0);
    const total = parts.reduce((a, p) => a + p.chars, 0);

    return (
        <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-[1040px] px-6 py-5">
                <div className="cn-card gap-0 p-4">
                    <div className="flex items-baseline justify-between">
                        <div>
                            <div className="text-sm font-semibold">모든 세션에 드는 비용</div>
                            <div className="text-xs text-muted-foreground">어떤 일을 시키든 처음부터 로드되는 내용입니다. 여기서 뺀 만큼 모든 세션이 가벼워집니다.</div>
                            {map.meta.notes?.map((t) => <div key={t} className="mt-0.5 text-xs text-muted-foreground"><Marked text={t} /></div>)}
                        </div>
                        <Chars value={map.meta.alwaysChars} className="text-xl font-semibold" />
                    </div>
                    <div className="mt-3 flex h-6 gap-px overflow-hidden rounded">
                        {parts.map((p, i) => <div key={p.key} title={`${p.label} ${n(p.chars)}자`} style={{ width: `${p.chars / total * 100}%`, background: p.color, opacity: p.group === "루트 지시문" ? 1 - (i % 2) * 0.28 : 1 }} />)}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1">
                        {parts.map((p) => (
                            <div key={p.key} className="flex items-center gap-2 text-xs">
                                <span className="inline-block size-2 shrink-0 rounded-sm" style={{ background: p.color }} />
                                <span className="min-w-0 flex-1 truncate">{p.label}</span>
                                {p.verdict && <span className="cn-badge cn-badge-variant-secondary inline-flex shrink-0 items-center whitespace-nowrap">{p.verdict}</span>}
                                <span className="num w-10 shrink-0 text-right text-muted-foreground">{Math.round(p.chars / total * 100)}%</span>
                                <Chars value={p.chars} className="w-16 shrink-0 text-right" />
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mb-2 mt-5">
                    <Segmented
                        label="제안 갈래" value={group} onChange={setGroup}
                        items={GROUPS.map((g) => ({ g, count: all.filter((s) => !g.kinds.length || g.kinds.includes(s.kind)).length })).filter((x) => x.count).map(({ g, count }) => ({ value: g.key, label: <>{g.label} <span className="num opacity-70">{count}</span></> }))}
                    />
                </div>

                <div className="space-y-2 pb-8">
                    {shown.map((s) => (
                        <article key={s.id} className={cn("cn-card gap-0 p-4", settled(s) && "opacity-60")}>
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                <span className="inline-block size-2 rounded-full" style={{ background: SEVERITY[s.severity].color }} />
                                <span>{SEVERITY[s.severity].label}</span>
                                {s.confidence && <span className="cn-badge cn-badge-variant-secondary inline-flex shrink-0 items-center whitespace-nowrap" title={CONFIDENCE[s.confidence].hint}>{CONFIDENCE[s.confidence].label}</span>}
                                {s.verdict && <span className="cn-badge cn-badge-variant-outline inline-flex shrink-0 items-center whitespace-nowrap">{VERDICT[s.verdict]}</span>}
                                {s.saves ? <span className="num ml-auto text-foreground">{savesScope(s) === "always" ? "항상 로드되는 내용" : "조건이 맞을 때 로드되는 내용"} −{n(s.saves)}자</span> : null}
                            </div>
                            <h3 className="mt-1.5 text-sm font-semibold leading-snug"><Marked text={s.title} /></h3>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground"><Marked text={s.evidence} /></p>
                            <div className="mt-2.5 flex gap-2 rounded bg-secondary px-3 py-2 text-xs leading-relaxed">
                                <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" /><span><Marked text={s.action} /></span>
                            </div>
                            {(s.items?.length || s.targets?.length) ? (
                                <div className="mt-2.5 flex flex-wrap gap-1">
                                    {(s.targets ?? []).filter((t) => byId.has(t)).slice(0, s.items ? 0 : 6).map((t) => (
                                        <button key={t} type="button" onClick={() => onSelect(t)} className="cn-button cn-button-variant-outline cn-button-size-xs inline-flex cursor-pointer items-center whitespace-nowrap">{byId.get(t)!.title}</button>
                                    ))}
                                    {(s.items ?? []).slice(0, 40).map((it) =>
                                    {
                                        const target = (s.targets ?? []).find((t) => byId.get(t)?.name === it);
                                        return <button key={it} type="button" disabled={!target} onClick={() => target && onSelect(target)} className={cn("num cn-button cn-button-variant-outline cn-button-size-xs inline-flex cursor-pointer items-center whitespace-nowrap")}>{it}</button>;
                                    })}
                                </div>
                            ) : null}
                        </article>
                    ))}
                </div>
            </div>
        </div>
    );
}

const VERDICT: Record<NonNullable<Suggestion["verdict"]>, string> = { accept: "받아들임", modify: "고쳐서 받아들임", keep: "그대로 둠", "false-positive": "거짓 신호" };

// 줄어드는 양이 항상 로드되는 내용에서인지, 파일을 열 때 로드되는 내용에서인지 정합니다.
function savesScope(s: Suggestion): "always" | "conditional"
{
    if (s.savesScope) return s.savesScope;
    if (s.kind === "demote" || s.id.startsWith("always-rule:") || s.id === "pointed-skills" || s.id.startsWith("terms-home:CLAUDE.md")) return "always";
    return "conditional";
}

// 스크립트가 낸 내용의 백틱 구간을 코드 글꼴로 바꿉니다.
function Marked({ text }: { text: string })
{
    return <>{text.split("`").map((part, i) => i % 2 ? <code key={i} className="num rounded bg-muted px-1 text-[0.92em] text-foreground">{part}</code> : part)}</>;
}

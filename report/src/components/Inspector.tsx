import { X } from "lucide-react";

import { LEVELS, kindLabel, REASON_LABEL, n, secs, type ContextMap, type MapNode, type Trace } from "@/data";

import { Chars, CONFIDENCE, LevelBadge, NodeLink, Section, SEVERITY } from "./bits";
import { Button, Meter } from "./ui";

interface Props { map: ContextMap; trace: Trace | null; node: MapNode | null; onSelect: (id: string | null) => void }

export function Inspector({ map, trace, node, onSelect }: Props)
{
    if (!node)
    {
        return (
            <aside className="flex w-[360px] shrink-0 flex-col border-l bg-sidebar">
                <div className="border-b px-4 py-3 text-xs font-semibold">상세 패널</div>
                <div className="space-y-3 px-4 py-4 text-muted-foreground">
                    <p>파일을 하나 고르면 <b className="font-medium text-foreground">언제 로드되는지</b>, 얼마나 큰지, 누가 참조하는지를 보여 줍니다.</p>
                    <div className="space-y-1.5 pt-2">
                        {([1, 2, 3, 4, 5] as const).map((l) => (
                            <div key={l} className="flex items-start gap-2">
                                <span className="mt-1.5 inline-block size-2 shrink-0 rounded-full" style={{ background: LEVELS[l].color }} />
                                <div><span className="text-foreground">{l} {LEVELS[l].label}</span><br /><span className="text-[11px]">{LEVELS[l].who}</span></div>
                            </div>
                        ))}
                    </div>
                    <p className="pt-2 text-[11px]">1 · 2 · 3 은 자동으로 로드됩니다. 4 · 5 는 모델이 골라야 로드되어서 비율로만 말할 수 있습니다.</p>
                </div>
            </aside>
        );
    }

    const byId = new Map(map.nodes.map((x) => [x.id, x]));
    const limit = map.meta.limits.onDemand200k;
    const inbound = map.edges.filter((e) => e.to === node.id && byId.has(e.from));
    const outbound = map.edges.filter((e) => e.from === node.id && byId.has(e.to));
    const dead = (node.refs ?? []).filter((r) => r.state === "dead");
    const hits = trace?.rows.filter((r) => r.nodeId === node.id) ?? [];
    const related = map.suggestions.filter((s) => s.targets?.includes(node.id));
    const listed = node.kind === "skill" || node.kind === "agent";
    const narrow = (node.sections ?? []).filter((s) => s.narrow);

    return (
        <aside className="flex w-[360px] shrink-0 flex-col overflow-hidden border-l bg-sidebar">
            <div className="flex items-start gap-2 border-b px-4 py-3">
                <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-muted-foreground">{kindLabel(node)}</div>
                    <div className="truncate text-sm font-semibold">{node.title}</div>
                    <div className="num mt-0.5 break-all text-[11px] text-muted-foreground">{node.path}</div>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => onSelect(null)} className="no-print" aria-label="상세 패널 닫기"><X /></Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
                <Section title="언제 로드되나" hint={<LevelBadge level={node.level} />}>
                    <ul className="space-y-1.5">
                        {node.when.map((w) => <li key={w.how} className="leading-snug">{w.text.replaceAll("`", "")}</li>)}
                    </ul>
                    {node.globs && node.globs.length > 0 && (
                        <div className="mt-2 space-y-0.5">
                            {node.globs.map((g) => (
                                <div key={g.glob} className="flex items-center justify-between gap-2 rounded bg-secondary px-2 py-1">
                                    <code className="num truncate text-[11px]">{g.glob}</code>
                                    <span className="num shrink-0 text-[11px] text-muted-foreground" style={g.files === 0 ? { color: "var(--destructive)" } : undefined}>{n(g.files)}개</span>
                                </div>
                            ))}
                        </div>
                    )}
                    {node.level === 2 && node.matchedFiles != null && (
                        <p className="mt-2 text-[11px] text-muted-foreground">저장소 파일 {n(map.meta.files)}개 가운데 <b className="font-medium text-foreground">{n(node.matchedFiles)}개</b>({Math.round(node.matchedFiles / map.meta.files * 100)}%)가 이 지시문을 로드합니다.</p>
                    )}
                    {listed && (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                            {node.namedBy?.length ? `지시문 ${node.namedBy.length}곳이 이름을 언급해서 모델이 따를 이유가 있습니다.` : "어느 지시문도 이름을 언급하지 않습니다. 모델이 설명만 보고 골라야 본문이 읽힙니다."}
                        </p>
                    )}
                </Section>

                {(node.source === "folder" || node.kind === "rule") && (
                    <Section title="로드 단위" hint={node.source === "folder" ? "폴더" : node.source === "rule-paths" ? "경로" : "세션"}>
                        {node.source === "folder" && (
                            <p className="leading-snug">
                                폴더 단위입니다. 이 폴더의 파일 {n(node.matchedFiles)}개 가운데 어느 것을 열어도 {n(node.chars)}자가 전부 로드됩니다.
                                {narrow.length > 0
                                    ? <> 섹션 {narrow.length}개({n(narrow.reduce((a, s) => a + s.chars, 0))}자)는 폴더의 한 곳만 다루므로, 경로 규칙으로 옮기면 그곳을 열 때만 로드됩니다.</>
                                    : <> 폴더 전체에 해당하는 내용이면 여기가 맞는 위치입니다.</>}
                            </p>
                        )}
                        {node.source === "rule-paths" && <p className="leading-snug">경로 단위입니다. 폴더가 아니라 파일의 경로에 맞춰 로드되므로 파일 종류나 여러 폴더에 걸친 규약을 한 곳에 둘 수 있습니다. 한 파일에 여러 규칙이 겹치면 모두 로드됩니다.</p>}
                        {node.source === "rule-always" && <p className="leading-snug">경로 조건이 없어서 로드되는 시점가 루트 CLAUDE.md 와 같습니다. 파일만 나뉘어 있습니다.</p>}
                    </Section>
                )}

                <Section title="크기">
                    {listed && (
                        <div className="mb-2">
                            <div className="mb-1 flex justify-between"><span>항상 로드되는 설명</span><Chars value={node.listingChars ?? 0} /></div>
                            <Meter label="목록 한 칸에 찬 정도" value={node.listingChars ?? 0} max={map.meta.limits.skillListing} />
                            <div className="mt-0.5 text-right text-[11px] text-muted-foreground">목록 한 칸 {n(map.meta.limits.skillListing)}자</div>
                        </div>
                    )}
                    <div className="mb-1 flex justify-between"><span>{listed ? "호출할 때 로드되는 본문" : "전체"}</span><span><Chars value={node.chars} /> <span className="text-muted-foreground">· {n(node.lines)}줄</span></span></div>
                    {node.level === 2 && (
                        <>
                            <Meter value={node.chars} max={limit} />
                            <div className="mt-0.5 flex justify-between text-[11px] text-muted-foreground">
                                <span>{Math.round(node.chars / limit * 100)}% 찼습니다</span><span>{n(limit)}자를 넘으면 뒤가 잘립니다</span>
                            </div>
                        </>
                    )}
                </Section>

                {node.sections && node.sections.length > 1 && (
                    <Section title="섹션" hint={`${node.sections.length}개`}>
                        <div className="space-y-1">
                            {node.sections.map((s, i) => (
                                <div key={`${s.title}${i}`}>
                                    <div className="flex justify-between gap-2"><span className="truncate">{s.title.replaceAll("`", "")}</span><Chars value={s.chars} className="shrink-0 text-[11px]" /></div>
                                    {s.narrow && <div className="num truncate text-[10.5px] text-muted-foreground" title={`이 섹션이 참조하는 경로 ${s.narrow.paths}곳이 모두 ${s.narrow.dir}/ 아래입니다`}>{s.narrow.dir.slice((node.dir ?? "").length)}/ 에서만 · 폴더의 {Math.round(s.narrow.share * 100)}%</div>}
                                    <div className="h-1 rounded-full bg-muted"><div className="h-full rounded-full bg-ring" style={{ width: `${s.chars / node.chars * 100}%` }} /></div>
                                </div>
                            ))}
                        </div>
                    </Section>
                )}

                {trace && (
                    <Section title="이 세션에서">
                        {hits.length === 0
                            ? <p className="text-muted-foreground">로드되지 않았습니다.</p>
                            : hits.map((h) => (
                                <div key={h.i} className="leading-snug">
                                    <span className="num">+{secs(h.at)}</span> 에 로드됐습니다. <span className="text-muted-foreground">{REASON_LABEL[h.reason ?? ""] ?? h.reason}</span>
                                    {h.trigger && <div className="num mt-0.5 break-all text-[11px] text-muted-foreground">트리거 파일 {h.trigger}</div>}
                                </div>
                            ))}
                    </Section>
                )}

                <Section title="누가 참조하나" hint={`${inbound.length}곳`}>
                    {inbound.length === 0
                        ? <p className="text-muted-foreground">{node.level <= 3 ? "자동으로 로드되므로 참조하는 곳이 없어도 로드됩니다." : "참조하는 곳이 없습니다."}</p>
                        : inbound.map((e) => <NodeLink key={e.from} node={byId.get(e.from)!} onSelect={onSelect} sub={e.kind === "hard" ? "자동 로드" : "문서에서 참조"} />)}
                </Section>

                {(outbound.length > 0 || (node.refs?.length ?? 0) > 0) && (
                    <Section title="무엇을 참조하나" hint={node.refs ? `경로 ${node.refs.length}곳` : undefined}>
                        {outbound.map((e) => <NodeLink key={e.to} node={byId.get(e.to)!} onSelect={onSelect} />)}
                        {dead.length > 0 && (
                            <div className="mt-2">
                                <div className="mb-1 text-[11px]" style={{ color: "var(--destructive)" }}>없는 경로 {dead.length}곳</div>
                                {dead.slice(0, 8).map((r) => <div key={r.path} className="num break-all text-[11px] text-muted-foreground">{r.path}</div>)}
                            </div>
                        )}
                    </Section>
                )}

                {related.length > 0 && (
                    <Section title="제안">
                        <div className="space-y-2">
                            {related.map((s) => (
                                <div key={s.id} className="rounded bg-secondary p-2">
                                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                        <span className="inline-block size-1.5 rounded-full" style={{ background: SEVERITY[s.severity].color }} />
                                        {SEVERITY[s.severity].label}{s.confidence && ` · ${CONFIDENCE[s.confidence].label}`}
                                    </div>
                                    <div className="mt-0.5 font-medium leading-snug">{s.title.replaceAll("`", "")}</div>
                                    <div className="mt-1 text-[12px] leading-snug text-muted-foreground">{s.action.replaceAll("`", "")}</div>
                                </div>
                            ))}
                        </div>
                    </Section>
                )}
            </div>
        </aside>
    );
}

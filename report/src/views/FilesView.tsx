import { CornerDownRight } from "lucide-react";
import { useMemo, useState } from "react";

import { Chars, LevelDot } from "@/components/bits";
import { Input, Meter } from "@/components/ui";
import { kindLabel, n, type ContextMap, type MapNode } from "@/data";
import { cn } from "@/lib/utils";

interface Props { map: ContextMap; selected: string | null; onSelect: (id: string | null) => void }

// 경로 하나를 받아, 그 파일을 열 때 자동으로 로드되는 내용을 맵의 조건으로 계산합니다.
function stackFor(map: ContextMap, path: string): MapNode[]
{
    return map.nodes.filter((x) => x.level === 2 && (x.kind === "nested" ? path.startsWith(x.dir ?? "\u0000") : (x.globs ?? []).some((g) => new RegExp(g.re).test(path))));
}

export function FilesView({ map, selected, onSelect }: Props)
{
    const first = map.stacks.find((s) => s.parts.some((p) => p.endsWith("CLAUDE.md")))?.examples[0] ?? map.stacks[0]?.examples[0] ?? "";
    const [path, setPath] = useState(first);
    const always = map.nodes.filter((x) => x.level === 1);
    const listing = map.nodes.filter((x) => x.kind === "skill" || x.kind === "agent").reduce((a, x) => a + (x.listingChars ?? 0), 0);
    const stack = useMemo(() => stackFor(map, path.trim()), [map, path]);
    const onDemand = stack.reduce((a, x) => a + x.chars, 0);
    const total = map.meta.alwaysChars + onDemand;
    const maxFiles = Math.max(...map.stacks.map((s) => s.files), 1);
    const byId = new Map(map.nodes.map((x) => [x.id, x]));

    return (
        <div className="grid h-full grid-cols-[minmax(420px,1fr)_minmax(420px,1.1fr)] overflow-hidden">
            <div className="flex min-h-0 flex-col border-r">
                <div className="border-b px-4 py-3">
                    <div className="mb-1.5 text-xs font-semibold">이 파일을 열면 무엇이 로드되나</div>
                    <Input
                        aria-label="열어 볼 파일 경로" value={path} onValueChange={(v) => setPath(v)} spellCheck={false} placeholder="apps/admin/src/app/page.tsx"
                        className="num"
                    />
                    <div className="mt-1.5 text-[11px] text-muted-foreground">경로를 적거나 오른쪽 표의 줄을 누릅니다. 아직 없는 파일의 경로도 됩니다.</div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                    <div className="mb-1 text-[11px] font-semibold text-muted-foreground">세션이 시작될 때 이미 로드된 것</div>
                    {always.map((x) => <StackRow key={x.id} node={x} picked={selected === x.id} onSelect={onSelect} />)}
                    <div className="flex items-center gap-2 rounded px-2 py-1.5 text-xs">
                        <LevelDot level={1} /><span className="flex-1">스킬 · 서브에이전트 설명</span><Chars value={listing} />
                    </div>

                    <div className="mb-1 mt-4 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground"><CornerDownRight className="size-3" />이 파일을 읽거나 고치는 순간 더 로드되는 것</div>
                    {stack.length === 0
                        ? <div className="rounded bg-secondary px-3 py-3 text-xs text-muted-foreground">더 로드되는 내용이 없습니다. 이 파일은 루트 지시문만 보고 고치게 됩니다.</div>
                        : stack.map((x) => <StackRow key={x.id} node={x} picked={selected === x.id} onSelect={onSelect} limit={map.meta.limits.onDemand200k} why={x.kind === "nested" ? "폴더 진입" : (x.globs ?? []).find((g) => new RegExp(g.re).test(path.trim()))?.glob} />)}

                    <div className="mt-4 cn-card gap-0 px-3 py-2.5">
                        <div className="flex items-baseline justify-between"><span className="text-xs text-muted-foreground">이 파일 하나를 고칠 때 로드되는 내용</span><Chars value={total} className="text-base font-semibold" /></div>
                        <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted">
                            <div style={{ width: `${map.meta.alwaysChars / total * 100}%`, background: "var(--lv1)" }} />
                            <div style={{ width: `${onDemand / total * 100}%`, background: "var(--lv2)" }} />
                        </div>
                        <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
                            <span>항상 로드되는 것 <span className="num">{n(map.meta.alwaysChars)}</span>자</span><span>이 파일 때문에 <span className="num">{n(onDemand)}</span>자</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex min-h-0 flex-col">
                <div className="border-b px-4 py-3">
                    <div className="text-xs font-semibold">저장소의 파일은 몇 가지 그룹으로 나뉩니다</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">같은 내용이 로드되는 파일끼리 묶었습니다. 소스 파일 {n(map.meta.sourceFiles)}개가 {map.stacks.length}가지로 나뉩니다.</div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                    {map.stacks.map((s) => (
                        <button
                            key={s.parts.join("|")} type="button" onClick={() => setPath(s.examples[0])}
                            className={cn("block w-full border-b px-4 py-2 text-left hover:bg-muted/60", s.examples.includes(path) && "bg-muted")}
                        >
                            <div className="flex items-center gap-3">
                                <span className="num w-14 shrink-0 text-right text-xs font-medium">{n(s.files)}</span>
                                <div className="h-1.5 w-24 shrink-0 rounded-full bg-muted"><div className="h-full rounded-full bg-ring" style={{ width: `${Math.max(s.files / maxFiles * 100, 2)}%` }} /></div>
                                <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                                    {s.parts.length === 0
                                        ? <span className="text-xs text-muted-foreground">루트만</span>
                                        : s.parts.map((p) => <span key={p} className="cn-badge cn-badge-variant-secondary inline-flex shrink-0 items-center whitespace-nowrap">{byId.get(p)?.title ?? p}</span>)}
                                </div>
                                <Chars value={s.chars} className="shrink-0 text-xs" />
                            </div>
                            <div className="num mt-0.5 truncate pl-[4.25rem] text-[11px] text-muted-foreground">{s.topDirs.slice(0, 3).map(([d, c]) => `${d} ${n(c)}`).join(" · ")}</div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

function StackRow({ node, picked, onSelect, limit, why }: { node: MapNode; picked: boolean; onSelect: (id: string) => void; limit?: number; why?: string })
{
    return (
        <button type="button" onClick={() => onSelect(node.id)} className={cn("flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted", picked && "bg-muted")}>
            <LevelDot level={node.level} />
            <span className="min-w-0 flex-1">
                <span className="block truncate">{node.title} <span className="text-[11px] text-muted-foreground">{kindLabel(node)}</span></span>
                {why && <span className="num block truncate text-[10.5px] text-muted-foreground">{why}</span>}
            </span>
            {limit && <Meter value={node.chars} max={limit} className="w-16" />}
            <Chars value={node.chars} className="w-20 shrink-0 text-right" />
        </button>
    );
}

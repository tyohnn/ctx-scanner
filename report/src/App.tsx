import { ReactFlowProvider } from "@xyflow/react";
import { Moon, Sun } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Inspector } from "@/components/Inspector";
import { settled } from "@/components/advice";
import { IconToggle, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { loadReport } from "@/data";
import type { FlowFilter } from "@/lib/flowgraph";
import { AreaCanvasView } from "@/views/AreaCanvasView";
import { AreaMapView } from "@/views/AreaMapView";
import { FilesView } from "@/views/FilesView";
import { FlowView } from "@/views/FlowView";
import { MapView } from "@/views/MapView";
import { SessionCanvasView } from "@/views/SessionCanvasView";
import { StructureView } from "@/views/StructureView";
import { SummaryView } from "@/views/SummaryView";
import { TestsView } from "@/views/TestsView";
import { TimelineView } from "@/views/TimelineView";
import { TodoView } from "@/views/TodoView";

// 탭은 읽는 사람의 물음 순서입니다: 얼마나(요약) → 어떻게 생겼나(구조 · 영역 · 세션) → 무엇부터(할 일) → 무엇이 무엇을 부르나(플로우) → 어디가 무겁나(영역 지도) → 이 파일은(파일) → 자세히(맵 · 타임라인 · 시나리오).
type Tab = "summary" | "structure" | "area" | "session" | "todo" | "flow" | "areas" | "files" | "map" | "timeline" | "tests";
const TABS: Tab[] = ["summary", "structure", "area", "session", "todo", "flow", "areas", "files", "map", "timeline", "tests"];

// 주소의 # 뒤에 보던 위치를 적어 둡니다. 보고서를 다시 열거나 남에게 건넬 때 같은 화면이 뜹니다.
function readHash()
{
    const p = new URLSearchParams(location.hash.slice(1));
    // 지난 버전의 탭 이름(advice)으로 건넨 주소도 같은 화면을 엽니다.
    const raw = p.get("tab") === "advice" ? "todo" : p.get("tab");
    const tab = TABS.includes(raw as Tab) ? raw as Tab : "summary";
    return { tab, node: p.get("node"), trace: Number(p.get("trace") ?? -1), dark: p.get("theme") === "dark", area: p.get("area"), scope: p.get("scope") };
}

export function App()
{
    const report = useMemo(loadReport, []);
    const init = useMemo(readHash, []);
    const [tab, setTab] = useState<Tab>(init.tab);
    const [selected, setSelected] = useState<string | null>(init.node);
    const [traceIndex, setTraceIndex] = useState(init.trace);
    const [dark, setDark] = useState(init.dark);
    const [filter, setFilter] = useState<FlowFilter>({ area: init.area, scope: init.scope, common: false });

    useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]);
    useEffect(() =>
    {
        const p = new URLSearchParams({ tab });
        if (selected) p.set("node", selected);
        if (traceIndex >= 0) p.set("trace", String(traceIndex));
        if (tab === "flow" && filter.area) p.set("area", filter.area);
        if (tab === "flow" && filter.scope) p.set("scope", filter.scope);
        // 밝은 화면이 기본입니다. 어두운 화면을 고른 때만 주소에 적습니다.
        if (dark) p.set("theme", "dark");
        // 미리보기 창처럼 샌드박스 iframe(about:srcdoc)에서 열면 replaceState 가 SecurityError 를 던집니다.
        // 그 오류가 화면 전체를 비우지 않도록 주소에 적는 것만 포기합니다.
        try { history.replaceState(null, "", `#${p}`); }
        catch { /* 주소에 적지 못해도 화면은 그대로 씁니다. */ }
    }, [tab, selected, traceIndex, dark, filter]);
    // 같은 문서 안에서 주소의 # 만 바꿔도 그 화면으로 갑니다(링크로 탭을 건넬 때).
    useEffect(() =>
    {
        const on = () => { const h = readHash(); setTab(h.tab); setSelected(h.node); if (h.area || h.scope) setFilter((f) => ({ ...f, area: h.area, scope: h.scope })); };
        window.addEventListener("hashchange", on);
        return () => window.removeEventListener("hashchange", on);
    }, []);
    const openCell = (area: string, scope: string) => { setFilter((f) => ({ ...f, area, scope })); setTab("flow"); };

    if (!report)
    {
        return <div className="grid h-full place-items-center text-muted-foreground">이 문서에는 아직 자료가 없습니다. context-scanner 스킬이 맵을 만들어 채웁니다.</div>;
    }

    const { map, traces, tests } = report;
    const trace = traces.length ? traces[traceIndex >= 0 && traceIndex < traces.length ? traceIndex : traces.length - 1] : null;
    const node = map.nodes.find((x) => x.id === selected) ?? null;
    const todoCount = map.suggestions.filter((x) => !settled(x)).length + (trace?.findings.length ?? 0);
    const tabs: { key: Tab; label: string; badge?: string | number; show: boolean }[] = [
        { key: "summary", label: "요약", show: true },
        { key: "structure", label: "구조", show: true },
        { key: "area", label: "영역", show: !!map.flows?.length },
        { key: "session", label: "세션", badge: traces.length || undefined, show: true },
        { key: "todo", label: "할 일", badge: todoCount, show: true },
        { key: "flow", label: "플로우", show: !!map.flows?.length },
        { key: "areas", label: "영역 지도", show: !!map.flows?.length },
        { key: "files", label: "파일", show: true },
        { key: "map", label: "맵", show: true },
        { key: "timeline", label: "타임라인", badge: traces.length || undefined, show: true },
        { key: "tests", label: "시나리오", badge: tests?.scenarios.length, show: true },
    ];
    document.title = `context-scanner · ${report.title ?? map.meta.repo}`;

    return (
        <ReactFlowProvider>
            <Tabs value={tab} onValueChange={(v) => { if (v) setTab(v as Tab); }} className="h-full gap-0">
                <header className="flex h-(--tabs-line-height) shrink-0 items-center gap-4 border-b bg-sidebar px-4">
                    <div className="flex shrink-0 items-baseline gap-2">
                        <span className="num text-sm font-semibold tracking-tight">context-scanner</span>
                        <span className="text-xs text-muted-foreground">{report.title ?? map.meta.repo}{map.meta.commit && <span className="num"> @ {map.meta.commit}</span>}</span>
                    </div>
                    <TabsList aria-label="보고서 화면" className="min-w-0 gap-4 overflow-x-auto border-b-0">
                        {tabs.filter((t) => t.show).map((t) => (
                            <TabsTrigger key={t.key} value={t.key}>
                                {t.label}{t.badge != null && <span className="num text-muted-foreground">{t.badge}</span>}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                    <div className="ml-auto flex items-center gap-4 text-[11px] text-muted-foreground">
                        <IconToggle aria-label="어두운 화면" pressed={dark} onPressedChange={(v) => setDark(v)} className="no-print">{dark ? <Sun /> : <Moon />}</IconToggle>
                    </div>
                </header>
                <div className="flex min-h-0 flex-1">
                    <main className="min-w-0 flex-1">
                        <TabsContent value="summary" className="h-full"><SummaryView report={report} trace={trace} onOpenCell={openCell} onOpenTodo={() => setTab("todo")} /></TabsContent>
                        <TabsContent value="structure" className="h-full"><StructureView map={map} onSelect={setSelected} /></TabsContent>
                        <TabsContent value="area" className="h-full"><AreaCanvasView map={map} onSelect={setSelected} /></TabsContent>
                        <TabsContent value="session" className="h-full">{trace ? <SessionCanvasView key={trace.session} map={map} trace={trace} traces={traces} onPickTrace={setTraceIndex} onSelect={setSelected} /> : <NoData title="이 측정에는 세션 기록이 없습니다" body="trace 스킬로 세션 기록을 읽은 뒤 보고서를 다시 만들면 여기에 나옵니다." />}</TabsContent>
                        <TabsContent value="todo" className="h-full"><TodoView map={map} trace={trace} onSelect={setSelected} /></TabsContent>
                        <TabsContent value="flow" className="h-full"><FlowView map={map} filter={filter} onFilter={setFilter} onSelect={setSelected} /></TabsContent>
                        <TabsContent value="areas" className="h-full"><AreaMapView map={map} onOpenCell={openCell} /></TabsContent>
                        <TabsContent value="map" className="h-full"><MapView map={map} trace={trace} selected={selected} onSelect={setSelected} /></TabsContent>
                        <TabsContent value="timeline" className="h-full">{trace ? <TimelineView key={trace.session} trace={trace} traces={traces} onPickTrace={setTraceIndex} selected={selected} onSelect={setSelected} /> : <NoData title="이 측정에는 세션 기록이 없습니다" body="세션 기록은 이 저장소에서 끝난 클로드 코드 세션의 로그입니다. 보고서를 만드는 세션 자신의 기록은 뺍니다. trace 스킬로 세션 기록을 읽은 뒤 보고서를 다시 만들면 여기에 나옵니다." />}</TabsContent>
                        <TabsContent value="files" className="h-full"><FilesView map={map} selected={selected} onSelect={setSelected} /></TabsContent>
                        <TabsContent value="tests" className="h-full">{tests ? <TestsView tests={tests} onOpenTrace={(s) => { setTraceIndex(traces.findIndex((t) => t.session === s)); setTab("timeline"); }} /> : <NoData title="이 측정에서는 시나리오를 돌리지 않았습니다" body="시나리오는 정해 둔 작업을 새 세션에 맡겨 어떤 지시문이 실제로 읽혔는지 재는 단계입니다. test 스킬로 시나리오를 돌린 뒤 보고서를 다시 만들면 여기에 나옵니다." />}</TabsContent>
                    </main>
                    {/* 상세 패널은 무언가를 골랐을 때만 엽니다. 비어 있을 때 화면을 차지하지 않게 합니다. */}
                    {node && tab !== "tests" && <Inspector map={map} trace={trace} node={node} onSelect={setSelected} />}
                </div>
            </Tabs>
        </ReactFlowProvider>
    );
}

// 자료가 없는 탭도 숨기지 않고 왜 비었는지 알립니다. 탭이 버전마다 생겼다 사라지면 화면이 없어진 것으로 읽힙니다.
function NoData({ title, body }: { title: string; body: string })
{
    return (
        <div className="grid h-full place-items-center px-6">
            <div className="max-w-[56ch] space-y-1.5 text-center">
                <p className="text-sm font-medium">{title}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{body}</p>
            </div>
        </div>
    );
}

import { ReactFlowProvider } from "@xyflow/react";
import { Moon, Sun } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Inspector } from "@/components/Inspector";
import { settled } from "@/components/advice";
import { IconToggle, Select, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { loadReport, secs } from "@/data";
import type { FlowFilter } from "@/lib/flowgraph";
import { AreaMapView } from "@/views/AreaMapView";
import { FilesView } from "@/views/FilesView";
import { FlowView } from "@/views/FlowView";
import { MapView } from "@/views/MapView";
import { SummaryView } from "@/views/SummaryView";
import { TestsView } from "@/views/TestsView";
import { TimelineView } from "@/views/TimelineView";
import { TodoView } from "@/views/TodoView";

// 탭은 읽는 사람의 물음 순서입니다: 얼마나(요약) → 무엇부터(할 일) → 무엇이 무엇을 부르나(플로우) → 어디가 무겁나(영역 지도) → 이 파일은(파일) → 자세히(맵 · 타임라인 · 시나리오).
type Tab = "summary" | "todo" | "flow" | "areas" | "files" | "map" | "timeline" | "tests";
const TABS: Tab[] = ["summary", "todo", "flow", "areas", "files", "map", "timeline", "tests"];

// 주소의 # 뒤에 보던 위치를 적어 둡니다. 보고서를 다시 열거나 남에게 건넬 때 같은 화면이 뜹니다.
function readHash()
{
    const p = new URLSearchParams(location.hash.slice(1));
    // 지난 버전의 탭 이름(advice)으로 건넨 주소도 같은 화면을 엽니다.
    const raw = p.get("tab") === "advice" ? "todo" : p.get("tab");
    const tab = TABS.includes(raw as Tab) ? raw as Tab : "summary";
    return { tab, node: p.get("node"), trace: Number(p.get("trace") ?? -1), dark: p.get("theme") !== "light", area: p.get("area"), scope: p.get("scope") };
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
        if (!dark) p.set("theme", "light");
        history.replaceState(null, "", `#${p}`);
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
        return <div className="grid h-full place-items-center text-muted-foreground">이 문서에는 아직 자료가 없습니다. ctxscope 스킬이 맵을 만들어 채웁니다.</div>;
    }

    const { map, traces, tests } = report;
    const trace = traces.length ? traces[traceIndex >= 0 && traceIndex < traces.length ? traceIndex : traces.length - 1] : null;
    const node = map.nodes.find((x) => x.id === selected) ?? null;
    const todoCount = map.suggestions.filter((x) => !settled(x)).length + (trace?.findings.length ?? 0);
    const tabs: { key: Tab; label: string; badge?: string | number; show: boolean }[] = [
        { key: "summary", label: "요약", show: true },
        { key: "todo", label: "할 일", badge: todoCount, show: true },
        { key: "flow", label: "플로우", show: !!map.flows?.length },
        { key: "areas", label: "영역 지도", show: !!map.flows?.length },
        { key: "files", label: "파일", show: true },
        { key: "map", label: "맵", show: true },
        { key: "timeline", label: "타임라인", badge: traces.length || undefined, show: traces.length > 0 },
        { key: "tests", label: "시나리오", badge: tests?.scenarios.length, show: !!tests },
    ];
    document.title = `ctxscope · ${report.title ?? map.meta.repo}`;

    return (
        <ReactFlowProvider>
            <Tabs value={tab} onValueChange={(v) => { if (v) setTab(v as Tab); }} className="h-full gap-0">
                <header className="flex h-(--tabs-line-height) shrink-0 items-center gap-4 border-b bg-sidebar px-4">
                    <div className="flex items-baseline gap-2">
                        <span className="num text-sm font-semibold tracking-tight">ctxscope</span>
                        <span className="text-xs text-muted-foreground">{report.title ?? map.meta.repo}{map.meta.commit && <span className="num"> @ {map.meta.commit}</span>}</span>
                    </div>
                    <TabsList aria-label="보고서 화면" className="gap-4 border-b-0">
                        {tabs.filter((t) => t.show).map((t) => (
                            <TabsTrigger key={t.key} value={t.key}>
                                {t.label}{t.badge != null && <span className="num text-muted-foreground">{t.badge}</span>}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                    <div className="ml-auto flex items-center gap-4 text-[11px] text-muted-foreground">
{traces.length > 1 && (
                            <Select
                                label="볼 세션" value={String(traces.indexOf(trace!))} onChange={(v) => setTraceIndex(Number(v))} className="no-print max-w-64"
                                items={traces.map((t, i) => ({
                                    value: String(i), label: `${t.session.slice(0, 6)} · ${secs(t.duration)} · ${t.prompt?.preview?.slice(0, 22) ?? "세션"}`,
                                    node: <><span className="num text-muted-foreground">{t.session.slice(0, 6)}</span><span className="num w-14 text-right text-muted-foreground">{secs(t.duration)}</span><span className="truncate">{t.prompt?.preview?.slice(0, 34) ?? "세션"}</span></>,
                                }))}
                            />
                        )}
                        <IconToggle aria-label="어두운 화면" pressed={dark} onPressedChange={(v) => setDark(v)} className="no-print">{dark ? <Sun /> : <Moon />}</IconToggle>
                    </div>
                </header>
                <div className="flex min-h-0 flex-1">
                    <main className="min-w-0 flex-1">
                        <TabsContent value="summary" className="h-full"><SummaryView report={report} trace={trace} onOpenCell={openCell} onOpenTodo={() => setTab("todo")} /></TabsContent>
                        <TabsContent value="todo" className="h-full"><TodoView map={map} trace={trace} onSelect={setSelected} /></TabsContent>
                        <TabsContent value="flow" className="h-full"><FlowView map={map} filter={filter} onFilter={setFilter} onSelect={setSelected} /></TabsContent>
                        <TabsContent value="areas" className="h-full"><AreaMapView map={map} onOpenCell={openCell} /></TabsContent>
                        <TabsContent value="map" className="h-full"><MapView map={map} trace={trace} selected={selected} onSelect={setSelected} /></TabsContent>
                        {trace && <TabsContent value="timeline" className="h-full"><TimelineView key={trace.session} trace={trace} selected={selected} onSelect={setSelected} /></TabsContent>}
                        <TabsContent value="files" className="h-full"><FilesView map={map} selected={selected} onSelect={setSelected} /></TabsContent>
                        {tests && <TabsContent value="tests" className="h-full"><TestsView tests={tests} onOpenTrace={(s) => { setTraceIndex(traces.findIndex((t) => t.session === s)); setTab("timeline"); }} /></TabsContent>}
                    </main>
                    {/* 상세 패널은 무언가를 골랐을 때만 엽니다. 비어 있을 때 화면을 차지하지 않게 합니다. */}
                    {node && tab !== "tests" && <Inspector map={map} trace={trace} node={node} onSelect={setSelected} />}
                </div>
            </Tabs>
        </ReactFlowProvider>
    );
}

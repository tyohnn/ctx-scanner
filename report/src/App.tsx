import { ReactFlowProvider } from "@xyflow/react";
import { Moon, Sun } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Inspector } from "@/components/Inspector";
import { Chars } from "@/components/bits";
import { IconToggle, Select, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { loadReport, n, secs } from "@/data";
import { AdviceView } from "@/views/AdviceView";
import { FilesView } from "@/views/FilesView";
import { MapView } from "@/views/MapView";
import { TestsView } from "@/views/TestsView";
import { TimelineView } from "@/views/TimelineView";

type Tab = "map" | "timeline" | "files" | "tests" | "advice";

// 주소의 # 뒤에 보던 위치를 적어 둡니다. 보고서를 다시 열거나 남에게 건넬 때 같은 화면이 뜹니다.
function readHash()
{
    const p = new URLSearchParams(location.hash.slice(1));
    return { tab: (p.get("tab") as Tab) ?? "map", node: p.get("node"), trace: Number(p.get("trace") ?? -1), dark: p.get("theme") !== "light" };
}

export function App()
{
    const report = useMemo(loadReport, []);
    const init = useMemo(readHash, []);
    const [tab, setTab] = useState<Tab>(init.tab);
    const [selected, setSelected] = useState<string | null>(init.node);
    const [traceIndex, setTraceIndex] = useState(init.trace);
    const [dark, setDark] = useState(init.dark);

    useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]);
    useEffect(() =>
    {
        const p = new URLSearchParams({ tab });
        if (selected) p.set("node", selected);
        if (traceIndex >= 0) p.set("trace", String(traceIndex));
        if (!dark) p.set("theme", "light");
        history.replaceState(null, "", `#${p}`);
    }, [tab, selected, traceIndex, dark]);

    if (!report)
    {
        return <div className="grid h-full place-items-center text-muted-foreground">이 문서에는 아직 자료가 없습니다. ctxscope 스킬이 맵을 만들어 채웁니다.</div>;
    }

    const { map, traces, tests } = report;
    const trace = traces.length ? traces[traceIndex >= 0 && traceIndex < traces.length ? traceIndex : traces.length - 1] : null;
    const node = map.nodes.find((x) => x.id === selected) ?? null;
    const count = (kind: string) => map.nodes.filter((x) => x.kind === kind).length;
    const alwaysRules = map.nodes.filter((x) => x.source === "rule-always").length;
    const tabs: { key: Tab; label: string; badge?: string | number; show: boolean }[] = [
        { key: "map", label: "맵", show: true },
        { key: "timeline", label: "타임라인", badge: traces.length || undefined, show: traces.length > 0 },
        { key: "files", label: "파일", show: true },
        { key: "tests", label: "시나리오", badge: tests?.scenarios.length, show: !!tests },
        { key: "advice", label: "제안", badge: map.suggestions.length + (trace?.findings.length ?? 0), show: true },
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
                        <span>항상 로드되는 내용 <Chars value={map.meta.alwaysChars} className="text-foreground" /></span>
                        <span>폴더 지시문 <span className="num text-foreground">{count("nested")}</span></span>
                        <span>경로 규칙 <span className="num text-foreground">{count("rule") - alwaysRules}</span></span>
                        {alwaysRules > 0 && <span>항상 로드되는 규칙 <span className="num text-foreground">{alwaysRules}</span></span>}
                        <span>스킬 <span className="num text-foreground">{count("skill")}</span></span>
                        <span>파일 <span className="num text-foreground">{n(map.meta.files)}</span></span>
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
                        <TabsContent value="map" className="h-full"><MapView map={map} trace={trace} selected={selected} onSelect={setSelected} /></TabsContent>
                        {trace && <TabsContent value="timeline" className="h-full"><TimelineView key={trace.session} trace={trace} selected={selected} onSelect={setSelected} /></TabsContent>}
                        <TabsContent value="files" className="h-full"><FilesView map={map} selected={selected} onSelect={setSelected} /></TabsContent>
                        {tests && <TabsContent value="tests" className="h-full"><TestsView tests={tests} onOpenTrace={(s) => { setTraceIndex(traces.findIndex((t) => t.session === s)); setTab("timeline"); }} /></TabsContent>}
                        <TabsContent value="advice" className="h-full"><AdviceView map={map} trace={trace} onSelect={setSelected} /></TabsContent>
                    </main>
                    {tab !== "tests" && <Inspector map={map} trace={trace} node={node} onSelect={setSelected} />}
                </div>
            </Tabs>
        </ReactFlowProvider>
    );
}

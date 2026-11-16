import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui-sdk/react/select";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@ui-sdk/react/tabs";
import { Toggle, ToggleIcon } from "@ui-sdk/react/toggle";
import { ReactFlowProvider } from "@xyflow/react";
import { ChevronsUpDown, Moon, Sun } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Inspector } from "@/components/Inspector";
import { Chars } from "@/components/bits";
import { loadReport, n, secs } from "@/data";
import { AdviceView } from "@/views/AdviceView";
import { FilesView } from "@/views/FilesView";
import { MapView } from "@/views/MapView";
import { TestsView } from "@/views/TestsView";
import { TimelineView } from "@/views/TimelineView";

type Tab = "map" | "timeline" | "files" | "tests" | "advice";

// 주소의 # 뒤에 보던 자리를 적어 둡니다. 보고서를 다시 열거나 남에게 건넬 때 같은 화면이 뜹니다.
function readHash()
{
    const p = new URLSearchParams(location.hash.slice(1));
    return { tab: (p.get("tab") as Tab) ?? "map", node: p.get("node"), trace: Number(p.get("trace") ?? -1), dark: p.get("theme") === "dark" };
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
        if (dark) p.set("theme", "dark");
        history.replaceState(null, "", `#${p}`);
    }, [tab, selected, traceIndex, dark]);

    if (!report)
    {
        return <div className="grid h-full place-items-center text-muted-foreground">이 문서에는 아직 자료가 없습니다. ctxscope 스킬이 지도를 만들어 채웁니다.</div>;
    }

    const { map, traces, tests } = report;
    const trace = traces.length ? traces[traceIndex >= 0 && traceIndex < traces.length ? traceIndex : traces.length - 1] : null;
    const node = map.nodes.find((x) => x.id === selected) ?? null;
    const count = (kind: string) => map.nodes.filter((x) => x.kind === kind).length;
    const tabs: { key: Tab; label: string; badge?: string | number; show: boolean }[] = [
        { key: "map", label: "지도", show: true },
        { key: "timeline", label: "기록", badge: traces.length || undefined, show: traces.length > 0 },
        { key: "files", label: "파일", show: true },
        { key: "tests", label: "시나리오", badge: tests?.scenarios.length, show: !!tests },
        { key: "advice", label: "제안", badge: map.suggestions.length + (trace?.findings.length ?? 0), show: true },
    ];
    document.title = `ctxscope · ${report.title ?? map.meta.repo}`;

    return (
        <ReactFlowProvider>
            <Tabs value={tab} onValueChange={(v) => { if (v) setTab(v as Tab); }} className="flex h-full flex-col">
                <header className="flex items-center gap-4 border-b bg-card px-4 py-2">
                    <div className="flex items-baseline gap-2">
                        <span className="num text-sm font-semibold tracking-tight">ctxscope</span>
                        <span className="text-xs text-muted-foreground">{report.title ?? map.meta.repo}{map.meta.commit && <span className="num"> @ {map.meta.commit}</span>}</span>
                    </div>
                    <TabsList aria-label="보고서 화면" className="flex items-center gap-0.5">
                        {tabs.filter((t) => t.show).map((t) => (
                            <TabsTab
                                key={t.key} value={t.key}
                                className="cursor-pointer rounded px-2.5 py-1 text-xs text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[selected]:bg-primary data-[selected]:text-primary-foreground"
                            >
                                {t.label}{t.badge != null && <span className="num ml-1 opacity-70">{t.badge}</span>}
                            </TabsTab>
                        ))}
                    </TabsList>
                    <div className="ml-auto flex items-center gap-4 text-[11px] text-muted-foreground">
                        <span>늘 실리는 글 <Chars value={map.meta.alwaysChars} className="text-foreground" /></span>
                        <span>폴더 지시문 <span className="num text-foreground">{count("nested")}</span></span>
                        <span>경로 규칙 <span className="num text-foreground">{count("rule")}</span></span>
                        <span>스킬 <span className="num text-foreground">{count("skill")}</span></span>
                        <span>파일 <span className="num text-foreground">{n(map.meta.files)}</span></span>
                        {traces.length > 1 && (
                            <Select
                                aria-label="볼 세션" value={String(traces.indexOf(trace!))} onValueChange={(v) => { if (typeof v === "string") setTraceIndex(Number(v)); }}
                                items={traces.map((t, i) => ({ value: String(i), label: `${t.session.slice(0, 6)} · ${secs(t.duration)} · ${t.prompt?.preview?.slice(0, 22) ?? "세션"}` }))}
                            >
                                <SelectTrigger className="no-print flex max-w-64 cursor-pointer items-center gap-1 rounded border bg-card px-1.5 py-1 text-[11px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                    <SelectValue className="truncate" /><ChevronsUpDown className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                                </SelectTrigger>
                                <SelectContent align="end" sideOffset={4} className="z-50 max-h-80 min-w-[var(--anchor-width)] overflow-y-auto rounded-md border bg-card p-1 text-xs text-foreground shadow-lg outline-none">
                                    {traces.map((t, i) => (
                                        <SelectItem key={t.session} value={String(i)} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-muted data-[selected]:font-semibold">
                                            <span className="num text-muted-foreground">{t.session.slice(0, 6)}</span>
                                            <span className="num w-14 text-right text-muted-foreground">{secs(t.duration)}</span>
                                            <span className="truncate">{t.prompt?.preview?.slice(0, 34) ?? "세션"}</span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        <Toggle aria-label="어두운 화면" pressed={dark} onPressedChange={(v) => setDark(v)} className="no-print cursor-pointer rounded p-1 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring data-[pressed]:text-foreground">
                            <ToggleIcon>{dark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}</ToggleIcon>
                        </Toggle>
                    </div>
                </header>
                <div className="flex min-h-0 flex-1">
                    <main className="min-w-0 flex-1">
                        <TabsPanel value="map" className="h-full outline-none"><MapView map={map} trace={trace} selected={selected} onSelect={setSelected} /></TabsPanel>
                        {trace && <TabsPanel value="timeline" className="h-full outline-none"><TimelineView key={trace.session} trace={trace} selected={selected} onSelect={setSelected} /></TabsPanel>}
                        <TabsPanel value="files" className="h-full outline-none"><FilesView map={map} selected={selected} onSelect={setSelected} /></TabsPanel>
                        {tests && <TabsPanel value="tests" className="h-full outline-none"><TestsView tests={tests} onOpenTrace={(s) => { setTraceIndex(traces.findIndex((t) => t.session === s)); setTab("timeline"); }} /></TabsPanel>}
                        <TabsPanel value="advice" className="h-full outline-none"><AdviceView map={map} trace={trace} onSelect={setSelected} /></TabsPanel>
                    </main>
                    {tab !== "tests" && <Inspector map={map} trace={trace} node={node} onSelect={setSelected} />}
                </div>
            </Tabs>
        </ReactFlowProvider>
    );
}

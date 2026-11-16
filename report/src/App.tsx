import { ReactFlowProvider } from "@xyflow/react";
import { Moon, Sun } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Inspector } from "@/components/Inspector";
import { Chars } from "@/components/bits";
import { loadReport, n, secs } from "@/data";
import { cn } from "@/lib/utils";
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
            <div className="flex h-full flex-col">
                <header className="flex items-center gap-4 border-b bg-card px-4 py-2">
                    <div className="flex items-baseline gap-2">
                        <span className="num text-sm font-semibold tracking-tight">ctxscope</span>
                        <span className="text-xs text-muted-foreground">{report.title ?? map.meta.repo}{map.meta.commit && <span className="num"> @ {map.meta.commit}</span>}</span>
                    </div>
                    <nav className="flex items-center gap-0.5">
                        {tabs.filter((t) => t.show).map((t) => (
                            <button
                                key={t.key} type="button" onClick={() => setTab(t.key)}
                                className={cn("rounded px-2.5 py-1 text-xs transition-colors", tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
                            >
                                {t.label}{t.badge != null && <span className="num ml-1 opacity-70">{t.badge}</span>}
                            </button>
                        ))}
                    </nav>
                    <div className="ml-auto flex items-center gap-4 text-[11px] text-muted-foreground">
                        <span>늘 실리는 글 <Chars value={map.meta.alwaysChars} className="text-foreground" /></span>
                        <span>폴더 지시문 <span className="num text-foreground">{count("nested")}</span></span>
                        <span>경로 규칙 <span className="num text-foreground">{count("rule")}</span></span>
                        <span>스킬 <span className="num text-foreground">{count("skill")}</span></span>
                        <span>파일 <span className="num text-foreground">{n(map.meta.files)}</span></span>
                        {traces.length > 1 && (
                            <select
                                value={traces.indexOf(trace!)} onChange={(e) => setTraceIndex(Number(e.target.value))}
                                className="no-print max-w-56 rounded border bg-card px-1.5 py-1 text-[11px] text-foreground outline-none"
                            >
                                {traces.map((t, i) => <option key={t.session} value={i}>{t.session.slice(0, 6)} · {secs(t.duration)} · {t.prompt?.preview?.slice(0, 22) ?? "세션"}</option>)}
                            </select>
                        )}
                        <button type="button" onClick={() => setDark(!dark)} className="no-print rounded p-1 hover:bg-muted" aria-label="밝기 바꾸기">{dark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}</button>
                    </div>
                </header>
                <div className="flex min-h-0 flex-1">
                    <main className="min-w-0 flex-1">
                        {tab === "map" && <MapView map={map} trace={trace} selected={selected} onSelect={setSelected} />}
                        {tab === "timeline" && trace && <TimelineView trace={trace} selected={selected} onSelect={setSelected} />}
                        {tab === "files" && <FilesView map={map} selected={selected} onSelect={setSelected} />}
                        {tab === "tests" && tests && <TestsView tests={tests} onOpenTrace={(s) => { setTraceIndex(traces.findIndex((t) => t.session === s)); setTab("timeline"); }} />}
                        {tab === "advice" && <AdviceView map={map} trace={trace} onSelect={setSelected} />}
                    </main>
                    {tab !== "tests" && <Inspector map={map} trace={trace} node={node} onSelect={setSelected} />}
                </div>
            </div>
        </ReactFlowProvider>
    );
}

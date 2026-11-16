import { Meter as MeterRoot, MeterIndicator, MeterTrack } from "@ui-sdk/react/meter";
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from "@ui-sdk/react/segmented-control";
import type { ReactNode } from "react";

import { KIND_LABEL, LEVELS, n, type Level, type MapNode } from "@/data";
import { cn } from "@/lib/utils";

export function LevelDot({ level, className }: { level: Level; className?: string })
{
    return <span className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: LEVELS[level].color }} />;
}

export function LevelBadge({ level }: { level: Level })
{
    return (
        <span className="inline-flex items-center gap-1.5 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
            <LevelDot level={level} />
            <span className="num">{level}</span>
            {LEVELS[level].label}
        </span>
    );
}

// 상한에 얼마나 찼는지 보이는 막대입니다. 85% 부터 색이 바뀝니다.
export function Meter({ value, max, label = "상한까지 찬 정도", className }: { value: number; max: number; label?: string; className?: string })
{
    const pct = Math.min(value / max, 1);
    const color = value >= max ? "var(--bad)" : pct >= 0.85 ? "var(--warn)" : "var(--ring)";
    return (
        <MeterRoot aria-label={label} value={value} max={max} format={(v) => `${n(v)}자`} className={cn("block w-full", className)}>
            <MeterTrack className="block h-1 w-full overflow-hidden rounded-full bg-muted">
                <MeterIndicator className="block h-full rounded-full" style={{ width: "max(var(--meter-value), 2%)", background: color }} />
            </MeterTrack>
        </MeterRoot>
    );
}

export function Chars({ value, className }: { value: number; className?: string })
{
    return <span className={cn("num", className)}>{n(value)}<span className="ml-0.5 text-muted-foreground">자</span></span>;
}

export function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode })
{
    return (
        <section className="border-b px-4 py-3 last:border-b-0">
            <div className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground">{title}</h3>
                {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
            </div>
            {children}
        </section>
    );
}

export function NodeLink({ node, onSelect, sub }: { node: MapNode; onSelect: (id: string) => void; sub?: ReactNode })
{
    return (
        <button type="button" onClick={() => onSelect(node.id)} className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-muted">
            <LevelDot level={node.level} />
            <span className="min-w-0 flex-1 truncate">{node.title}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground">{sub ?? KIND_LABEL[node.kind]}</span>
        </button>
    );
}

// 몇 가지 가운데 하나를 고르는 줄입니다. 고른 칸 뒤로 표시가 미끄러져 옵니다.
export function Segmented<T extends string>({ label, value, onChange, items }: { label: string; value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[] })
{
    return (
        <SegmentedControl aria-label={label} value={value} onValueChange={(v) => { if (v) onChange(v as T); }} className="relative inline-flex items-center rounded-md bg-muted p-0.5">
            <SegmentedControlIndicator
                className="absolute rounded bg-card shadow-sm transition-[left,width] duration-150 ease-out"
                style={{ left: "var(--segmented-control-indicator-left)", top: "var(--segmented-control-indicator-top)", width: "var(--segmented-control-indicator-width)", height: "var(--segmented-control-indicator-height)" }}
            />
            {items.map((it) => (
                <SegmentedControlItem key={it.value} value={it.value} className="relative z-[1] cursor-pointer rounded px-2 py-1 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[checked]:text-foreground">
                    {it.label}
                </SegmentedControlItem>
            ))}
        </SegmentedControl>
    );
}

export const SEVERITY: Record<string, { label: string; color: string }> = {
    high: { label: "먼저", color: "var(--bad)" }, medium: { label: "다음", color: "var(--warn)" }, low: { label: "여유 있을 때", color: "var(--lv5)" },
};
export const CONFIDENCE: Record<string, { label: string; hint: string }> = {
    measured: { label: "잰 사실", hint: "파일이나 기록에서 그대로 잰 값입니다" },
    heuristic: { label: "글에서 짐작", hint: "글이 가리키는 경로로 미루어 본 것입니다" },
    "needs-test": { label: "재 봐야 함", hint: "시나리오로 돌려 봐야 답이 나옵니다" },
};

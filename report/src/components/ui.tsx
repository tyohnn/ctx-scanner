// 동작은 UI SDK 가 맡고, 모양은 graphite 의 3층 규칙이 맡습니다. 이 파일은 그 둘을 잇습니다.
// UI SDK 부품에 tyohnn 과 같은 훅 클래스(cn-*)를 달고, tyohnn 이 부품의 TSX 에 두는 배치용 클래스를 함께 적습니다.
// ⚠ 색 · 높이 · 모서리 · 그림자를 여기에 적지 않습니다. 그 값은 graphite/ 의 토큰과 규칙이 갖습니다.
// ⚠ Base UI 와 상태 속성의 이름이 다른 위치(data-active ↔ data-selected · data-checked)는 여기와 report.css 에서 맞춥니다.
import { Input as InputPart } from "@ui-sdk/react/input";
import { Meter as MeterPart, MeterIndicator, MeterTrack } from "@ui-sdk/react/meter";
import { SegmentedControl, SegmentedControlItem } from "@ui-sdk/react/segmented-control";
import { Select as SelectPart, SelectContent as SelectContentPart, SelectItem as SelectItemPart, SelectTrigger as SelectTriggerPart, SelectValue } from "@ui-sdk/react/select";
import { Switch as SwitchPart, SwitchThumb } from "@ui-sdk/react/switch";
import { Tabs as TabsPart, TabsList as TabsListPart, TabsPanel, TabsTab } from "@ui-sdk/react/tabs";
import { Toggle as TogglePart, ToggleIcon } from "@ui-sdk/react/toggle";
import { ChevronsUpDown } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

const TRIGGER = "cn-tabs-trigger relative inline-flex items-center justify-center whitespace-nowrap text-foreground/60 transition-all outline-none hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0";

export function Tabs({ className, ...props }: ComponentProps<typeof TabsPart>)
{
    return <TabsPart className={cn("cn-tabs group/tabs flex flex-col", className)} {...props} />;
}

// 밑줄 탭입니다(tyohnn 의 variant="line").
export function TabsList({ className, ...props }: ComponentProps<typeof TabsListPart>)
{
    return <TabsListPart data-variant="line" className={cn("cn-tabs-list cn-tabs-list-variant-line group/tabs-list inline-flex w-fit items-center justify-center gap-1 bg-transparent text-muted-foreground", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsTab>)
{
    return (
        <TabsTab
            className={cn(
                TRIGGER, "h-[calc(100%-1px)] cursor-pointer bg-transparent data-[selected]:text-foreground dark:data-[selected]:text-foreground",
                "after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:bg-foreground after:opacity-0 after:transition-opacity data-[selected]:after:opacity-100",
                className,
            )}
            {...props}
        />
    );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPanel>)
{
    return <TabsPanel className={cn("cn-tabs-content flex-1 outline-none", className)} {...props} />;
}

// 몇 가지 가운데 하나를 고르는 줄입니다. 모양은 tyohnn 의 기본 탭 막대(회색 띠 위에 올라온 칸)를 읽습니다.
export function Segmented<T extends string>({ label, value, onChange, items }: { label: string; value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[] })
{
    return (
        <SegmentedControl aria-label={label} value={value} onValueChange={(v) => { if (v) onChange(v as T); }} className="cn-tabs-list cn-tabs-list-variant-default inline-flex h-(--tabs-list-height) w-fit items-center bg-muted text-muted-foreground">
            {items.map((it) => (
                <SegmentedControlItem
                    key={it.value} value={it.value}
                    className={cn(TRIGGER, "h-[calc(100%-1px)] cursor-pointer data-[checked]:bg-background data-[checked]:text-foreground dark:data-[checked]:border-input dark:data-[checked]:bg-input/30 dark:data-[checked]:text-foreground")}
                >
                    {it.label}
                </SegmentedControlItem>
            ))}
        </SegmentedControl>
    );
}

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPart>)
{
    return (
        <SwitchPart data-size="sm" className={cn("cn-switch peer group/switch relative inline-flex cursor-pointer items-center transition-all outline-none", className)} {...props}>
            <SwitchThumb className="cn-switch-thumb pointer-events-none block ring-0 transition-transform" />
        </SwitchPart>
    );
}

export function IconToggle({ className, children, ...props }: ComponentProps<typeof TogglePart>)
{
    return (
        <TogglePart className={cn("cn-toggle cn-toggle-variant-default cn-toggle-size-sm group/toggle inline-flex cursor-pointer items-center justify-center whitespace-nowrap outline-none hover:bg-muted focus-visible:ring-[3px] [&_svg]:pointer-events-none [&_svg]:shrink-0", className)} {...props}>
            <ToggleIcon>{children as ReactNode}</ToggleIcon>
        </TogglePart>
    );
}

export function Input({ className, ...props }: ComponentProps<typeof InputPart>)
{
    return <InputPart className={cn("cn-input w-full min-w-0 outline-none placeholder:text-muted-foreground", className)} {...props} />;
}

export function Select({ label, value, onChange, items, className }: { label: string; value: string; onChange: (v: string) => void; items: { value: string; label: string; node?: ReactNode }[]; className?: string })
{
    return (
        <SelectPart aria-label={label} value={value} onValueChange={(v) => { if (typeof v === "string") onChange(v); }} items={items.map(({ value: v, label: l }) => ({ value: v, label: l }))}>
            <SelectTriggerPart data-size="sm" className={cn("cn-select-trigger flex w-fit cursor-pointer items-center justify-between whitespace-nowrap outline-none [&_svg]:pointer-events-none [&_svg]:shrink-0", className)}>
                <SelectValue className="cn-select-value truncate" />
                <ChevronsUpDown className="cn-select-trigger-icon pointer-events-none" aria-hidden="true" />
            </SelectTriggerPart>
            <SelectContentPart align="end" sideOffset={4} className="cn-select-content cn-select-content-logical relative isolate z-50 max-h-80 min-w-(--anchor-width) overflow-x-hidden overflow-y-auto outline-none">
                {items.map((it) => (
                    <SelectItemPart key={it.value} value={it.value} className="cn-select-item relative flex w-full cursor-default items-center outline-hidden select-none data-[selected]:font-medium">
                        {it.node ?? it.label}
                    </SelectItemPart>
                ))}
            </SelectContentPart>
        </SelectPart>
    );
}

// 상한에 얼마나 찼는지 보이는 막대입니다. 85% 부터 경고색, 넘으면 위험색으로 바뀝니다.
export function Meter({ value, max, label = "상한까지 찬 정도", format, className }: { value: number; max: number; label?: string; format?: (v: number) => string; className?: string })
{
    const pct = Math.min(value / max, 1);
    const tone = value >= max ? "var(--destructive)" : pct >= 0.85 ? "var(--warning)" : "var(--foreground-subtle)";
    return (
        <MeterPart aria-label={label} value={value} max={max} format={format} className={cn("cn-progress-root block w-full", className)}>
            <MeterTrack className="cn-progress-track relative flex w-full items-center overflow-x-hidden">
                <MeterIndicator className="cn-progress-indicator h-full" style={{ width: "max(var(--meter-value), 2%)", backgroundColor: tone, borderRadius: "inherit" }} />
            </MeterTrack>
        </MeterPart>
    );
}

export type Tone = "blue" | "purple" | "green" | "orange" | "red" | "yellow" | "gray";

// 색조가 있는 태그입니다(graphite/DESIGN.md 「Tags」). 색조는 갈래를 나타내고 상태를 나타내지 않습니다.
export function Tag({ tone = "gray", className, ...props }: ComponentProps<"span"> & { tone?: Tone })
{
    return <span data-slot="badge" data-tone={tone} className={cn("cn-badge cn-badge-variant-outline group/badge inline-flex w-fit shrink-0 items-center justify-center overflow-hidden whitespace-nowrap", className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">)
{
    return <div data-slot="card" className={cn("cn-card group/card flex flex-col", className)} {...props} />;
}

export function Button({ variant = "outline", size = "xs", className, ...props }: ComponentProps<"button"> & { variant?: "outline" | "ghost"; size?: "xs" | "sm" | "icon-sm" })
{
    return <button type="button" data-slot="button" className={cn(`cn-button cn-button-variant-${variant} cn-button-size-${size}`, "group/button inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0", className)} {...props} />;
}

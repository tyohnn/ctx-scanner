import type { CSSProperties, ReactNode } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

// 캔버스 컨셉의 부품입니다. 화면 셋(세션 · 구조 · 영역)이 함께 씁니다. 색과 치수는 canvas/theme.css 의 슬롯을 읽습니다.

export type ChipTone = "blue" | "green" | "purple" | "orange" | "red" | "yellow" | "gray";

export function Chip({ tone = "gray", children, className }: { tone?: ChipTone; children: ReactNode; className?: string })
{
    return (
        <span
            className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium", className)}
            style={{ background: `var(--tag-${tone}-bg)`, color: `var(--tag-${tone}-fg)` }}
        >
            {children}
        </span>
    );
}

// 화면 하나의 바깥 틀입니다. 왼쪽에 그래프와 표를 담은 패널, 오른쪽에 상세 패널을 둡니다. 좁은 화면에서는 상세 패널이 아래로 내려갑니다.
export function CanvasPage({ main, side }: { main: ReactNode; side?: ReactNode })
{
    return (
        <div className="h-full overflow-auto p-4" style={{ background: "var(--canvas)" }}>
            <div className="mx-auto flex max-w-[1440px] flex-wrap items-start gap-4">
                <Panel className="min-w-0 flex-[999_1_620px] overflow-hidden">{main}</Panel>
                {side && <Panel className="max-w-full flex-[1_1_340px] p-4">{side}</Panel>}
            </div>
        </div>
    );
}

export function Panel({ className, children }: { className?: string; children: ReactNode })
{
    return <div className={cn("border bg-card", className)} style={{ borderRadius: "var(--canvas-panel-radius)" }}>{children}</div>;
}

// 패널 머리의 위치 표시입니다. 「저장소 · 화면 / 고른 것」 모양입니다.
export function Crumb({ repo, view, children }: { repo: string; view: string; children?: ReactNode })
{
    return (
        <div className="flex min-w-0 items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5">
            <span className="font-semibold">{repo}</span>
            <span className="rounded-md px-1.5 py-px text-[11px] font-semibold text-muted-foreground" style={{ background: "var(--border)" }}>{view}</span>
            {children && <><span className="px-1 text-muted-foreground">/</span><span className="min-w-0 truncate font-medium">{children}</span></>}
        </div>
    );
}

export function PanelHead({ left, right }: { left: ReactNode; right?: ReactNode })
{
    return <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">{left}{right && <div className="flex flex-wrap items-center gap-1.5">{right}</div>}</div>;
}

export function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode })
{
    return (
        <button
            type="button" onClick={onClick} aria-pressed={on}
            className="min-h-8 rounded-full border px-3 text-[13px] transition-colors"
            style={on ? { borderColor: "var(--canvas-picked)", background: "var(--tag-blue-bg)", color: "var(--tag-blue-fg)" } : { background: "var(--canvas-card)" }}
        >
            {children}
        </button>
    );
}

export interface CardData
{
    key: string; title: string; meta: ReactNode[]; icon: ReactNode; tint: string;
    flag?: ReactNode; warn?: boolean; picked?: boolean; onClick?: () => void; titleAttr?: string;
}

// 그래프의 카드 하나입니다. 누를 수 있으면 버튼으로 그립니다.
export function NodeCard({ card, style, className }: { card: CardData; style?: CSSProperties; className?: string })
{
    const border = card.picked ? "2px solid var(--canvas-picked)" : card.warn ? "1px solid var(--tag-orange-border)" : "1px solid var(--canvas-card-border)";
    const body = (
        <>
            <span className="grid size-10 shrink-0 place-items-center rounded-[10px] border [&_svg]:size-[18px]" style={{ color: card.tint }}>{card.icon}</span>
            <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-[15px] font-semibold">{card.title}</span>
                <span className="mt-0.5 flex gap-2.5 truncate text-[13px] text-muted-foreground">{card.meta.map((m, i) => <span key={i} className="truncate">{m}</span>)}</span>
            </span>
            {/* 표시는 오른쪽 위에 띄웁니다. 줄 안에 두면 좁은 카드에서 제목과 숫자가 잘립니다. */}
            {card.flag && <span className="absolute top-2 right-2.5 [&>span]:py-0 [&>span]:text-[11px]">{card.flag}</span>}
        </>
    );
    const cls = cn("relative flex h-[88px] items-center gap-3 px-3.5", card.flag && "pt-3", className);
    const st: CSSProperties = { ...style, background: "var(--canvas-card)", border, borderRadius: "var(--canvas-card-radius)", boxShadow: "var(--canvas-card-shadow)" };
    return card.onClick
        ? <button type="button" onClick={card.onClick} title={card.titleAttr} className={cn(cls, "cursor-pointer text-left transition-shadow hover:shadow-md focus-visible:outline-2")} style={st}>{body}</button>
        : <div title={card.titleAttr} className={cls} style={st}>{body}</div>;
}

const CENTERS = [12.5, 37.5, 62.5, 87.5];

// 위에서 아래로 내려가는 나무 그래프입니다. 뿌리 카드 하나 아래에 줄마다 카드 넷까지 둡니다.
// 가운데 줄기가 각 줄의 가로선과 만나야 하므로, 가로선은 적어도 가운데(50%)까지 그립니다.
export function TreeGraph({ root, rows }: { root: CardData; rows: CardData[][] })
{
    const rowTop = (k: number) => 124 + k * 144;
    const height = rows.length ? rowTop(rows.length - 1) + 112 : 88;
    const wire = "var(--canvas-wire)";
    return (
        <div className="cx-board overflow-x-auto border-y">
            <div className="relative mx-4 my-6 min-w-[880px]" style={{ height }}>
                {rows.length > 0 && <div className="absolute w-0.5" style={{ left: "calc(50% - 1px)", top: 92, height: rowTop(rows.length - 1) - 92, background: wire }} />}
                {rows.map((row, k) =>
                {
                    const last = Math.max(CENTERS[Math.min(row.length, 4) - 1], 50);
                    return (
                        <div key={k}>
                            <div className="absolute h-0.5" style={{ left: "12.5%", width: `${last - 12.5}%`, top: rowTop(k), background: wire }} />
                            {row.slice(0, 4).map((c, i) => (
                                <div key={c.key}>
                                    <div className="absolute w-0.5" style={{ left: `calc(${CENTERS[i]}% - 1px)`, top: rowTop(k), height: 24, background: wire }} />
                                    <NodeCard card={c} className="absolute" style={{ left: `calc(${i * 25}% + 8px)`, top: rowTop(k) + 24, width: "calc(25% - 16px)" }} />
                                </div>
                            ))}
                        </div>
                    );
                })}
                <div className="absolute size-2 rounded-full border-2 bg-card" style={{ left: "calc(50% - 6px)", top: 86, borderColor: "var(--canvas-wire-node)" }} />
                <NodeCard card={root} className="absolute" style={{ left: "calc(50% - 230px)", top: 0, width: 460 }} />
            </div>
        </div>
    );
}

// 왼쪽에서 오른쪽으로 흐르는 그래프입니다. 열마다 카드를 세로로 쌓고, 앞 열의 카드 하나(from)에서 다음 열 전부로 잇습니다.
export function FlowColumns({ heads, columns }: { heads: string[]; columns: { cards: CardData[]; from?: number[] }[] })
{
    const STEP = 100, H = 80;
    const tallest = Math.max(1, ...columns.map((c) => c.cards.length));
    const height = (tallest - 1) * STEP + H;
    const tops = columns.map((c) => { const off = (tallest - c.cards.length) * STEP / 2; return c.cards.map((_, i) => off + i * STEP); });
    const x = (col: number) => col * 26;
    const wire = "var(--canvas-wire)";
    const lines: CSSProperties[] = [];
    for (let col = 1; col < columns.length; col++)
    {
        const from = columns[col].from ?? tops[col - 1].map((_, i) => i);
        if (!tops[col].length || !from.length) continue;
        const spine = x(col) - 2;
        const ys = [...from.map((i) => tops[col - 1][i] + H / 2), ...tops[col].map((t) => t + H / 2)];
        const y1 = Math.min(...ys), y2 = Math.max(...ys);
        lines.push({ left: `calc(${spine}% - 1px)`, top: y1 - 1, width: 2, height: y2 - y1 + 2 });
        for (const i of from) lines.push({ left: `${x(col - 1) + 22}%`, width: `${spine - x(col - 1) - 22}%`, top: tops[col - 1][i] + H / 2 - 1, height: 2 });
        for (const t of tops[col]) lines.push({ left: `${spine}%`, width: "2%", top: t + H / 2 - 1, height: 2 });
    }
    return (
        <div className="cx-board overflow-x-auto border-y">
            <div className="mx-4 mt-4 grid min-w-[900px] grid-cols-4 text-xs text-muted-foreground">
                {heads.map((h) => <span key={h}>{h}</span>)}
            </div>
            <div className="relative mx-4 mt-3 mb-6 min-w-[900px]" style={{ height }}>
                {lines.map((l, i) => <div key={i} className="absolute" style={{ ...l, background: wire }} />)}
                {columns.map((c, col) => c.cards.map((card, i) => (
                    <NodeCard key={card.key} card={card} className="absolute !h-20" style={{ left: `${x(col)}%`, top: tops[col][i], width: "22%" }} />
                )))}
            </div>
        </div>
    );
}

export function Stats({ items }: { items: { label: string; value: ReactNode }[] })
{
    return (
        <div className="grid grid-cols-2 overflow-hidden rounded-xl border">
            {items.map((s, i) => (
                <div key={s.label} className={cn("px-4 py-3.5", i % 2 === 0 && "border-r", i < items.length - 2 && "border-b")}>
                    <div className="text-[11px] tracking-wide text-muted-foreground">{s.label}</div>
                    <div className="mt-1 tabular-nums text-[22px] font-semibold">{s.value}</div>
                </div>
            ))}
        </div>
    );
}

export function SideHead({ icon, tint, title, sub, onClose }: { icon: ReactNode; tint: string; title: string; sub: ReactNode; onClose?: () => void })
{
    return (
        <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl border [&_svg]:size-5" style={{ color: tint }}>{icon}</span>
            <div className="min-w-0 flex-1">
                <div className="truncate text-[17px] font-semibold">{title}</div>
                <div className="truncate text-[13px] text-muted-foreground">{sub}</div>
            </div>
            {onClose && <button type="button" aria-label="닫기" onClick={onClose} className="grid size-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted"><X className="size-[18px]" /></button>}
        </div>
    );
}

export function Note({ children }: { children: ReactNode })
{
    return <div className="rounded-xl px-3.5 py-3 text-[13px] leading-relaxed" style={{ background: "var(--warning-soft)", color: "var(--foreground)" }}>{children}</div>;
}

export function SideLabel({ children, right }: { children: ReactNode; right?: ReactNode })
{
    return <div className="mt-5 mb-1.5 flex justify-between text-xs tracking-wide text-muted-foreground"><span>{children}</span>{right && <span>{right}</span>}</div>;
}

// 아래 표의 머리 줄입니다. 왼쪽에 탭처럼 생긴 버튼, 오른쪽에 숫자 몇 개를 둡니다.
export function TableBar({ left, right }: { left: ReactNode; right?: ReactNode })
{
    return <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">{left}<div className="flex flex-wrap gap-4 text-[13px] text-muted-foreground">{right}</div></div>;
}

export function BarTab({ on, onClick, children }: { on: boolean; onClick?: () => void; children: ReactNode })
{
    return <button type="button" onClick={onClick} aria-pressed={on} className={cn("flex min-h-10 items-center gap-1.5 rounded-lg px-3", on ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted")}>{children}</button>;
}

export const th = "border-b px-2 py-2.5 text-left text-xs font-medium text-muted-foreground first:pl-4 last:pr-4";
export const td = "border-b border-border/60 px-2 py-2.5 first:pl-4 last:pr-4";

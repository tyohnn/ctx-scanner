// 플로우 자료(map.flows)를 흐름 그래프 · 회로도 · 영역 지도가 읽는 모양으로 바꿉니다. 화면 없이 계산만 합니다.
import type { ContextMap, Flow, Suggestion } from "@/data";

// 흐름 그래프의 마디 종류입니다. 색은 report.css 의 --flow-* 를 읽습니다.
export type FlowNodeType = "area" | "folder" | "layer" | "domain" | "common" | "etc" | "skill" | "gap";
// 선의 종류입니다. 회로도 기호와 같은 뜻입니다: 자동 로드는 실선, 지시는 굵은 점선, 색인은 가는 점선, 끊김은 붉은 선.
export type LinkKind = "auto" | "cmd" | "idx" | "open";

export const TYPE_COLOR: Record<FlowNodeType, string> = {
    area: "var(--flow-area)", folder: "var(--flow-folder)", layer: "var(--flow-layer)", domain: "var(--flow-domain)",
    common: "var(--flow-area)", etc: "var(--flow-area)", skill: "var(--flow-skill)", gap: "var(--flow-gap)",
};
export const TYPE_NAME: Record<FlowNodeType, string> = {
    area: "개발 영역", folder: "폴더 CLAUDE.md", layer: "계층 규칙", domain: "도메인 용어 규칙", common: "공통 규칙", etc: "지시문 묶음", skill: "스킬", gap: "끊긴 곳",
};
export const KIND_NAME: Record<LinkKind, string> = { auto: "자동 로드", cmd: "지시로 엶", idx: "색인이 알려 줌", open: "끊김" };

// 화면에 적을 짧은 이름입니다. 경로의 앞뒤를 떼고 종류를 뒤에 붙입니다.
export function shortName(id: string)
{
    if (id.startsWith(".claude/rules/glossary/")) return id.slice(23, -3) + " 용어";
    if (id.startsWith(".claude/rules/")) return id.slice(14, -3) + " 규칙";
    if (id.startsWith(".claude/skills/")) return id.split("/")[2];
    if (id.startsWith(".claude/agents/")) return id.split("/")[2].replace(/\.md$/, "") + " (서브에이전트)";
    if (id === "CLAUDE.md") return "루트 CLAUDE.md";
    if (id.endsWith("CLAUDE.md")) return id.replace(/\/CLAUDE\.md$/, "").replace(/^(apps|packages)\//, "") + " CLAUDE.md";
    return id;
}
export const scopeName = (s: string) => s.replace(/^(apps|packages)\//, "");

// 칸 하나의 파일을 열 때 항상 로드 위에 더해지는 양입니다.
export const cellChars = (f: Flow) => f.chars.folder + f.chars.layer + f.chars.common + f.chars.domain;

// 지시문 → 스킬을 가리키는 연결입니다. 한 스킬을 여러 지시문이 가리키면 모두 남깁니다.
// 규칙이나 스킬이 가리키면 「엽니다」 지시(굵은 점선), CLAUDE.md 가 가리키면 색인의 안내(가는 점선)로 봅니다.
export function pointerIndex(map: ContextMap)
{
    const into = new Map<string, Set<string>>();
    for (const e of map.edges)
    {
        if (e.kind !== "soft" || !(e.to.includes("/skills/") || e.to.includes("/agents/"))) continue;
        if (!into.has(e.to)) into.set(e.to, new Set());
        into.get(e.to)!.add(e.from);
    }
    const vias = (skill: string, present: string[], fallback: string) =>
    {
        const set = into.get(skill);
        const found = present.filter((p) => set?.has(p));
        return found.length ? found : [fallback];
    };
    return { vias };
}
export const ptrKind = (via: string): LinkKind => via.startsWith(".claude/rules/") || via.startsWith(".claude/skills/") || via.startsWith(".claude/agents/") ? "cmd" : "idx";

// 같은 내용이 두 곳에 있는 겹침(SHORT)입니다. 「그대로 둠 · 거짓 신호」로 판정한 것은 뺍니다.
export function shortsOf(map: ContextMap)
{
    const list: { targets: string[]; name: string; s: Suggestion }[] = [];
    for (const s of map.suggestions)
    {
        if (!/^(dup|rule-overlap|term-dup):/.test(s.id) || (s.targets?.length ?? 0) < 2) continue;
        if (s.verdict === "keep" || s.verdict === "false-positive") continue;
        list.push({ targets: s.targets!, name: s.id.startsWith("dup:") ? s.id.split(":")[1] : s.title, s });
    }
    return list;
}

export interface FlowFilter { area: string | null; scope: string | null; common: boolean }
export interface GNode { id: string; label: string; type: FlowNodeType; col: number; ref?: string }
export interface GLink { source: string; target: string; value: number; kind: LinkKind }

// 흐름 그래프: ① 영역 → ② 자동으로 로드되는 지시문(과 끊긴 곳) → ③ 지시문이 가리키는 스킬 → ④ 그 스킬이 가리키는 스킬.
// 굵기는 그 연결을 지나는 파일 수입니다. 한 파일이 지시문 여럿을 로드하므로 ① 의 막대는 파일 수보다 깁니다.
export function buildGraph(map: ContextMap, filter: FlowFilter)
{
    const areaLabel = new Map((map.meta.areas ?? []).map((a) => [a.id, a.label]));
    const { vias } = pointerIndex(map);
    const flows = (map.flows ?? []).filter((f) => (!filter.area || f.area === filter.area) && (!filter.scope || f.scope === filter.scope));
    // 전체를 볼 때는 지시문을 굵은 순서로 12개까지 두고 나머지는 하나로 묶습니다.
    const weight = new Map<string, number>();
    for (const f of flows) for (const x of [...f.folder, ...f.layer, ...f.domain]) weight.set(x, (weight.get(x) ?? 0) + f.files);
    const keep = new Set([...weight.entries()].sort((a, b) => b[1] - a[1]).slice(0, filter.area ? 99 : 12).map((e) => e[0]));
    const etc = weight.size - keep.size;
    const nodes = new Map<string, GNode>();
    const links = new Map<string, GLink>();
    const areaFiles = new Map<string, number>();
    const node = (id: string, label: string, type: FlowNodeType, col: number, ref?: string) => { if (!nodes.has(id)) nodes.set(id, { id, label, type, col, ref }); return id; };
    const link = (source: string, target: string, value: number, kind: LinkKind = "auto") =>
    {
        const k = `${source}\u0000${target}\u0000${kind}`;
        const l = links.get(k);
        if (l) l.value += value; else links.set(k, { source, target, value, kind });
    };
    for (const f of flows)
    {
        areaFiles.set(f.area, (areaFiles.get(f.area) ?? 0) + f.files);
        const a = node(`a:${f.area}`, areaLabel.get(f.area) ?? f.areaLabel ?? f.area, "area", 0, f.area);
        const inst = new Map<string, string>();
        for (const [list, type] of [[f.folder, "folder"], [f.layer, "layer"], [f.domain, "domain"]] as const)
            for (const x of list) inst.set(x, keep.has(x) ? node(`i:${x}`, shortName(x), type, 1, x) : node("i:__etc", `그 밖의 지시문 ${etc}개`, "etc", 1));
        if (filter.common) for (const x of f.common) inst.set(x, node("i:__common", "공통 규칙", "common", 1));
        for (const id of new Set(inst.values())) link(a, id, f.files);
        if (!f.layer.length) link(a, node("g:layer", "OPEN · 계층 규칙 없음", "gap", 1), f.files, "open");
        if (!f.domain.length) link(a, node("g:domain", "OPEN · 용어 규칙 없음", "gap", 1), f.files, "open");
        const reached = new Set<string>();
        for (const s of f.skills)
        {
            for (const via of vias(s.id, [...inst.keys()], s.via))
            {
                const src = inst.get(via);
                if (!src) continue;
                link(src, node(`s:${s.id}`, shortName(s.id), "skill", 2, s.id), f.files, ptrKind(via));
                reached.add(s.id);
            }
        }
        for (const s of f.next)
        {
            if (!reached.has(s.via)) continue;
            link(`s:${s.via}`, node(`n:${s.id}`, shortName(s.id), "skill", 3, s.id), f.files, "cmd");
        }
    }
    // 같은 열 안에서는 종류 → 굵기 순으로 두고, 끊긴 곳은 맨 아래에 둡니다.
    const order: Record<FlowNodeType, number> = { area: 0, folder: 1, layer: 2, domain: 3, common: 4, etc: 5, skill: 6, gap: 9 };
    const ls = [...links.values()];
    const total = new Map<string, number>();
    for (const l of ls) { total.set(l.source, (total.get(l.source) ?? 0) + l.value); total.set(l.target, (total.get(l.target) ?? 0) + l.value); }
    const ns = [...nodes.values()].sort((a, b) => a.col - b.col || order[a.type] - order[b.type] || (total.get(b.id) ?? 0) - (total.get(a.id) ?? 0));
    return { nodes: ns, links: ls, areaFiles };
}

// 회로도 하나(영역 × 위치 칸)의 연결 목록입니다.
export interface Gate { id?: string; type: "folder" | "layer" | "domain" | "common"; kind: string; open?: boolean; chars: number; cond?: string; short?: string }
export interface Circuit { flow: Flow; gates: Gate[]; skills: string[]; next: { id: string; via: string }[]; pointers: { from: string; to: string; kind: LinkKind }[] }

const globRe = (g: string) => new RegExp("^" + g
    .replace(/[.+^$()|[\]\\]/g, "\\$&")
    .replace(/\{([^}]*)\}/g, (_, x: string) => "(" + x.split(",").join("|") + ")")
    .replace(/\*\*/g, "\u0001").replace(/\*/g, "[^/]*").replace(/\u0001/g, ".*"));
// 지시문의 경로 조건 가운데 이 위치에 맞는 것을 고릅니다.
function condFor(globs: string[], scope: string)
{
    return globs.find((g) => { try { return globRe(g).test(`${scope}/src/x.ts`) || globRe(g).test(`${scope}/x.ts`); } catch { return false; } }) ?? globs[0];
}

export function buildCircuit(map: ContextMap, flow: Flow): Circuit
{
    const byId = new Map(map.nodes.map((x) => [x.id, x]));
    const { vias } = pointerIndex(map);
    const shorts = shortsOf(map);
    const gate = (id: string, type: Gate["type"], kind: string): Gate =>
    {
        const node = byId.get(id);
        const globs = node?.globs?.map((g) => g.glob) ?? (node?.dir ? [`${node.dir}**`] : []);
        const sh = shorts.find((s) => s.targets.includes(id));
        return { id, type, kind, chars: node?.chars ?? 0, cond: condFor(globs, flow.scope), short: sh ? `「${sh.name}」가 ${sh.targets.filter((t) => t !== id).map(shortName).join(" · ")}에도` : undefined };
    };
    const gates: Gate[] = [];
    for (const x of flow.folder) gates.push(gate(x, "folder", "폴더 CLAUDE.md"));
    if (flow.layer.length) for (const x of flow.layer) gates.push(gate(x, "layer", "계층 규칙"));
    else gates.push({ type: "layer", kind: "계층 규칙", open: true, chars: 0 });
    if (flow.domain.length) for (const x of flow.domain) gates.push(gate(x, "domain", "도메인 용어 규칙"));
    else gates.push({ type: "domain", kind: "도메인 용어 규칙", open: true, chars: 0 });
    for (const x of flow.common) gates.push(gate(x, "common", "공통 규칙"));
    const present = gates.filter((g) => g.id).map((g) => g.id!);
    const skills = [...new Set(flow.skills.map((s) => s.id))];
    const pointers: Circuit["pointers"] = [];
    for (const s of skills)
    {
        const via0 = flow.skills.find((x) => x.id === s)!.via;
        for (const via of vias(s, present, via0)) if (present.includes(via)) pointers.push({ from: via, to: s, kind: ptrKind(via) });
    }
    const next = flow.next.filter((x) => skills.includes(x.via)).map((x) => ({ id: x.id, via: x.via }));
    return { flow, gates, skills, next, pointers };
}

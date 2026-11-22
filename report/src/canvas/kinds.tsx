import { BookA, Bot, FileText, Folder, Puzzle, ScrollText, Webhook } from "lucide-react";
import type { ReactNode } from "react";

import type { ContextMap, MapNode } from "@/data";

// 지시문 종류마다 카드에 그릴 아이콘과 색입니다. 색은 canvas/theme.css 의 --kind-* 슬롯입니다.
export type CanvasKind = "root" | "folder" | "rule" | "common" | "term" | "skill" | "agent" | "hook";

const ICON: Record<CanvasKind, ReactNode> = {
    root: <FileText />, folder: <Folder />, rule: <ScrollText />, common: <ScrollText />, term: <BookA />,
    skill: <Puzzle />, agent: <Bot />, hook: <Webhook />,
};

export const kindIcon = (k: CanvasKind) => ICON[k];
export const kindTint = (k: CanvasKind) => `var(--kind-${k})`;

// 맵의 노드 하나가 어느 종류로 그려지는지 정합니다. 경로 규칙은 역할(공통 · 용어)에 따라 색을 나눕니다.
export function canvasKind(node: Pick<MapNode, "kind" | "source" | "role"> | undefined): CanvasKind
{
    if (!node) return "rule";
    if (node.kind === "root" || node.source === "root") return "root";
    if (node.kind === "nested" || node.source === "folder") return "folder";
    if (node.kind === "skill") return "skill";
    if (node.kind === "agent") return "agent";
    if (node.kind === "hook") return "hook";
    if (node.role === "common") return "common";
    if (node.role === "domain") return "term";
    return "rule";
}

// 경로로 노드를 찾습니다. 노드 id 는 대개 경로와 같지만, 다를 때를 위해 path 도 봅니다.
export function nodeIndex(map: ContextMap)
{
    const byPath = new Map<string, MapNode>();
    for (const x of map.nodes) { byPath.set(x.path, x); byPath.set(x.id, x); }
    return byPath;
}

// 스킬 경로(.claude/skills/<이름>/SKILL.md)에서 이름만 꺼냅니다.
export const skillName = (p: string) => p.match(/([^/]+)\/SKILL\.md$/)?.[1] ?? p.split("/").pop() ?? p;

import { n } from "@/data";
import { shortName, type Circuit } from "@/lib/flowgraph";

interface Props { circuit: Circuit; alwaysChars: number; onSelect: (id: string | null) => void }

// 칸 하나(영역 × 위치)의 연결 목록을 회로도 기호로 그립니다. 기호는 이렇습니다.
// 맨 위 전원선(VCC)은 항상 로드되는 내용, 실선은 경로로 자동 로드되는 지시문, 굵은 점선은 규칙의 「엽니다」 지시, 가는 점선은 CLAUDE.md 색인의 안내,
// OPEN 은 있어야 할 지시문이 없는 자리, SHORT 는 같은 내용이 다른 곳에도 있는 자리입니다. 점이 없는 교차는 이어지지 않은 것입니다.
// 오른쪽의 검사 라인은 context-scanner 가 아직 재지 않으므로 점선 상자로만 둡니다.
export function CircuitDiagram({ circuit, alwaysChars, onSelect }: Props)
{
    const { flow, gates, skills, next, pointers } = circuit;
    const W = 1200, G0 = 112, GH = 52, gx = 190, gw = 230, chipX = 910;
    const gy = (i: number) => G0 + i * GH;
    const gBottom = gy(gates.length) - 12;
    const S0 = gBottom + 56, SH = 54, sx = 480, sw = 200, nx = 730, nw = 160, NH = 40;
    const sy = (i: number) => S0 + i * SH;
    const nextIds = [...new Set(next.map((x) => x.id))];
    const ny = (i: number) => S0 + i * NH;
    const H = Math.max(sy(skills.length), ny(nextIds.length), gBottom + 60) + 30;
    const inY = (G0 + gBottom) / 2;
    // 포인터마다 세로선의 x 를 따로 줘서 겹치지 않게 합니다.
    const px = new Map<string, number>();
    gates.forEach((g) => { if (g.id && pointers.some((p) => p.from === g.id)) px.set(g.id, gx + gw + 18 + px.size * 12); });
    const sIdx = new Map(skills.map((s, i) => [s, i]));
    const nIdx = new Map(nextIds.map((s, i) => [s, i]));
    // 예시 경로는 / 에서 끊어 IN 아래 좁은 칸에 줄을 나눠 적습니다.
    const exLines: string[] = [];
    for (const part of (flow.example || flow.scope).split("/"))
    {
        const last = exLines.length - 1;
        if (last >= 0 && (exLines[last] + part).length <= 21) exLines[last] += part + "/";
        else exLines.push(part + "/");
    }
    exLines[exLines.length - 1] = exLines.at(-1)!.replace(/\/$/, "");
    const cut = (t: string, max: number) => t.length > max ? t.slice(0, max - 1) + "…" : t;
    const oy = (G0 - 22 + H - 30) / 2;
    const chipH = H - 30 - (G0 - 22);

    return (
        <div className="space-y-3">
            <div className="overflow-x-auto rounded border bg-background">
                <svg viewBox={`0 0 ${W} ${H}`} className="cx-circuit block w-full min-w-[1000px]" role="img" aria-label={`${flow.areaLabel} · ${flow.scope} 회로도`}>
                    <defs>
                        <marker id="cx-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" className="fill-wire" /></marker>
                        <pattern id="cx-dots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" className="fill-grid" /></pattern>
                    </defs>
                    <rect width={W} height={H} fill="url(#cx-dots)" />
                    <path d={`M120,40 L${chipX + 25},40 L${chipX + 25},${G0 - 22}`} className="w-rail" />
                    <text x={120} y={28} className="t-rail">VCC · 항상 로드 · 루트 CLAUDE.md와 스킬 설명 {n(alwaysChars)}자 · 어느 파일을 고치든 실림</text>
                    <text x={gx} y={96} className="t-col">자동 로드 (폴더 · paths:)</text>

                    <rect x={20} y={inY - 16} width={100} height={32} rx={4} className="b-io" />
                    <text x={70} y={inY + 5} textAnchor="middle" className="t-io">IN</text>
                    {exLines.map((l, i) => <text key={i} x={20} y={inY + 36 + i * 15} className="t-sub">{cut(l, 22)}</text>)}
                    <text x={20} y={inY + 36 + exLines.length * 15} className="t-sub">같은 회로의 파일 {n(flow.files)}개</text>
                    <path d={`M120,${inY} L150,${inY}`} className="w-auto" /><circle cx={150} cy={inY} r={4} className="fill-wire" />
                    <path d={`M150,${gy(0) + 20} L150,${gy(gates.length - 1) + 20}`} className="w-auto" />

                    {gates.map((g, i) =>
                    {
                        const y = gy(i), cy = y + 20;
                        if (g.open)
                        {
                            return (
                                <g key={`open-${g.type}`}>
                                    <path d={`M150,${cy} L${gx + 40},${cy}`} className="w-open" />
                                    <text x={gx + 46} y={cy + 5} className="t-open">✕</text>
                                    <text x={gx + 66} y={cy - 3} className="t-open">OPEN · {g.kind} 없음</text>
                                    <text x={gx + 66} y={cy + 13} className="t-sub">이 칸의 파일을 열어도 이 축의 지시문이 로드되지 않습니다</text>
                                </g>
                            );
                        }
                        const label = cut(`${g.kind} · ${n(g.chars)}자${g.cond ? ` · ${g.cond}` : ""}`, 34);
                        return (
                            <g key={g.id} className="cursor-pointer" onClick={() => onSelect(g.id!)}>
                                <path d={`M150,${cy} L${gx},${cy}`} className="w-auto" />
                                <rect x={gx} y={y} width={gw} height={40} rx={6} className={g.type === "common" ? "b-gate common" : "b-gate"} />
                                <text x={gx + 12} y={y + 15} className="t-small">{label}</text>
                                <text x={gx + 12} y={y + 32} className="t-main">{cut(shortName(g.id!), 28)}</text>
                                <path d={`M${gx + gw},${cy} L${chipX},${cy}`} className="w-auto" />
                                <circle cx={chipX - 4} cy={cy} r={3} className="fill-wire" />
                                {g.short && (
                                    <g>
                                        <polyline points={[[0, -4], [7, -12], [13, 2], [20, -10], [27, 4]].map(([a, b]) => `${gx + gw + 64 + a},${cy + b}`).join(" ")} className="w-short" />
                                        <text x={gx + gw + 98} y={cy - 8} className="t-short">{cut(`SHORT · ${g.short}`, 46)}</text>
                                    </g>
                                )}
                            </g>
                        );
                    })}

                    {skills.length > 0 && <text x={sx} y={S0 - 18} className="t-col">가리켜서 여는 스킬</text>}
                    {nextIds.length > 0 && <text x={nx} y={S0 - 18} className="t-col">스킬이 가리키는 스킬</text>}
                    {pointers.map((p, i) =>
                    {
                        const gi = gates.findIndex((g) => g.id === p.from);
                        const x = px.get(p.from)!, cy = gy(gi) + 20, ty = sy(sIdx.get(p.to)!) + 20 + (p.kind === "idx" ? 8 : -6);
                        return (
                            <g key={i}>
                                <circle cx={x} cy={cy} r={3.5} className="fill-wire" />
                                <path d={`M${x},${cy} L${x},${ty} L${sx - 2},${ty}`} className={p.kind === "idx" ? "w-idx" : "w-cmd"} markerEnd="url(#cx-arr)" />
                            </g>
                        );
                    })}
                    {skills.map((s, i) => (
                        <g key={s} className="cursor-pointer" onClick={() => onSelect(s)}>
                            <rect x={sx} y={sy(i)} width={sw} height={40} rx={6} className="b-skill" />
                            <text x={sx + 12} y={sy(i) + 15} className="t-small">스킬 · 열릴 때만</text>
                            <text x={sx + 12} y={sy(i) + 32} className="t-main">{cut(shortName(s), 24)}</text>
                        </g>
                    ))}
                    {next.map((x, i) =>
                    {
                        if (!sIdx.has(x.via) || !nIdx.has(x.id)) return null;
                        const y1 = sy(sIdx.get(x.via)!) + 20, y2 = ny(nIdx.get(x.id)!) + 15;
                        return <path key={i} d={`M${sx + sw},${y1} C${sx + sw + 25},${y1} ${nx - 25},${y2} ${nx - 2},${y2}`} className="w-cmd" markerEnd="url(#cx-arr)" />;
                    })}
                    {nextIds.map((x, i) => (
                        <g key={x} className="cursor-pointer" onClick={() => onSelect(x)}>
                            <rect x={nx} y={ny(i)} width={nw} height={30} rx={6} className="b-skill" />
                            <text x={nx + 10} y={ny(i) + 19} className="t-main sm">{cut(shortName(x), 22)}</text>
                        </g>
                    ))}
                    {!skills.length && <text x={sx} y={S0 + 10} className="t-sub">이 칸에서 가리키는 스킬이 없습니다</text>}

                    <rect x={chipX} y={G0 - 22} width={50} height={chipH} rx={6} className="b-chip" />
                    {/* 칩이 짧으면(지시문이 적은 칸) 설명을 빼고 이름만 둡니다. 세로 글자가 칩 밖으로 넘치지 않게 합니다. */}
                    <text x={chipX + 25} y={oy} textAnchor="middle" transform={`rotate(-90 ${chipX + 25} ${oy})`} className="t-chip">{chipH >= 250 ? "AGENT · 점선 상자는 열리면 실림" : "AGENT"}</text>
                    <path d={`M${chipX + 50},${oy} L1000,${oy}`} className="w-auto" />
                    <rect x={1000} y={oy - 18} width={70} height={36} rx={4} className="b-io" />
                    <text x={1035} y={oy + 5} textAnchor="middle" className="t-io">OUT</text>
                    <text x={1000} y={oy + 36} className="t-sub">만든 코드</text>
                    <path d={`M1035,${oy - 18} L1035,${oy - 52}`} className="w-auto" markerEnd="url(#cx-arr)" />
                    <rect x={990} y={oy - 112} width={190} height={58} rx={6} className="b-todo" />
                    <text x={1002} y={oy - 92} className="t-small">검사 라인</text>
                    <text x={1002} y={oy - 74} className="t-main sm">typecheck → test → pr:check</text>
                    <text x={1002} y={oy - 60} className="t-sub">context-scanner 는 아직 재지 않음</text>
                </svg>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] text-muted-foreground">
                {[["w-rail", "상시 전원 · 항상 로드"], ["w-auto", "실선 · 경로로 자동 로드"], ["w-cmd", "굵은 점선 · 규칙이 「엽니다」라고 지시"], ["w-idx", "가는 점선 · CLAUDE.md 색인이 알려 줌"]].map(([c, t]) => (
                    <span key={c} className="inline-flex items-center gap-1.5"><svg width="40" height="12" className="cx-circuit" aria-hidden><line x1="2" y1="6" x2="38" y2="6" className={c} /></svg>{t}</span>
                ))}
                <span className="inline-flex items-center gap-1.5"><svg width="40" height="12" className="cx-circuit" aria-hidden><line x1="2" y1="6" x2="22" y2="6" className="w-open" /><text x="26" y="10" className="t-open">✕</text></svg>OPEN · 있어야 할 지시문이 없음</span>
                <span className="inline-flex items-center gap-1.5"><svg width="40" height="12" className="cx-circuit" aria-hidden><polyline points="3,10 11,3 18,11 26,3 33,11" className="w-short" /></svg>SHORT · 같은 내용이 다른 곳에도</span>
                <span>점이 없는 교차는 이어지지 않은 것</span>
            </div>
            <details className="text-xs">
                <summary className="cursor-pointer py-1 text-foreground">연결 목록 (넷리스트)</summary>
                <div className="overflow-x-auto">
                    <table className="mt-1 w-full border-collapse text-left">
                        <thead className="text-[11px] text-muted-foreground"><tr>{["신호", "종류", "켜는 조건", "가리키는 곳", "상태"].map((h) => <th key={h} className="border-b py-1.5 pr-3 font-medium">{h}</th>)}</tr></thead>
                        <tbody>
                            {gates.map((g) => (
                                <tr key={g.id ?? `open-${g.type}`} className="align-top">
                                    <td className="num border-b py-1.5 pr-3">{g.id ?? "—"}</td>
                                    <td className="border-b py-1.5 pr-3">{g.kind}</td>
                                    <td className="num border-b py-1.5 pr-3">{g.cond ?? "—"}</td>
                                    <td className="border-b py-1.5 pr-3">{g.open ? "—" : pointers.filter((p) => p.from === g.id).map((p) => `${shortName(p.to)} (${p.kind === "cmd" ? "지시" : "색인"})`).join(" · ") || "없음"}</td>
                                    <td className="border-b py-1.5 pr-3">{g.open ? <span className="text-destructive">OPEN · 없음</span> : g.short ? <span className="cx-short-text">SHORT · {g.short}</span> : "연결"}</td>
                                </tr>
                            ))}
                            {skills.map((s) => (
                                <tr key={s} className="align-top">
                                    <td className="num border-b py-1.5 pr-3">{shortName(s)}</td>
                                    <td className="border-b py-1.5 pr-3">스킬</td>
                                    <td className="border-b py-1.5 pr-3">{pointers.filter((p) => p.to === s).map((p) => `${shortName(p.from)}(${p.kind === "cmd" ? "지시" : "색인"})`).join(" · ")}가 가리킬 때</td>
                                    <td className="border-b py-1.5 pr-3">{next.filter((x) => x.via === s).map((x) => shortName(x.id)).join(" · ") || "없음"}</td>
                                    <td className="border-b py-1.5 pr-3">연결 (열릴 때만)</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </details>
        </div>
    );
}

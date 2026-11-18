---
name: report
description: context-scanner 의 맵 · 기록 · 시나리오 · 제안을 HTML 보고서 한 장으로 조립한다. "컨텍스트 보고서 만들어 줘", "context-scanner 보고서", "보고서 다시 뽑아 줘" 가 트리거이고, map · trace · test · advise 스킬이 마지막 단계에서 이 스킬을 호출한다.
---

# 보고서 조립

context-scanner 의 산출물은 모두 HTML 문서입니다. 화면은 템플릿(`templates/report.html`)에 이미 들어 있고, 이 스킬은 자료만 채웁니다. 화면을 새로 그리지 않습니다.

## 차례

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/build-report.mjs" --root . --out <보고서를 둘 경로>
```

- 자료 폴더에서 `map.json` · `traces/` · `tests.json` · `advice.json` 을 찾아 있는 것만 넣습니다. 마지막 줄이 「응답 끝」이 아닌 기록(지금 보고서를 만드는 세션)은 뺍니다. 넣으려면 `--include-open` 을 줍니다. 맵만 있으면 「요약」 · 「할 일」 · 「플로우」 · 「영역 지도」 · 「파일」 · 「맵」 화면이, 「타임라인」과 「시나리오」 탭은 늘 보이고, 기록이나 시나리오 결과가 없으면 그 탭에 왜 비었는지를 적습니다.
- 지난 측정과 견주려면 `--baseline <지난 자료 폴더> --baseline-label <이름>` 을 줍니다. 요약 화면의 첫 문장이 항상 로드되는 양을 그 측정과 비교합니다(「버전 1의 41% 수준인 7,904자로 줄었습니다」).
- `--out` 을 주지 않으면 자료 폴더의 `report.html` 에 씁니다. 사용자에게 건넬 때는 사용자가 열 수 있는 위치를 줍니다.
- 파일 하나에 화면과 자료가 모두 들어 있어서 그대로 열거나 건넬 수 있습니다. 서버가 필요 없습니다.

## 자료를 저장하는 위치

자료는 저장소 밖에 둡니다. `CONTEXT_SCANNER_DIR` 를 주면 그곳이고, 아니면 플러그인의 자료 폴더 아래에 저장소마다 한 칸입니다. 스크립트가 모두 같은 규칙으로 찾으므로 손으로 경로를 맞출 일은 없습니다.

## 건넬 때

- 보고서 경로를 주고, 주소 끝의 `#tab=` 으로 먼저 볼 화면을 가리킬 수 있습니다(`summary` · `todo` · `flow` · `areas` · `files` · `map` · `timeline` · `tests`). 아무것도 주지 않으면 요약이 열립니다. 노드를 고른 채로 열려면 `&node=<경로>` 를, 플로우에서 한 칸의 회로도를 열려면 `&area=<영역>&scope=<위치>` 를 붙입니다(`#tab=flow&area=screen&scope=apps/admin`).
- 화면은 읽는 사람의 물음 순서입니다. 요약(얼마나) → 할 일(무엇부터) → 플로우(무엇이 무엇을 부르나, 생키 그림과 회로도) → 영역 지도(어디가 무겁나) → 파일 · 맵 · 타임라인 · 시나리오(자세히). 회로도의 기호(VCC 레일 · 실선 · 굵은 점선 · 가는 점선 · OPEN · SHORT)는 화면 아래 범례에 있습니다.
- map · report · advise 를 이어서 돌렸으면 마지막 스킬이 끝난 뒤 한 번만 말합니다. 말로는 세 가지만 전합니다: 항상 로드되는 내용이 몇 자인지, 먼저 고칠 것이 무엇인지, 테스트해야 알 수 있는 것이 무엇인지.
- ⚠ 기록에는 파일 경로가 들어 있습니다. 저장소 밖의 사람에게 건네기 전에 사용자에게 묻습니다.

## 템플릿을 고칠 때

템플릿의 소스는 `report/` 에 있습니다(React · Tailwind · UI SDK `@ui-sdk/react` 의 Waterfall · Tabs · Select 들. 그래프만 React Flow. 모양은 `report/src/graphite/` 에 복사한 tyohnn graphite 의 토큰과 규칙). 고친 뒤 `cd report && npm install && npm run build` 로 `templates/report.html` 을 다시 만들어 함께 커밋합니다. 보고서는 어두운 화면으로 열리고, 주소 끝에 `theme=light` 를 붙이면 밝은 화면으로 열립니다. 색이나 크기를 바꾸려면 템플릿에 값을 적지 않고 `report/src/graphite/README.md` 를 따릅니다.

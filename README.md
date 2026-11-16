# ctxscope

클로드 코드가 일하는 동안 컨텍스트가 언제 무엇으로 채워지는지 재는 플러그인입니다. 브라우저의 개발자 도구가 요청과 응답을
보여 주듯이, 지시문(CLAUDE.md · 경로 규칙 · 스킬 · 서브에이전트 · 훅)이 실리는 길과 때를 보여 줍니다. 산출물은 모두 HTML
문서 한 장이고 명령줄 제품이 아닙니다. 일은 에이전트가 스킬을 따라 하고 스크립트는 그 스킬이 부릅니다.

## 스킬 다섯

| 스킬 | 맡은 일 | 부르는 스크립트 | 보고서에 생기는 화면 |
|---|---|---|---|
| `ctxscope:map` | 파일을 읽어 「무엇이 언제 실리는가」의 지도를 그린다 | `scan.mjs` | 지도 · 파일 · 제안 |
| `ctxscope:trace` | 실제 세션에서 실린 것을 때의 차례로 읽는다 | 훅의 `collect.mjs` | 기록 |
| `ctxscope:test` | 가설을 시나리오로 짜서 새 세션으로 여러 번 돌린다 | `run-scenario.mjs` | 시나리오 |
| `ctxscope:advise` | 늘 실리는 곳에서 뺄 것과 올릴 것을 판단한다 | `advice.json` 을 쓴다 | 제안 |
| `ctxscope:report` | 자료를 틀에 채워 HTML 한 장으로 낸다 | `build-report.mjs` | 전부 |

스킬은 자료를 만들고 `report` 가 화면에 싣습니다. 화면은 틀에 한 번 지어 두었으므로 에이전트가 HTML 을 새로 쓰지 않습니다.

## 폴더

```
.claude-plugin/plugin.json
hooks/hooks.json          수집 훅. 사건마다 collect.mjs 를 부른다
scripts/                  scan · collect · run-scenario · build-report 와 그 둘이 함께 쓰는 lib
skills/                   위의 다섯
templates/report.html     지어 둔 보고서 틀. 자료 칸 하나를 채우면 문서가 된다
report/                   틀의 소스(React · Tailwind · UI SDK `@ui-sdk/react` 의 Waterfall · Tabs · Select 들. 그래프만 React Flow. 모양은 `report/src/graphite/` 에 복사한 tyohnn graphite 의 토큰과 규칙)
```

## 수집기가 적는 것

이름 · 경로 · 크기 · 때만 적습니다. 파일의 내용과 도구의 입력 · 출력은 적지 않고, 프롬프트는 길이만 적습니다. 자료는 저장소
밖(플러그인의 자료 폴더, 또는 `CTXSCOPE_DIR`)에 놓입니다. 수집기는 실패해도 세션을 막지 않습니다.

## 써 보기

```
claude --plugin-dir plugins/ctxscope
```

세션에서 「컨텍스트 지도 그려 줘」라고 하면 `map` 과 `report` 가 돌아 보고서 경로를 줍니다.

## 틀 고치기

```
cd report && npm install && npm run build
```

`templates/report.html` 이 다시 만들어집니다. 소스와 함께 커밋합니다.

# ctxscope

클로드 코드가 일하는 동안 컨텍스트가 언제 무엇으로 채워지는지 측정하는 플러그인입니다. 브라우저의 개발자 도구가 요청과 응답을
보여 주듯이, 지시문(CLAUDE.md · 경로 규칙 · 스킬 · 서브에이전트 · 훅)이 로드되는 경로와 시점를 보여 줍니다. 산출물은 모두 HTML
문서 한 장이고 명령줄 제품이 아닙니다. 일은 에이전트가 스킬을 따라 하고 스크립트는 그 스킬이 호출합니다.

## 스킬 다섯

| 스킬 | 맡은 일 | 호출하는 스크립트 | 보고서에 생기는 화면 |
|---|---|---|---|
| `ctxscope:map` | 파일을 읽어 「무엇이 언제 로드되는가」의 맵을 만든다 | `scan.mjs` | 맵 · 파일 · 제안 |
| `ctxscope:trace` | 실제 세션에서 로드된 것을 시간 순서로 읽는다 | 훅의 `collect.mjs` | 타임라인 |
| `ctxscope:test` | 가설을 시나리오로 만들어 새 세션으로 여러 번 돌린다 | `run-scenario.mjs` | 시나리오 |
| `ctxscope:advise` | 항상 로드되는 곳에서 뺄 것과 수준을 높일 것을 판단한다 | `advice.json` 을 쓴다 | 제안 |
| `ctxscope:report` | 자료를 템플릿에 채워 HTML 한 장으로 낸다 | `build-report.mjs` | 전부 |

스킬은 자료를 만들고 `report` 가 화면에 넣습니다. 화면은 템플릿에 미리 빌드해 두었으므로 에이전트가 HTML 을 새로 쓰지 않습니다.

## 폴더

```
.claude-plugin/plugin.json
hooks/hooks.json          수집 훅. 이벤트마다 collect.mjs 를 호출한다
scripts/                  scan · collect · run-scenario · build-report 와 그 둘이 함께 쓰는 lib
skills/                   위의 다섯
templates/report.html     빌드해 둔 보고서 템플릿. 자료 칸 하나를 채우면 문서가 된다
report/                   템플릿의 소스(React · Tailwind · UI SDK `@ui-sdk/react` 의 Waterfall · Tabs · Select 들. 그래프만 React Flow. 모양은 `report/src/graphite/` 에 복사한 tyohnn graphite 의 토큰과 규칙)
```

## 수집기가 적는 것

이름 · 경로 · 크기 · 시각만 적습니다. 파일의 내용과 도구의 입력 · 출력은 적지 않고, 프롬프트는 길이만 적습니다. 자료는 저장소
밖(플러그인의 자료 폴더, 또는 `CTXSCOPE_DIR`)에 저장됩니다. 수집기는 실패해도 세션을 막지 않습니다.

## 써 보기

```
claude --plugin-dir plugins/ctxscope
```

세션에서 「컨텍스트 맵 만들어 줘」라고 하면 `map` 과 `report` 가 돌아 보고서 경로를 줍니다.

## 템플릿 고치기

```
cd report && npm install && npm run build
```

`templates/report.html` 이 다시 만들어집니다. 소스와 함께 커밋합니다.

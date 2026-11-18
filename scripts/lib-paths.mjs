// 자료를 저장하는 위치를 한 곳에서 정합니다. 저장소 안에 두지 않아서 git 작업 트리가 바뀌지 않습니다.
// CONTEXT_SCANNER_DIR 를 주면 그곳을 쓰고, 아니면 플러그인의 자료 폴더 아래에 저장소마다 한 칸을 둡니다.
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export function dataDir(root)
{
    const dir = process.env.CONTEXT_SCANNER_DIR ?? process.env.CTXSCOPE_DIR; // 옛 이름(ctxscope)의 변수도 받습니다
    if (dir) return resolve(dir);
    const base = process.env.CLAUDE_PLUGIN_DATA ?? join(homedir(), ".claude", "context-scanner");
    return join(base, resolve(root).replace(/[^A-Za-z0-9가-힣._-]+/g, "-").replace(/^-+/, ""));
}

export function argOf(argv)
{
    return (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
}

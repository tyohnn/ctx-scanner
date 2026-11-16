import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// 보고서는 파일 하나로 나갑니다. 스킬이 이 파일의 자료 칸만 채워 HTML 문서를 만듭니다.
export default defineConfig({
    plugins: [react(), tailwindcss(), viteSingleFile()],
    resolve: { alias: { "@": path.resolve(__dirname, "src") } },
    build: { outDir: "../templates", emptyOutDir: false, rollupOptions: { input: "report.html" } },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  // GitHub Pages отдаёт сайт по адресу eshkere1.github.io/hr/, а не из корня
  // домена. Без base все ссылки на скрипты и стили уедут на верхний уровень
  // и страница откроется пустой. Локально Vite игнорирует это значение.
  base: process.env.GITHUB_PAGES ? "/hr/" : "/",
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: { port: 5173, host: true },
});

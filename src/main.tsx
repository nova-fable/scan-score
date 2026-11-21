import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { useLang } from "./lib/i18n";
import { api } from "./lib/tauri";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10_000, refetchOnWindowFocus: false },
  },
});

// 语言:先跟随系统,读到持久化设置(ui_lang)再覆盖
useLang.getState().initFromSystem();
void api.getSettings().then((rows) => {
  const v = rows.find((r) => r.key === "ui_lang")?.value;
  if (v === "zh" || v === "en") useLang.getState().setLang(v);
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);

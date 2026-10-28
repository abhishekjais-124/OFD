import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./styles.css";
import { BASE } from "./base.ts";
import { watchForUpdates } from "./update.ts";

document.documentElement.dataset.theme = "dark";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${BASE}/sw.js`, { updateViaCache: "none" })
      .then((reg) => watchForUpdates(reg), () => watchForUpdates())
      .catch(() => {
        /* offline support is optional */
      });
  });
} else {
  watchForUpdates();
}

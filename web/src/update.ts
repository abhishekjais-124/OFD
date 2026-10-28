/**
 * Keeps an open app on the newest release: checks version.json when the app comes back to the
 * foreground (and every few minutes while open) and reloads as soon as a new build is out.
 */
import { BASE } from "./base.ts";

const EVERY_MS = 5 * 60_000;
let pending = false;
let checking = false;

/** A reload never interrupts a quiz in progress: it waits until the full-screen quiz is closed. */
function busy(): boolean {
  return !!document.querySelector(".qz");
}

function reloadWhenFree() {
  if (busy()) {
    setTimeout(reloadWhenFree, 2000);
    return;
  }
  location.reload();
}

async function check(reg?: ServiceWorkerRegistration) {
  if (checking || pending || import.meta.env.DEV) return;
  checking = true;
  try {
    void reg?.update().catch(() => {});
    const res = await fetch(`${BASE}/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const { build } = (await res.json()) as { build?: string };
    if (build && build !== __OFD_BUILD__) {
      pending = true;
      reloadWhenFree();
    }
  } catch {
    /* offline: try again next time */
  } finally {
    checking = false;
  }
}

export function watchForUpdates(reg?: ServiceWorkerRegistration) {
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void check(reg); });
  window.addEventListener("focus", () => void check(reg));
  window.addEventListener("online", () => void check(reg));
  setInterval(() => { if (document.visibilityState === "visible") void check(reg); }, EVERY_MS);
  void check(reg);
}

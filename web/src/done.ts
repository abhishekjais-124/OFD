import { useCallback, useSyncExternalStore } from "react";
import type { Item } from "@shared/schema";

/** Which action items are marked done. One flag per whole action, remembered on this device. */
const KEY = "ofd.actionsDone";

function load(): Record<string, true> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, true>;
  } catch {
    return {};
  }
}

let state = load();
const listeners = new Set<() => void>();

function set(next: Record<string, true>) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode: still works for this session */
  }
  listeners.forEach((l) => l());
}

/** Stable across reprocessing: the deadline plus the start of the title. */
export function actionKey(item: Item): string {
  return `${item.action?.deadlineDate ?? "x"}|${(item.title ?? item.id).slice(0, 60)}`;
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
};
const snapshot = () => state;

export function useDoneMap(): Record<string, true> {
  return useSyncExternalStore(subscribe, snapshot);
}

export function useDone(key: string): [boolean, () => void] {
  const map = useDoneMap();
  const toggle = useCallback(() => {
    const next = { ...state };
    if (next[key]) delete next[key];
    else next[key] = true;
    set(next);
  }, [key]);
  return [Boolean(map[key]), toggle];
}

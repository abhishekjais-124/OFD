import type { ReactNode } from "react";
import { Icon } from "./ui.tsx";

export type Tab = "today" | "mail" | "news" | "learn" | "more";
export const TABS: { id: Tab; label: string; icon: () => ReactNode }[] = [
  { id: "today", label: "Today", icon: Icon.home },
  { id: "mail", label: "Mail", icon: Icon.mail },
  { id: "news", label: "News", icon: Icon.news },
  { id: "learn", label: "Learn", icon: Icon.learn },
  { id: "more", label: "More", icon: Icon.more },
];

/** Bottom navigation, like a native tab bar. Badges are small counts (for example actions due). */
export function TabBar({ active, onSelect, badges }: { active: Tab | "search"; onSelect: (t: Tab) => void; badges: Partial<Record<Tab, number>> }) {
  return (
    <nav className="tabbar" aria-label="Primary">
      <div className="tabbar-inner">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={`tab${active === t.id ? " on" : ""}`} aria-current={active === t.id ? "page" : undefined} onClick={() => onSelect(t.id)}>
            <span className="tab-icon">{t.icon()}{badges[t.id] ? <span className="tab-badge">{badges[t.id]}</span> : null}</span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

/** Top app bar with a page title and up to two actions. */
export function AppBar({ title, left, children }: { title: ReactNode; left?: ReactNode; children?: ReactNode }) {
  return (
    <header className="appbar">
      <div className="appbar-inner">
        {left}
        <h1 className="appbar-title">{title}</h1>
        <div className="appbar-actions">{children}</div>
      </div>
    </header>
  );
}

/** iOS-style segmented control for switching inside a page. */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  if (options.length < 2) return null;
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id} className={value === o.id ? "on" : ""} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

export type RefreshState = "idle" | "busy" | "ok" | "fail";

/** Refresh icon that shows what happened: spinning while working, a tick on success, a warning on failure. */
export function RefreshButton({ state, onClick, disabled }: { state: RefreshState; onClick: () => void; disabled: boolean }) {
  const label = state === "busy" ? "Refreshing" : state === "ok" ? "Refreshed" : state === "fail" ? "Refresh failed, tap to retry" : "Refresh (press R)";
  return (
    <button className={`btn bar-btn refresh-${state}`} type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} aria-live="polite">
      {state === "ok" ? Icon.check() : state === "fail" ? Icon.warn() : Icon.refresh(state === "busy" ? "spin" : undefined)}
    </button>
  );
}

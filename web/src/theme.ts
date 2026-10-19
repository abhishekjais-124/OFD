import { useEffect, useState } from "react";

export type ThemeChoice = "system" | "light" | "dark";
const KEY = "ofd.theme";

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

/** Follows the system theme unless the user picked one; the choice is remembered on this device. */
export function useTheme(): { choice: ThemeChoice; effective: "light" | "dark"; cycle: () => void } {
  const [choice, setChoice] = useState<ThemeChoice>(read);
  const [system, setSystem] = useState<"light" | "dark">(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystem(mq.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const effective = choice === "system" ? system : choice;
  useEffect(() => {
    document.documentElement.dataset.theme = effective;
    try {
      if (choice === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, choice);
    } catch {
      /* private mode */
    }
  }, [choice, effective]);
  const cycle = () => setChoice(choice === "system" ? (system === "dark" ? "light" : "dark") : choice === "light" ? "dark" : "system");
  return { choice, effective, cycle };
}

import { BASE } from "./base.ts";
import { memo, useCallback, useEffect, useId, useRef, useState } from "react";
import type { Sky, WeatherResponse } from "@shared/schema";

export type WeatherState =
  | { status: "locating" | "loading" }
  | { status: "ok"; weather: WeatherResponse; stale: boolean }
  | { status: "denied" | "unavailable"; message: string };

const LOC_KEY = "ofd.loc";
const WX_KEY = "ofd.weather";
const REFRESH_MS = 15 * 60_000;
const STALE_AFTER_MS = 3 * 60 * 60_000;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode */
  }
}

async function fetchWeather(lat: number, lon: number): Promise<WeatherResponse> {
  const res = await fetch(`${BASE}/api/weather?lat=${lat}&lon=${lon}`);
  const fromCache = res.headers.get("x-ofd-cache") === "1";
  if (!res.ok && !fromCache) throw new Error(`weather HTTP ${res.status}`);
  return (await res.json()) as WeatherResponse;
}

/**
 * Current weather for the device's location. The browser asks for permission once; the last
 * known position and reading are kept on this device so the sky is right straight away and
 * when offline. Only coordinates rounded to ~1 km reach the server.
 */
export function useWeather(): { state: WeatherState; retry: () => void; refresh: () => void } {
  const cachedWx = read<{ weather: WeatherResponse; at: number }>(WX_KEY);
  const [state, setState] = useState<WeatherState>(
    cachedWx && Date.now() - cachedWx.at < STALE_AFTER_MS ? { status: "ok", weather: cachedWx.weather, stale: true } : { status: "locating" },
  );
  const loc = useRef<{ lat: number; lon: number } | null>(read(LOC_KEY));

  const load = useCallback(async (lat: number, lon: number) => {
    try {
      const weather = await fetchWeather(lat, lon);
      write(WX_KEY, { weather, at: Date.now() });
      setState({ status: "ok", weather, stale: false });
    } catch (err) {
      setState((s) => (s.status === "ok" ? s : { status: "unavailable", message: (err as Error).message }));
    }
  }, []);

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      if (loc.current) void load(loc.current.lat, loc.current.lon);
      else setState({ status: "unavailable", message: "This browser cannot share a location." });
      return;
    }
    setState((s) => (s.status === "ok" ? s : { status: "locating" }));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: Math.round(pos.coords.latitude * 100) / 100, lon: Math.round(pos.coords.longitude * 100) / 100 };
        loc.current = next;
        write(LOC_KEY, next);
        void load(next.lat, next.lon);
      },
      (err) => {
        if (loc.current) void load(loc.current.lat, loc.current.lon);
        else setState({ status: err.code === err.PERMISSION_DENIED ? "denied" : "unavailable", message: err.code === err.PERMISSION_DENIED ? "Location is blocked for this site." : "Could not get a location." });
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 30 * 60_000 },
    );
  }, [load]);

  useEffect(() => {
    locate();
    const t = setInterval(() => { if (loc.current) void load(loc.current.lat, loc.current.lon); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [locate, load]);

  /** Re-reads the weather for the last known position; never shows a permission prompt. */
  const refresh = useCallback(() => {
    if (loc.current) void load(loc.current.lat, loc.current.lon);
  }, [load]);

  return { state, retry: locate, refresh };
}

/** CSS hook for the app-wide tint: "rain-night", "clear-day", and so on. */
export function skyKey(w: WeatherResponse | null): string | null {
  return w ? `${w.sky}-${w.isDay ? "day" : "night"}` : null;
}

const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const CLOUD = "M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 8.5a4.5 4.5 0 0 1 .5 9z";

export function WeatherIcon({ sky, isDay }: { sky: Sky; isDay: boolean }) {
  switch (sky) {
    case "clear":
      return isDay
        ? <svg viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" /></svg>
        : <svg viewBox="0 0 24 24" {...p}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>;
    case "partly":
      return <svg viewBox="0 0 24 24" {...p}><path d="M9 6.5V4.8M4.4 8.4 3.2 7.2M14.6 8.4l1.2-1.2M3.5 13H1.9" /><circle cx="9" cy="11" r="3" /><path d="M9 20h8.5a3.5 3.5 0 0 0 .3-7A5 5 0 0 0 8.6 14" /></svg>;
    case "cloudy":
      return <svg viewBox="0 0 24 24" {...p}><path d={CLOUD} /></svg>;
    case "fog":
      return <svg viewBox="0 0 24 24" {...p}><path d="M5 9h14M3 13h18M6 17h12M9 5h8" /></svg>;
    case "drizzle":
      return <svg viewBox="0 0 24 24" {...p}><path d="M7 14a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 4.5a4.5 4.5 0 0 1 .5 9.5M9 17.5v1.5M13 17.5v1.5M17 17.5v1.5" /></svg>;
    case "rain":
      return <svg viewBox="0 0 24 24" {...p}><path d="M7 14a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 4.5a4.5 4.5 0 0 1 .5 9.5M8 17l-1 3M12 17l-1 3M16 17l-1 3" /></svg>;
    case "snow":
      return <svg viewBox="0 0 24 24" {...p}><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 6.5l2.5-2M9.5 19.5 12 17.5l2.5 2" /></svg>;
    case "thunder":
      return <svg viewBox="0 0 24 24" {...p}><path d="M7 14a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 4.5a4.5 4.5 0 0 1 .5 9.5M12.5 13l-3 4.5h3L11 21" /></svg>;
  }
}

const seeded = (i: number, mod: number, mul: number) => ((i * mul) % mod) / mod;

type CloudLook = { light: string; ambient: string; gain: number; cut: number };

/** How dense and what colour the clouds are for a sky; "cut" moves the noise threshold (higher = more cover). */
function cloudLook(sky: Sky, isDay: boolean): CloudLook | null {
  const day = isDay;
  switch (sky) {
    case "partly": return day ? { light: "#ffffff", ambient: "#b9c7dc", gain: 5, cut: 2.75 } : { light: "#9aa6c8", ambient: "#232c50", gain: 5, cut: 2.75 };
    case "cloudy": return day ? { light: "#eef0f4", ambient: "#7f8898", gain: 4, cut: 1.55 } : { light: "#7a8399", ambient: "#20263a", gain: 4, cut: 1.55 };
    case "drizzle":
    case "rain": return day ? { light: "#c2cad6", ambient: "#4d5a70", gain: 4, cut: 1.35 } : { light: "#66718a", ambient: "#151c2b", gain: 4, cut: 1.35 };
    case "thunder": return { light: "#a197c6", ambient: "#22193d", gain: 4, cut: 1.3 };
    case "snow": return day ? { light: "#f4f6f9", ambient: "#a2acbb", gain: 4, cut: 1.5 } : { light: "#98a2b6", ambient: "#333e52", gain: 4, cut: 1.5 };
    default: return null;
  }
}

/**
 * A sheet of clouds from fractal noise: the noise becomes cloud density, a light from above shades it
 * (bright tops, darker bases) and an ambient tint fills the shadows. It is drawn once; only the layer slides.
 */
function CloudLayer({ look, depth, seed }: { look: CloudLook; depth: "far" | "near"; seed: number }) {
  const id = useId().replace(/:/g, "");
  const far = depth === "far";
  // horizontally stretched noise reads as cloud banks; the far layer is finer and fainter
  const freq = far ? "0.011 0.034" : "0.0065 0.02";
  return (
    <span className={`cloudlayer ${depth}`}>
      <svg width="100%" height="100%" preserveAspectRatio="none">
        <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency={freq} numOctaves={4} seed={seed} result="noise" />
          <feColorMatrix in="noise" type="matrix" values={`0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${look.gain} 0 0 0 -${look.cut}`} result="density" />
          <feGaussianBlur in="density" stdDeviation={far ? 4 : 2.6} result="soft" />
          <feDiffuseLighting in="soft" surfaceScale={far ? 1.4 : 2.4} diffuseConstant={1} lightingColor={look.light} result="lit">
            <feDistantLight azimuth={270} elevation={far ? 62 : 52} />
          </feDiffuseLighting>
          <feFlood floodColor={look.ambient} result="amb" />
          <feComposite in="lit" in2="amb" operator="arithmetic" k1={0} k2={0.7} k3={0.5} k4={0} result="shaded" />
          <feComposite in="shaded" in2="soft" operator="in" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${id})`} />
      </svg>
    </span>
  );
}

/** Animated sky behind the hero: layered gradients, sun or moon, stars, noise-based clouds in two depths, rain, snow, fog, lightning. */
export const SkyScene = memo(function SkyScene({ sky, isDay }: { sky: Sky; isDay: boolean }) {
  const look = cloudLook(sky, isDay);
  const drops = sky === "rain" || sky === "thunder" ? 44 : sky === "drizzle" ? 26 : 0;
  const flakes = sky === "snow" ? 30 : 0;
  const stars = !isDay && (sky === "clear" || sky === "partly") ? 42 : 0;
  return (
    <div className="sky-scene" aria-hidden="true">
      {isDay && (sky === "clear" || sky === "partly") && <span className="sun"><i /></span>}
      {!isDay && (sky === "clear" || sky === "partly") && <span className="moon" />}
      {Array.from({ length: stars }, (_, i) => {
        const big = i % 9 === 0;
        return (
          <span
            key={`s${i}`}
            className={`star${big ? " big" : ""}`}
            style={{ left: `${seeded(i, 97, 53) * 100}%`, top: `${seeded(i, 61, 29) * 62}%`, animationDelay: `${seeded(i, 11, 3) * 5}s`, animationDuration: `${2.6 + seeded(i, 7, 5) * 3}s`, opacity: 0.3 + seeded(i, 7, 5) * 0.7 }}
          />
        );
      })}
      {look && (
        <>
          <CloudLayer look={look} depth="far" seed={23} />
          <CloudLayer look={look} depth="near" seed={7} />
        </>
      )}
      {sky === "fog" && (
        <>
          <span className="haze" />
          {[0, 1, 2, 3].map((i) => <span key={`f${i}`} className="fogband" style={{ top: `${8 + i * 24}%`, animationDuration: `${34 + i * 9}s`, animationDelay: `${-i * 7}s`, opacity: 0.5 + (i % 2) * 0.25 }} />)}
        </>
      )}
      {Array.from({ length: drops }, (_, i) => (
        <span
          key={`d${i}`}
          className={`raindrop${sky === "drizzle" ? " fine" : ""}`}
          style={{ left: `${seeded(i, 101, 47) * 100}%`, height: `${(sky === "drizzle" ? 10 : 18) + seeded(i, 9, 4) * 14}px`, opacity: 0.35 + seeded(i, 7, 3) * 0.5, animationDelay: `${-seeded(i, 13, 7) * 1.2}s`, animationDuration: `${(sky === "drizzle" ? 1.4 : 0.7) + seeded(i, 5, 3) * 0.4}s` }}
        />
      ))}
      {drops > 0 && <span className="mist" />}
      {Array.from({ length: flakes }, (_, i) => {
        const size = 2.5 + seeded(i, 5, 2) * 4;
        return (
          <span
            key={`n${i}`}
            className="flake"
            style={{ left: `${seeded(i, 103, 41) * 100}%`, width: size, height: size, opacity: 0.45 + seeded(i, 7, 3) * 0.55, animationDelay: `${-seeded(i, 17, 5) * 9}s`, animationDuration: `${7 + seeded(i, 7, 3) * 6}s` }}
          />
        );
      })}
      {sky === "thunder" && (
        <>
          <span className="flash" />
          <svg className="bolt" viewBox="0 0 40 100" preserveAspectRatio="none"><path d="M22 0 L12 44 L21 44 L10 100 L30 38 L20 38 Z" /></svg>
        </>
      )}
      <span className="scrim" />
    </div>
  );
});

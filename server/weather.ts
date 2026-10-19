/**
 * weather: current conditions for a coordinate from Open-Meteo (free, no key) and a place
 * name from BigDataCloud's keyless reverse geocoder. Coordinates are rounded to two decimals
 * (about 1 km) before they leave this server, and results are cached for ten minutes.
 */
import type { Sky, WeatherResponse } from "../shared/schema.ts";

const TTL_MS = 10 * 60_000;

export class WeatherError extends Error {
  constructor(public readonly code: "bad_coordinates" | "upstream", message: string) {
    super(message);
    this.name = "WeatherError";
  }
}

/** WMO weather interpretation codes, as used by Open-Meteo. */
export function skyFromCode(code: number): { sky: Sky; label: string } {
  if (code === 0) return { sky: "clear", label: "Clear" };
  if (code === 1) return { sky: "clear", label: "Mostly clear" };
  if (code === 2) return { sky: "partly", label: "Partly cloudy" };
  if (code === 3) return { sky: "cloudy", label: "Overcast" };
  if (code === 45 || code === 48) return { sky: "fog", label: "Fog" };
  if (code >= 51 && code <= 57) return { sky: "drizzle", label: "Drizzle" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { sky: "rain", label: code >= 80 ? "Rain showers" : "Rain" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { sky: "snow", label: "Snow" };
  if (code >= 95 && code <= 99) return { sky: "thunder", label: "Thunderstorm" };
  return { sky: "cloudy", label: "Cloudy" };
}

export function roundCoord(n: number): number {
  return Math.round(n * 100) / 100;
}

export function parseCoordinates(lat: unknown, lon: unknown): { lat: number; lon: number } {
  const la = Number(lat);
  const lo = Number(lon);
  if (lat === undefined || lon === undefined || lat === "" || lon === "" || !Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) {
    throw new WeatherError("bad_coordinates", "lat must be -90..90 and lon -180..180");
  }
  return { lat: roundCoord(la), lon: roundCoord(lo) };
}

interface OpenMeteo {
  current?: { temperature_2m: number; apparent_temperature: number; weather_code: number; is_day: number; wind_speed_10m: number; relative_humidity_2m: number };
  daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[] };
}

export interface WeatherService {
  get(lat: number, lon: number): Promise<WeatherResponse>;
}

export function weatherService(fetchImpl: typeof fetch = fetch, now: () => number = Date.now): WeatherService {
  const cache = new Map<string, { at: number; value: WeatherResponse }>();

  async function json<T>(url: string): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
    } catch (err) {
      throw new WeatherError("upstream", `weather provider unreachable: ${(err as Error).message}`);
    }
    if (!res.ok) throw new WeatherError("upstream", `weather provider answered HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  return {
    async get(lat, lon) {
      const key = `${lat},${lon}`;
      const hit = cache.get(key);
      if (hit && now() - hit.at < TTL_MS) return hit.value;

      const forecast = json<OpenMeteo>(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
          "&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,relative_humidity_2m" +
          "&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1",
      );
      // the place name is a nicety: a failure must not hide the weather
      const place = json<{ city?: string; locality?: string; principalSubdivision?: string }>(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
      ).then((g) => g.city || g.locality || g.principalSubdivision || null).catch(() => null);

      const data = await forecast;
      const c = data.current;
      if (!c) throw new WeatherError("upstream", "weather provider returned no current conditions");
      const { sky, label } = skyFromCode(c.weather_code);
      const value: WeatherResponse = {
        sky,
        isDay: c.is_day === 1,
        label,
        tempC: Math.round(c.temperature_2m),
        feelsC: Math.round(c.apparent_temperature),
        highC: data.daily?.temperature_2m_max?.[0] !== undefined ? Math.round(data.daily.temperature_2m_max[0]) : null,
        lowC: data.daily?.temperature_2m_min?.[0] !== undefined ? Math.round(data.daily.temperature_2m_min[0]) : null,
        windKph: Math.round(c.wind_speed_10m),
        humidity: Math.round(c.relative_humidity_2m),
        place: await place,
        fetchedAt: new Date(now()).toISOString(),
      };
      cache.set(key, { at: now(), value });
      return value;
    },
  };
}

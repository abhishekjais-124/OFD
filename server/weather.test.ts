import { describe, expect, it, vi } from "vitest";
import { parseCoordinates, roundCoord, skyFromCode, weatherService } from "./weather.ts";

describe("skyFromCode", () => {
  it("maps WMO codes to skies", () => {
    expect(skyFromCode(0)).toEqual({ sky: "clear", label: "Clear" });
    expect(skyFromCode(2).sky).toBe("partly");
    expect(skyFromCode(3).sky).toBe("cloudy");
    expect(skyFromCode(48).sky).toBe("fog");
    expect(skyFromCode(51).sky).toBe("drizzle");
    expect(skyFromCode(63).sky).toBe("rain");
    expect(skyFromCode(81).sky).toBe("rain");
    expect(skyFromCode(73).sky).toBe("snow");
    expect(skyFromCode(95).sky).toBe("thunder");
    expect(skyFromCode(999).sky).toBe("cloudy");
  });
});

describe("coordinates", () => {
  it("rounds to two decimals and rejects nonsense", () => {
    expect(roundCoord(12.971599)).toBe(12.97);
    expect(parseCoordinates("12.9716", "77.5946")).toEqual({ lat: 12.97, lon: 77.59 });
    expect(() => parseCoordinates("91", "0")).toThrow();
    expect(() => parseCoordinates("abc", "0")).toThrow();
    expect(() => parseCoordinates(undefined, "0")).toThrow();
    expect(() => parseCoordinates("", "")).toThrow();
  });
});

describe("weatherService", () => {
  const forecast = { current: { temperature_2m: 26.6, apparent_temperature: 29.4, weather_code: 63, is_day: 0, wind_speed_10m: 11.2, relative_humidity_2m: 81 }, daily: { temperature_2m_max: [28.3], temperature_2m_min: [20.2] } };
  function fetchMock(opts: { geocodeFails?: boolean } = {}) {
    return vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("open-meteo")) return new Response(JSON.stringify(forecast));
      if (opts.geocodeFails) return new Response("no", { status: 500 });
      return new Response(JSON.stringify({ city: "Bengaluru" }));
    }) as unknown as typeof fetch;
  }

  it("combines forecast and place, rounds values, sends only rounded coordinates, and caches", async () => {
    const f = fetchMock();
    let t = 1_000;
    const svc = weatherService(f, () => t);
    const w = await svc.get(12.97, 77.59);
    expect(w).toMatchObject({ sky: "rain", isDay: false, label: "Rain", tempC: 27, feelsC: 29, highC: 28, lowC: 20, windKph: 11, humidity: 81, place: "Bengaluru" });
    for (const call of (f as unknown as ReturnType<typeof vi.fn>).mock.calls) expect(String(call[0])).toMatch(/12\.97.*77\.59|latitude=12\.97/);
    const calls = (f as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    t += 5 * 60_000;
    await svc.get(12.97, 77.59);
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);
    t += 6 * 60_000;
    await svc.get(12.97, 77.59);
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls * 2);
  });

  it("still returns the weather when the place lookup fails", async () => {
    const w = await weatherService(fetchMock({ geocodeFails: true })).get(1, 2);
    expect(w.place).toBeNull();
    expect(w.tempC).toBe(27);
  });

  it("fails clearly when the provider is down", async () => {
    const down = (async () => new Response("x", { status: 503 })) as unknown as typeof fetch;
    await expect(weatherService(down).get(1, 2)).rejects.toMatchObject({ code: "upstream" });
  });
});

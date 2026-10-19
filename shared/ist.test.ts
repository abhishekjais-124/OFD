import { describe, expect, it } from "vitest";
import {
  addDaysIST, countdownIST, endOfDayIST, formatDateTimeIST, formatLongDateIST,
  isIsoDate, parseHumanDate, startOfDayIST, todayIST, toIsoDateIST, weekDates, weekdayParts,
} from "./ist.ts";

describe("todayIST", () => {
  it("uses the IST calendar day, not UTC", () => {
    // 18 Oct 2026 20:00 UTC is 19 Oct 01:30 IST
    expect(todayIST(new Date("2026-10-18T20:00:00Z"))).toBe("2026-10-19");
  });

  it("rolls over exactly at midnight IST (18:30 UTC)", () => {
    expect(todayIST(new Date("2026-10-18T18:29:59.999Z"))).toBe("2026-10-18");
    expect(todayIST(new Date("2026-10-18T18:30:00.000Z"))).toBe("2026-10-19");
  });

  it("stays on the same day through the IST afternoon when UTC is still morning", () => {
    expect(todayIST(new Date("2026-10-19T03:40:00Z"))).toBe("2026-10-19");
    expect(todayIST(new Date("2026-10-19T18:29:00Z"))).toBe("2026-10-19");
  });

  it("handles month and year boundaries", () => {
    expect(todayIST(new Date("2026-12-31T18:30:00Z"))).toBe("2027-01-01");
    expect(todayIST(new Date("2026-02-28T18:30:00Z"))).toBe("2026-03-01");
  });
});

describe("day boundaries", () => {
  it("start and end of day are in IST", () => {
    expect(startOfDayIST("2026-10-19").toISOString()).toBe("2026-10-18T18:30:00.000Z");
    expect(endOfDayIST("2026-10-19").toISOString()).toBe("2026-10-19T18:29:59.999Z");
    expect(toIsoDateIST(endOfDayIST("2026-10-19"))).toBe("2026-10-19");
  });

  it("adds days across month ends", () => {
    expect(addDaysIST("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysIST("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("isIsoDate", () => {
  it("rejects malformed or impossible dates", () => {
    expect(isIsoDate("2026-10-19")).toBe(true);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("19-10-2026")).toBe(false);
    expect(isIsoDate(20261019)).toBe(false);
  });
});

describe("formatting", () => {
  it("formats long dates with the weekday", () => {
    expect(formatLongDateIST("2026-10-19")).toBe("Monday, 19 October 2026");
  });
  it("formats instants in IST with 12-hour clock", () => {
    expect(formatDateTimeIST(new Date("2026-10-19T10:10:56Z"))).toBe("19 Oct 2026, 3:40 PM IST");
    expect(formatDateTimeIST(new Date("2026-10-18T18:30:00Z"))).toBe("19 Oct 2026, 12:00 AM IST");
  });
});

describe("parseHumanDate", () => {
  it("parses the deadline styles found in the briefing", () => {
    expect(parseHumanDate("ACTION NEEDED BY 21 OCT 2026, EOD")).toBe("2026-10-21");
    expect(parseHumanDate("completed by 21 October 2026, EOD.")).toBe("2026-10-21");
    expect(parseHumanDate("due 2026-10-21")).toBe("2026-10-21");
    expect(parseHumanDate("no date here")).toBeNull();
    expect(parseHumanDate("31 Feb 2026")).toBeNull();
  });
});

describe("countdownIST", () => {
  const now = new Date("2026-10-19T04:00:00Z"); // 19 Oct 09:30 IST
  it("counts whole IST days to the deadline", () => {
    expect(countdownIST("2026-10-21", now)).toMatchObject({ days: 2, state: "upcoming", label: "2 days left" });
    expect(countdownIST("2026-10-20", now)).toMatchObject({ days: 1, state: "tomorrow" });
    expect(countdownIST("2026-10-19", now)).toMatchObject({ days: 0, state: "today" });
    expect(countdownIST("2026-10-18", now)).toMatchObject({ days: -1, state: "overdue", label: "1 day overdue" });
  });
  it("treats the deadline day as ending at 23:59:59 IST", () => {
    const c = countdownIST("2026-10-19", new Date("2026-10-19T18:29:00Z"));
    expect(c.state).toBe("today");
    expect(c.msRemaining).toBeGreaterThan(0);
    expect(countdownIST("2026-10-19", new Date("2026-10-19T18:30:00Z")).state).toBe("overdue");
  });
});

import { greetingIST, nameFromGreetingTitle } from "./ist.ts";

describe("greetingIST", () => {
  const at = (iso: string) => greetingIST(new Date(iso));
  it("follows the IST hour, not UTC", () => {
    expect(at("2026-10-19T00:00:00Z")).toBe("Good morning"); // 05:30 IST
    expect(at("2026-10-18T23:29:00Z")).toBe("Good night"); // 04:59 IST
    expect(at("2026-10-19T06:29:00Z")).toBe("Good morning"); // 11:59 IST
    expect(at("2026-10-19T06:30:00Z")).toBe("Good afternoon"); // 12:00 IST
    expect(at("2026-10-19T11:29:00Z")).toBe("Good afternoon"); // 16:59 IST
    expect(at("2026-10-19T11:30:00Z")).toBe("Good evening"); // 17:00 IST
    expect(at("2026-10-19T15:29:00Z")).toBe("Good evening"); // 20:59 IST
    expect(at("2026-10-19T15:30:00Z")).toBe("Good night"); // 21:00 IST
  });
});

describe("nameFromGreetingTitle", () => {
  it("pulls the name out of the document title", () => {
    expect(nameFromGreetingTitle("Good morning, Abhishek ☀️")).toBe("Abhishek");
    expect(nameFromGreetingTitle("Good morning, Sample ☀️")).toBe("Sample");
    expect(nameFromGreetingTitle("Briefing")).toBeNull();
  });
});

import { timeAgo } from "./ist.ts";

describe("timeAgo", () => {
  const now = new Date("2026-10-19T12:00:00Z"); // 17:30 IST on 19 Oct
  const ago = (iso: string) => timeAgo(new Date(iso), now);
  it("uses minutes, hours, yesterday, days and a date", () => {
    expect(ago("2026-10-19T11:59:40Z")).toBe("just now");
    expect(ago("2026-10-19T11:48:00Z")).toBe("12 min ago");
    expect(ago("2026-10-19T09:00:00Z")).toBe("3 h ago");
    expect(ago("2026-10-18T09:00:00Z")).toBe("yesterday");
    expect(ago("2026-10-16T09:00:00Z")).toBe("3 d ago");
    expect(ago("2026-10-01T09:00:00Z")).toBe("1 Oct 2026");
  });
  it("treats future times as just now", () => {
    expect(ago("2026-10-19T13:00:00Z")).toBe("just now");
  });
});

describe("weekDates", () => {
  it("gives Monday to Sunday around a date", () => {
    expect(weekDates("2026-10-20")).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
    expect(weekDates("2026-10-25")[0]).toBe("2026-10-19");
    expect(weekDates("2026-10-19")[6]).toBe("2026-10-25");
  });
  it("names the weekday", () => {
    expect(weekdayParts("2026-10-19")).toEqual({ weekday: "Mon", day: 19 });
  });
});

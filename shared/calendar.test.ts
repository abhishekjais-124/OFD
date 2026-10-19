import { describe, expect, it } from "vitest";
import { parseCalendarStatus } from "./calendar.ts";

describe("parseCalendarStatus", () => {
  it("reads the real briefing's all-clear card", () => {
    const s = parseCalendarStatus([
      'Checked: today 19 Oct and tomorrow 20 Oct (IST) on jaiswal.abhishek2@unacademy.com, the next 7 days (19 to 25 Oct)',
      'for pending invites, and the "on call shifts Abhishek Jaiswal" calendar.',
      "Meetings: none. On call: none. RSVP needed: none.",
      "Calendar: https://calendar.google.com/calendar/u/0/r/week/2026/10/19",
    ]);
    expect(s).toMatchObject({ meetings: null, onCall: null, rsvp: null, recognized: true });
    expect(s.checked).toContain("the next 7 days (19 to 25 Oct)");
    expect(s.checked).toContain('calendar.');
    expect(s.checked).not.toContain("Meetings");
  });

  it("keeps real values and separates them from the other statuses", () => {
    const s = parseCalendarStatus([
      "Checked: today and tomorrow.",
      "Meetings: Team sync, 11:00 to 11:30 AM IST. On call: Primary until Friday. RSVP needed: Design review.",
      "Calendar: https://calendar.example.com/week",
    ]);
    expect(s.meetings).toBe("Team sync, 11:00 to 11:30 AM IST");
    expect(s.onCall).toBe("Primary until Friday");
    expect(s.rsvp).toBe("Design review");
  });

  it("does not misread an unrelated card", () => {
    expect(parseCalendarStatus(["Something else entirely"]).recognized).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { buildQuiz, type DayExtras } from "./quiz.ts";

const day = (n: number, extra: Partial<DayExtras> = {}): DayExtras => ({
  date: `2026-10-${String(n).padStart(2, "0")}`,
  word: `word${n}`,
  meaning: `meaning number ${n}`,
  quote: `quote ${n}`,
  author: `Author ${n}`,
  history: `${1900 + n} - event ${n}`,
  riddle: `riddle ${n}?`,
  answer: `answer ${n}`,
  ...extra,
});

describe("buildQuiz", () => {
  const days = Array.from({ length: 8 }, (_, i) => day(i + 10));

  it("gives five three-option questions with one right answer each", () => {
    const quiz = buildQuiz("2026-10-28", days);
    expect(quiz.questions).toHaveLength(5);
    for (const q of quiz.questions) {
      expect(q.options).toHaveLength(3);
      expect(new Set(q.options).size).toBe(3);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(3);
    }
    expect(new Set(quiz.questions.map((q) => q.from)).size).toBe(5);
  });

  it("is the same quiz all day and a different one the next day", () => {
    expect(buildQuiz("2026-10-28", days)).toEqual(buildQuiz("2026-10-28", [...days].reverse()));
    expect(buildQuiz("2026-10-29", days).questions.map((q) => q.id)).not.toEqual(buildQuiz("2026-10-28", days).questions.map((q) => q.id));
  });

  it("asks the right answer for a word", () => {
    const q = buildQuiz("2026-10-28", [day(1)]).questions.find((x) => x.kind === "word");
    expect(q?.options[q.answer]).toBe("meaning number 1");
  });

  it("still builds questions from a single day using spare options", () => {
    expect(buildQuiz("2026-10-28", [day(1)]).questions.length).toBe(5);
    expect(buildQuiz("2026-10-28", []).questions).toEqual([]);
  });
});

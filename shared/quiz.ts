/**
 * Quiz of the day: five three-option questions built from the Daily extras of the last month.
 * Everything is seeded by the quiz date, so the same day always gets the same quiz.
 */
import type { Briefing, Item } from "./schema.ts";
import type { IsoDate } from "./ist.ts";

export interface DayExtras {
  date: IsoDate;
  word?: string;
  meaning?: string;
  quote?: string;
  author?: string;
  history?: string;
  riddle?: string;
  answer?: string;
  shlok?: string;
  gitaRef?: string;
  translit?: string;
  /** English meaning of the day's Gita verse. */
  gitaMeaning?: string;
}

export type QuizKind = "word" | "meaning" | "quote" | "history" | "riddle" | "shlok";

export interface QuizQuestion {
  id: string;
  kind: QuizKind;
  prompt: string;
  /** Extra text shown under the prompt, such as a verse. */
  detail?: string;
  options: string[];
  answer: number;
  /** The Daily page the question comes from. */
  from: IsoDate;
}

export interface QuizResponse {
  date: IsoDate;
  /** How many Daily pages the questions were drawn from. */
  days: number;
  questions: QuizQuestion[];
}

export const QUIZ_SIZE = 5;
export const QUIZ_WINDOW_DAYS = 30;

const field = (item: Item, label: string) => item.fields.find((f) => f.label.toLowerCase() === label.toLowerCase())?.text.trim() || undefined;

/** The Daily extras of one briefing, or null when it has none. */
export function dayExtrasFrom(briefing: Briefing): DayExtras | null {
  const item = briefing.sections.filter((s) => s.kind === "extras").flatMap((s) => s.items)[0];
  if (!item || !briefing.date) return null;
  return {
    date: briefing.date,
    word: field(item, "Word"),
    meaning: field(item, "Meaning"),
    quote: field(item, "Quote"),
    author: field(item, "Author"),
    history: field(item, "History"),
    riddle: field(item, "Riddle"),
    answer: field(item, "Answer"),
    shlok: field(item, "Shlok"),
    gitaRef: field(item, "Gita ref"),
    translit: field(item, "Transliteration"),
    gitaMeaning: field(item, "Gita meaning"),
  };
}

/* Wrong options used when the month has too few days of its own to choose from. */
const SPARE_MEANINGS = [
  "lasting for a very short time",
  "showing great care about small details",
  "talking a lot, often about unimportant things",
  "able to recover quickly from difficulty",
  "full of cheerful energy and excitement",
  "a happy accident or lucky discovery",
];
const SPARE_WORDS = ["ephemeral", "meticulous", "garrulous", "resilient", "ebullient", "serendipity"];
const SPARE_AUTHORS = ["Albert Einstein", "Mahatma Gandhi", "Maya Angelou", "Marcus Aurelius", "Confucius", "Mark Twain"];
const SPARE_GITA = [
  "Remain calm and steady in both success and failure.",
  "The soul is eternal; it is never born and never dies.",
  "Give up anger and greed, they lead to ruin.",
  "A person is made by their faith; they become what they believe.",
  "Whoever sees all beings in the Self is never troubled.",
  "Offer your work to God and let go of attachment to its reward.",
];
const SPARE_ANSWERS = ["A piano", "A towel", "A clock", "A cold", "A coin", "Your age", "A comb", "Water", "A needle", "Footsteps", "A stamp", "A sponge"];

/** FNV-1a then mulberry32: a small seeded generator that is the same in Node and the browser. */
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(list: T[], rnd: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g, " ").trim();

/** Two wrong options different from the right one (and each other), month values first, spares after. */
function wrongOptions(right: string, own: (string | undefined)[], spare: string[], rnd: () => number): string[] | null {
  const seen = new Set([norm(right)]);
  const out: string[] = [];
  for (const v of [...shuffle(own.filter((x): x is string => !!x), rnd), ...shuffle(spare, rnd)]) {
    if (out.length === 2) break;
    if (seen.has(norm(v))) continue;
    seen.add(norm(v));
    out.push(v);
  }
  return out.length === 2 ? out : null;
}

function build(kind: QuizKind, day: DayExtras, prompt: string, right: string, wrong: string[] | null, rnd: () => number, detail?: string): QuizQuestion | null {
  if (!wrong) return null;
  const options = shuffle([right, ...wrong], rnd);
  return { id: `${day.date}:${kind}`, kind, prompt, detail, options, answer: options.indexOf(right), from: day.date };
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function candidates(day: DayExtras, all: DayExtras[], rnd: () => number, thisYear: number): QuizQuestion[] {
  const others = all.filter((d) => d.date !== day.date);
  const out: (QuizQuestion | null)[] = [];
  if (day.word && day.meaning) {
    out.push(build("word", day, `What does “${day.word}” mean?`, day.meaning, wrongOptions(day.meaning, others.map((d) => d.meaning), SPARE_MEANINGS, rnd), rnd));
    out.push(build("meaning", day, `Which word means “${day.meaning}”?`, day.word, wrongOptions(day.word, others.map((d) => d.word), SPARE_WORDS, rnd), rnd));
  }
  if (day.quote && day.author) {
    out.push(build("quote", day, "Who said this?", day.author, wrongOptions(day.author, others.map((d) => d.author), SPARE_AUTHORS, rnd), rnd, `“${clip(day.quote, 160)}”`));
  }
  const year = day.history ? /^(\d{3,4})\s*[-:–—]\s*(.+)$/.exec(day.history) : null;
  if (year) {
    const y = Number(year[1]);
    const near = shuffle([-120, -85, -60, -45, -30, 30, 45, 60, 85, 120].map((d) => y + d).filter((v) => v > 0 && v <= thisYear), rnd);
    out.push(build("history", day, "Roughly when did this happen?", String(y), near.length >= 2 ? near.slice(0, 2).map(String) : null, rnd, clip(year[2]!, 160)));
  }
  if (day.riddle && day.answer) {
    out.push(build("riddle", day, day.riddle, day.answer, wrongOptions(day.answer, others.map((d) => d.answer), SPARE_ANSWERS, rnd), rnd));
  }
  if (day.gitaMeaning && (day.translit || day.shlok)) {
    const meaning = clip(day.gitaMeaning, 130);
    const wrong = wrongOptions(meaning, others.map((d) => (d.gitaMeaning ? clip(d.gitaMeaning, 130) : undefined)), SPARE_GITA, rnd);
    out.push(build("shlok", day, "What does this Gita verse say?", meaning, wrong, rnd, clip(day.translit ?? day.shlok!, 140)));
  }
  return out.filter((q): q is QuizQuestion => q !== null);
}

/**
 * The quiz for `date` from the given days (any order). Questions rotate through the kinds so one
 * quiz mixes words, quotes, history, riddles and verses, and never asks about the same day twice
 * until every day has been used.
 */
export function buildQuiz(date: IsoDate, days: DayExtras[], size = QUIZ_SIZE): QuizResponse {
  const rnd = seededRandom(`ofd-quiz:${date}`);
  const pool = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const thisYear = Number(date.slice(0, 4));
  const byKind = new Map<QuizKind, QuizQuestion[]>();
  for (const day of pool) for (const q of candidates(day, pool, rnd, thisYear)) byKind.set(q.kind, [...(byKind.get(q.kind) ?? []), q]);
  const kinds = shuffle([...byKind.keys()], rnd);
  for (const k of kinds) byKind.set(k, shuffle(byKind.get(k)!, rnd));
  const picked: QuizQuestion[] = [];
  const usedDays = new Set<string>();
  // two passes: first one question per day, then allow repeats of a day
  for (const fresh of [true, false]) {
    let progress = true;
    while (picked.length < size && progress) {
      progress = false;
      for (const k of kinds) {
        if (picked.length >= size) break;
        const list = byKind.get(k)!;
        const i = list.findIndex((q) => !fresh || !usedDays.has(q.from));
        if (i < 0) continue;
        const [q] = list.splice(i, 1);
        picked.push(q!);
        usedDays.add(q!.from);
        progress = true;
      }
    }
  }
  // easy first, medium last
  const level: Record<QuizKind, number> = { riddle: 1, word: 2, meaning: 3, shlok: 3, quote: 4, history: 5 };
  picked.sort((a, b) => level[a.kind] - level[b.kind]);
  return { date, days: pool.length, questions: picked };
}

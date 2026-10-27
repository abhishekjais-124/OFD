import { useEffect, useRef, useState } from "react";
import type { QuizQuestion, QuizResponse } from "@shared/quiz";
import { formatShortDateIST } from "@shared/ist";
import { api } from "../api.ts";
import { Icon } from "./ui.tsx";

interface QuizRecord { plays: number; best: number; last: number }

const key = (date: string) => `ofd.quiz.${date}`;
function loadRecord(date: string): QuizRecord | null {
  try {
    const v = JSON.parse(localStorage.getItem(key(date)) ?? "null") as QuizRecord | null;
    return v && typeof v.best === "number" ? v : null;
  } catch {
    return null;
  }
}
function saveRecord(date: string, score: number): QuizRecord {
  const prev = loadRecord(date);
  const next = { plays: (prev?.plays ?? 0) + 1, best: Math.max(prev?.best ?? 0, score), last: score };
  try { localStorage.setItem(key(date), JSON.stringify(next)); } catch { /* private mode */ }
  return next;
}

const KIND_LABEL: Record<QuizQuestion["kind"], string> = {
  word: "Word", meaning: "Word", quote: "Quote", history: "History", riddle: "Riddle", shlok: "Gita",
};

/** Quiz of the day: five questions from the last month of Daily pages, replayable, with a score reveal. */
export function QuizCard({ date }: { date: string }) {
  const [quiz, setQuiz] = useState<QuizResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [record, setRecord] = useState(() => loadRecord(date));
  const [step, setStep] = useState<"intro" | "play" | "done">("intro");
  const [index, setIndex] = useState(0);
  const [picks, setPicks] = useState<number[]>([]);

  useEffect(() => {
    let live = true;
    setQuiz(null);
    setFailed(false);
    setStep("intro");
    setRecord(loadRecord(date));
    api.quiz(date).then((r) => live && setQuiz(r.data), () => live && setFailed(true));
    return () => { live = false; };
  }, [date]);

  const questions = quiz?.questions ?? [];
  const start = () => { setPicks([]); setIndex(0); setStep("play"); };
  const choose = (i: number) => { if (picks.length === index) setPicks([...picks, i]); };
  const next = () => {
    if (index + 1 < questions.length) { setIndex(index + 1); return; }
    const score = picks.filter((p, i) => p === questions[i]!.answer).length;
    setRecord(saveRecord(date, score));
    setStep("done");
  };

  return (
    <article className="dx quiz fade-in">
      <p className="dx-label"><span className="dx-ico" aria-hidden="true">{Icon.check()}</span>Quiz of the day</p>
      {!quiz && !failed && <p className="dx-body quiz-muted">Shuffling questions{"…"}</p>}
      {failed && <p className="dx-body quiz-muted">The quiz could not load. Pull to refresh and try again.</p>}
      {quiz && questions.length === 0 && <p className="dx-body quiz-muted">Not enough Daily pages yet. The quiz starts once a few days have built up.</p>}
      {quiz && questions.length > 0 && step === "intro" && (
        <div className="quiz-intro">
          <p className="dx-body">{questions.length} questions from the last {quiz.days} Daily {quiz.days === 1 ? "page" : "pages"}: words, quotes, history, riddles and verses. Play as often as you like.</p>
          {record && <p className="quiz-record">Best <b>{record.best}/{questions.length}</b> · played {record.plays} {record.plays === 1 ? "time" : "times"} today</p>}
          <button className="btn primary quiz-go" type="button" onClick={start}>{record ? "Play again" : "Start quiz"}</button>
        </div>
      )}
      {step === "play" && questions[index] && (
        <Question q={questions[index]!} n={index} total={questions.length} pick={picks[index]} onPick={choose} onNext={next} last={index + 1 === questions.length} />
      )}
      {step === "done" && record && <Reveal questions={questions} picks={picks} record={record} onAgain={start} />}
    </article>
  );
}

function Question({ q, n, total, pick, onPick, onNext, last }: {
  q: QuizQuestion; n: number; total: number; pick: number | undefined; onPick: (i: number) => void; onNext: () => void; last: boolean;
}) {
  const answered = pick !== undefined;
  return (
    <div className="quiz-q" key={q.id}>
      <div className="quiz-progress" aria-label={`Question ${n + 1} of ${total}`}>
        {Array.from({ length: total }, (_, i) => <span key={i} className={i < n ? "done" : i === n ? "now" : ""} />)}
      </div>
      <p className="quiz-meta">{KIND_LABEL[q.kind]} · from {formatShortDateIST(q.from)}</p>
      <h3 className="quiz-prompt">{q.prompt}</h3>
      {q.detail && <p className={`quiz-detail${q.kind === "quote" ? " quote" : ""}`}>{q.detail}</p>}
      <div className="quiz-opts" role="radiogroup">
        {q.options.map((o, i) => {
          const state = !answered ? "" : i === q.answer ? " right" : i === pick ? " wrong" : " dim";
          return (
            <button key={i} type="button" role="radio" aria-checked={pick === i} disabled={answered} className={`quiz-opt${state}`} onClick={() => onPick(i)}>
              <span className="quiz-letter">{"ABC"[i]}</span><span>{o}</span>
            </button>
          );
        })}
      </div>
      {answered && (
        <button className="btn primary quiz-go" type="button" onClick={onNext}>{last ? "See my score" : "Next"}</button>
      )}
    </div>
  );
}

const VERDICT = ["Fresh start", "Warming up", "Getting there", "Nicely done", "Sharp memory", "Perfect score"];

function Reveal({ questions, picks, record, onAgain }: { questions: QuizQuestion[]; picks: number[]; record: QuizRecord; onAgain: () => void }) {
  const total = questions.length;
  const score = picks.filter((p, i) => p === questions[i]!.answer).length;
  const [shown, setShown] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 1100);
      setShown(score * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [score]);
  const r = 52;
  const c = 2 * Math.PI * r;
  const ratio = total ? shown / total : 0;
  const tier = score === total ? "gold" : score / total >= 0.6 ? "good" : "low";
  return (
    <div className={`quiz-reveal ${tier}`}>
      {tier === "gold" && <div className="quiz-burst" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ ["--i" as string]: i }} />)}</div>}
      <div className="quiz-ring">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <defs>
            <linearGradient id="quizGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#6f86ff" /><stop offset="100%" stopColor={tier === "gold" ? "#ffcc4d" : "#9a73ff"} />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r={r} className="quiz-track" />
          <circle cx="60" cy="60" r={r} className="quiz-arc" stroke="url(#quizGrad)" strokeDasharray={c} strokeDashoffset={c * (1 - ratio)} />
        </svg>
        <div className="quiz-score"><b>{Math.round(shown)}</b><span>/{total}</span></div>
      </div>
      <p className="quiz-verdict">{VERDICT[Math.round((score / Math.max(total, 1)) * 5)]}</p>
      <div className="quiz-stars" aria-label={`${score} of ${total} correct`}>
        {questions.map((q, i) => <span key={q.id} className={picks[i] === q.answer ? "on" : ""} style={{ ["--i" as string]: i }} />)}
      </div>
      <p className="quiz-record">Best today <b>{record.best}/{total}</b> · {record.plays} {record.plays === 1 ? "play" : "plays"}</p>
      <ul className="quiz-review">
        {questions.map((q, i) => {
          const ok = picks[i] === q.answer;
          return (
            <li key={q.id} className={ok ? "ok" : "miss"}>
              <span className="quiz-mark" aria-hidden="true">{ok ? "✓" : "✕"}</span>
              <span><span className="quiz-rq">{q.prompt}</span><span className="quiz-ra">{q.options[q.answer]}</span></span>
            </li>
          );
        })}
      </ul>
      <button className="btn primary quiz-go" type="button" onClick={onAgain}>Play again</button>
    </div>
  );
}

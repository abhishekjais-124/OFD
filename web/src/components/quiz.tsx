import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { QuizQuestion, QuizResponse } from "@shared/quiz";
import { formatShortDateIST } from "@shared/ist";
import { api } from "../api.ts";
import { play, setSoundOn, soundOn } from "../sound.ts";
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

const SpeakerIcon = ({ on }: { on: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    {on ? <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /> : <path d="M16 9.5l5 5M21 9.5l-5 5" />}
  </svg>
);

/** Quiz of the day: an intro card on the Daily page that opens a full-screen, replayable quiz. */
export function QuizCard({ date }: { date: string }) {
  const [quiz, setQuiz] = useState<QuizResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [record, setRecord] = useState(() => loadRecord(date));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    setQuiz(null);
    setFailed(false);
    setOpen(false);
    setRecord(loadRecord(date));
    api.quiz(date).then((r) => live && setQuiz(r.data), () => live && setFailed(true));
    return () => { live = false; };
  }, [date]);

  const questions = quiz?.questions ?? [];
  const start = () => { play("start"); setOpen(true); };

  return (
    <article className="quiz-card fade-in">
      <div className="quiz-card-glow" aria-hidden="true" />
      <p className="dx-label"><span className="dx-ico" aria-hidden="true">{Icon.check()}</span>Quiz of the day</p>
      {!quiz && !failed && <p className="quiz-card-text">Shuffling questions{"…"}</p>}
      {failed && <p className="quiz-card-text">The quiz could not load. Pull to refresh and try again.</p>}
      {quiz && questions.length === 0 && <p className="quiz-card-text">Not enough Daily pages yet. The quiz starts once a few days have built up.</p>}
      {quiz && questions.length > 0 && (
        <>
          <h3 className="quiz-card-title">How much do you remember?</h3>
          <p className="quiz-card-text">{questions.length} questions from your last {quiz.days} Daily {quiz.days === 1 ? "page" : "pages"}</p>
          <div className="quiz-chips">
            <span>{questions.length} questions</span>
            <span>3 choices</span>
            <span>~1 min</span>
            {record && <span className="best">Best {record.best}/{questions.length}</span>}
          </div>
          <button className="quiz-start" type="button" onClick={start}>
            <span>{record ? "Play again" : "Start quiz"}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg>
          </button>
        </>
      )}
      {open && questions.length > 0 && createPortal(
        <QuizPlayer questions={questions} onDone={(score) => { const r = saveRecord(date, score); setRecord(r); return r; }} onClose={() => setOpen(false)} />,
        document.body,
      )}
    </article>
  );
}

function QuizPlayer({ questions, onDone, onClose }: { questions: QuizQuestion[]; onDone: (score: number) => QuizRecord; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [picks, setPicks] = useState<number[]>([]);
  const [record, setRecord] = useState<QuizRecord | null>(null);
  const [sound, setSound] = useState(soundOn);
  const total = questions.length;
  const q = questions[index]!;
  const pick = picks[index];
  const answered = pick !== undefined;
  const score = picks.filter((p, i) => p === questions[i]!.answer).length;

  // a full-screen layer: keep the page behind it still, close on Escape
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const choose = (i: number) => {
    if (answered) return;
    setPicks([...picks, i]);
    play(i === q.answer ? "right" : "wrong");
    navigator.vibrate?.(i === q.answer ? 12 : [30, 40, 30]);
  };
  const next = () => {
    if (index + 1 < total) { play("tap"); setIndex(index + 1); return; }
    const r = onDone(score);
    play(score === total ? "perfect" : "reveal");
    setRecord(r);
  };
  const again = () => { play("start"); setPicks([]); setIndex(0); setRecord(null); };
  const toggleSound = () => { const on = !sound; setSoundOn(on); setSound(on); if (on) play("tap"); };

  return (
    <div className="qz" role="dialog" aria-modal="true" aria-label="Quiz of the day">
      <div className="qz-bg" aria-hidden="true" />
      <header className="qz-top">
        <button className="qz-icon" type="button" onClick={onClose} aria-label="Close quiz">{Icon.x()}</button>
        {!record ? (
          <div className="qz-progress" aria-label={`Question ${index + 1} of ${total}`}>
            {questions.map((qq, i) => (
              <span key={qq.id} className={i < picks.length ? (picks[i] === qq.answer ? "ok" : "miss") : i === index ? "now" : ""} />
            ))}
          </div>
        ) : <p className="qz-title">Quiz of the day</p>}
        <button className="qz-icon" type="button" onClick={toggleSound} aria-label={sound ? "Mute sounds" : "Turn sounds on"} aria-pressed={sound}><SpeakerIcon on={sound} /></button>
      </header>

      {!record ? (
        <main className="qz-body" key={q.id}>
          <p className="qz-count">Question {index + 1} <span>of {total}</span></p>
          <p className="qz-meta"><span className={`qz-tag ${q.kind}`}>{KIND_LABEL[q.kind]}</span>from {formatShortDateIST(q.from)}</p>
          <h2 className="qz-prompt">{q.prompt}</h2>
          {q.detail && <blockquote className={`qz-detail${q.kind === "quote" ? " quote" : ""}`}>{q.detail}</blockquote>}
          <div className="qz-opts" role="radiogroup">
            {q.options.map((o, i) => {
              const state = !answered ? "" : i === q.answer ? " right" : i === pick ? " wrong" : " dim";
              return (
                <button key={i} type="button" role="radio" aria-checked={pick === i} disabled={answered} className={`qz-opt${state}`} style={{ ["--i" as string]: i }} onClick={() => choose(i)}>
                  <span className="qz-letter">{answered && i === q.answer ? "✓" : answered && i === pick ? "✕" : "ABC"[i]}</span>
                  <span className="qz-opt-text">{o}</span>
                </button>
              );
            })}
          </div>
        </main>
      ) : (
        <Reveal questions={questions} picks={picks} record={record} />
      )}

      <footer className="qz-foot">
        {!record && answered && (
          <div className={`qz-feedback ${pick === q.answer ? "ok" : "miss"}`}>
            <b>{pick === q.answer ? "Correct!" : "Not quite"}</b>
            {pick !== q.answer && <span>Answer: {q.options[q.answer]}</span>}
          </div>
        )}
        {!record ? (
          <button className="qz-cta" type="button" disabled={!answered} onClick={next}>{index + 1 === total ? "See my score" : "Next question"}</button>
        ) : (
          <div className="qz-cta-row">
            <button className="qz-cta ghost" type="button" onClick={onClose}>Done</button>
            <button className="qz-cta" type="button" onClick={again}>Play again</button>
          </div>
        )}
      </footer>
    </div>
  );
}

const VERDICT = [
  ["Fresh start", "Every expert was once a beginner."],
  ["Warming up", "A little revision goes a long way."],
  ["Getting there", "You're building the habit."],
  ["Nicely done", "Your memory is in good shape."],
  ["Sharp memory", "Just one away from perfect."],
  ["Perfect score", "You remembered everything."],
] as const;

function Reveal({ questions, picks, record }: { questions: QuizQuestion[]; picks: number[]; record: QuizRecord }) {
  const total = questions.length;
  const score = picks.filter((p, i) => p === questions[i]!.answer).length;
  const [shown, setShown] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 1200);
      setShown(score * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [score]);
  const r = 70;
  const c = 2 * Math.PI * r;
  const ratio = total ? shown / total : 0;
  const tier = score === total ? "gold" : score / total >= 0.6 ? "good" : "low";
  const [title, line] = VERDICT[Math.round((score / Math.max(total, 1)) * 5)]!;
  const newBest = record.plays > 1 && score === record.best && score > 0;
  return (
    <main className={`qz-body qz-reveal ${tier}`}>
      {tier !== "low" && (
        <div className="qz-burst" aria-hidden="true">{Array.from({ length: tier === "gold" ? 28 : 14 }, (_, i) => <i key={i} style={{ ["--i" as string]: i }} />)}</div>
      )}
      <div className="qz-ring">
        <svg viewBox="0 0 160 160" aria-hidden="true">
          <defs>
            <linearGradient id="qzGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={tier === "gold" ? "#ffe08a" : "#6f86ff"} />
              <stop offset="100%" stopColor={tier === "gold" ? "#ff9f43" : "#b08bff"} />
            </linearGradient>
          </defs>
          <circle cx="80" cy="80" r={r} className="qz-track" />
          <circle cx="80" cy="80" r={r} className="qz-arc" stroke="url(#qzGrad)" strokeDasharray={c} strokeDashoffset={c * (1 - ratio)} />
        </svg>
        <div className="qz-score"><b>{Math.round(shown)}</b><span>/{total}</span></div>
      </div>
      <h2 className="qz-verdict">{title}</h2>
      <p className="qz-line">{line}</p>
      <div className="qz-dots" aria-label={`${score} of ${total} correct`}>
        {questions.map((q, i) => <span key={q.id} className={picks[i] === q.answer ? "on" : ""} style={{ ["--i" as string]: i }} />)}
      </div>
      <p className="qz-best">{newBest ? "New best today!" : <>Best today <b>{record.best}/{total}</b></>} · {record.plays} {record.plays === 1 ? "play" : "plays"}</p>
      <ul className="qz-review">
        {questions.map((q, i) => {
          const ok = picks[i] === q.answer;
          return (
            <li key={q.id} className={ok ? "ok" : "miss"} style={{ ["--i" as string]: i }}>
              <span className="qz-mark" aria-hidden="true">{ok ? "✓" : "✕"}</span>
              <span><span className="qz-rq">{q.prompt}</span><span className="qz-ra">{q.options[q.answer]}</span></span>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

import type { ReactNode } from "react";
import { formatDateTimeIST, formatLongDateIST } from "@shared/ist";
import { Icon } from "./ui.tsx";

export function Skeleton() {
  return (
    <div className="fade-in" aria-busy="true" aria-label="Loading briefing">
      <div className="hero">
        <div className="skeleton" style={{ width: 90, height: 12 }} />
        <div className="skeleton" style={{ width: "70%", height: 30 }} />
        <div className="skeleton" style={{ width: "45%", height: 16 }} />
      </div>
      <div className="stack">
        {[0, 1, 2].map((i) => (
          <div className="card sk-card" key={i}>
            <div className="skeleton" style={{ width: "55%", height: 16 }} />
            <div className="skeleton" style={{ width: "92%" }} />
            <div className="skeleton" style={{ width: "80%" }} />
            <div className="skeleton" style={{ width: "100%", height: 38, borderRadius: 10 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function MissingState({ date, latest, onShowLatest, onRetry, busy }: { date: string; latest: string | null; onShowLatest: () => void; onRetry: () => void; busy: boolean }) {
  return (
    <div className="state card fade-in">
      <span className="eyebrow">Nothing yet</span>
      <h2>No briefing for {formatLongDateIST(date)} yet</h2>
      <p>The daily routine usually writes the file around 9:00 AM IST. Nothing from another day is shown as today's.</p>
      <div className="actions-row">
        <button className="btn primary" onClick={onRetry} disabled={busy}>{Icon.refresh(busy ? "spin" : undefined)} Check again</button>
        {latest && <button className="btn" onClick={onShowLatest}>Show last available: {formatLongDateIST(latest)}</button>}
      </div>
    </div>
  );
}

const HINTS: Record<string, string> = {
  drive_not_configured: "Set DRIVE_FOLDER_ID and a credential in .env, or upload the PDF below.",
  drive_no_access: "The identity OFD uses cannot open the folder. Share the folder with the service account, or use the owner's OAuth token. The upload below always works.",
  drive_network: "Could not reach Google Drive. Check the connection and retry.",
  pdf_password_protected: "The file is password protected. OFD never guesses passwords; export an unprotected copy.",
  pdf_corrupted: "The file could not be parsed. Refresh to download it again, or upload a fresh copy.",
  pdf_not_pdf: "The file is not a PDF.",
  not_cached: "There is nothing cached for this document; refresh it from Drive or upload it again.",
};

export function ErrorState({ code, message, retryable, onRetry, busy, children }: { code: string; message: string; retryable: boolean; onRetry: () => void; busy: boolean; children?: ReactNode }) {
  return (
    <div className="state card danger fade-in" role="alert">
      <span className="eyebrow">Something went wrong</span>
      <h2>{titleFor(code)}</h2>
      <p>{message}</p>
      {HINTS[code] && <p className="small">{HINTS[code]}</p>}
      <div className="actions-row">
        {retryable !== false && <button className="btn primary" onClick={onRetry} disabled={busy}>{Icon.refresh(busy ? "spin" : undefined)} Retry</button>}
        {children}
      </div>
    </div>
  );
}

function titleFor(code: string): string {
  switch (code) {
    case "drive_not_configured": return "Drive is not configured";
    case "drive_no_access": return "No access to the Drive folder";
    case "drive_not_found": return "Folder or file not found";
    case "drive_network": return "Drive is unreachable";
    case "pdf_password_protected": return "Password-protected PDF";
    case "pdf_corrupted": return "Corrupted PDF";
    case "pdf_not_pdf": return "Not a PDF";
    case "parse_failed": return "The briefing could not be normalized";
    default: return "Could not load the briefing";
  }
}

export function OfflineBanner({ processedAt }: { processedAt: string | null }) {
  return (
    <div className="banner warn" role="status">
      {Icon.offline()}
      <div className="grow">Offline, showing data from {processedAt ? formatDateTimeIST(new Date(processedAt)) : "the last visit"}.</div>
    </div>
  );
}

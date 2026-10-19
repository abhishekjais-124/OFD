import { useCallback, useRef, useState, type DragEvent } from "react";
import { Icon } from "./ui.tsx";

export function Upload({ onFile, busy }: { onFile: (f: File) => void; busy: boolean }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const take = useCallback((files: FileList | null) => {
    const f = files?.[0];
    if (f) onFile(f);
  }, [onFile]);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    take(e.dataTransfer.files);
  };
  return (
    <div
      className={`drop${over ? " over" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <input ref={input} type="file" accept="application/pdf,.pdf" onChange={(e) => take(e.target.files)} />
      <p><strong>Drop a briefing PDF here</strong><br /><span className="small">or</span></p>
      <div className="actions-row" style={{ justifyContent: "center", marginTop: 10 }}>
        <button className="btn" type="button" onClick={() => input.current?.click()} disabled={busy}>{Icon.upload()} Choose a PDF</button>
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>Same pipeline as Drive: sections, links, images, tables and OCR fallback.</p>
    </div>
  );
}

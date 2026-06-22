"use client";

import { useEffect, useRef, useState } from "react";

export default function JobConsole({ jobId, title, onDone }) {
  const [lines, setLines] = useState([]);
  const [status, setStatus] = useState("running");
  const boxRef = useRef(null);

  useEffect(() => {
    if (!jobId) return;
    setLines([]);
    setStatus("running");
    const es = new EventSource(`/api/jobs/${jobId}/stream`);
    es.addEventListener("log", (e) => {
      const entry = JSON.parse(e.data);
      setLines((prev) => [...prev, entry]);
    });
    es.addEventListener("end", (e) => {
      const { status } = JSON.parse(e.data);
      setStatus(status);
      es.close();
      onDone?.(status);
    });
    es.onerror = () => es.close();
    return () => es.close();
  }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  if (!jobId) return null;

  return (
    <div className="card">
      <div className="flex-between" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 16 }}>{title || "Build log"}</h3>
        <span className={`status-pill ${status}`}>
          {status === "running" ? "running…" : status}
        </span>
      </div>
      <div className="console" ref={boxRef}>
        {lines.map((l, i) => (
          <span key={i} className={`l-${l.kind}`}>{l.line + "\n"}</span>
        ))}
        {lines.length === 0 && <span className="muted">Starting…</span>}
      </div>
    </div>
  );
}

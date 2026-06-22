"use client";

import { useState } from "react";
import Nav from "@/components/Nav";
import JobConsole from "@/components/JobConsole";

const TYPES = [
  { value: "static-vite", label: "static-vite — Vite/React (serves dist/)" },
  { value: "static-flutter", label: "static-flutter — Flutter web (serves build/web/)" },
  { value: "nextjs", label: "nextjs — full-stack (Docker image)" },
  { value: "docker-service", label: "docker-service — own docker-compose" },
];

export default function Deploy() {
  const [name, setName] = useState("");
  const [repo, setRepo] = useState("");
  const [type, setType] = useState("static-vite");
  const [job, setJob] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setJob(null);
    setBusy(true);
    const res = await fetch("/api/deploy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), repo: repo.trim(), type }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) setJob({ id: data.jobId, title: `Deploying ${name}` });
    else setErr(data.error);
  }

  return (
    <>
      <Nav />
      <div className="container">
        <div className="page-head">
          <h1>Deploy a new site</h1>
          <p>Clone a repo, build it, register it with the proxy, and start the container.</p>
        </div>

        {err && <div className="banner err">{err}</div>}

        <form className="card" onSubmit={submit}>
          <div className="row">
            <div className="field">
              <label>App name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="my_app" />
              <div className="hint">Lowercase, no spaces (a–z, 0–9, _ , -). Becomes the container + folder name.</div>
            </div>
            <div className="field">
              <label>App type</label>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label>Git repository URL</label>
            <input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="https://github.com/you/repo.git" />
            <div className="hint">Must be cloneable from this server (public, or SSH key / token configured).</div>
          </div>
          <button className="btn btn-primary" disabled={busy || !name || !repo}>
            {busy ? "Starting…" : "Deploy"}
          </button>
        </form>

        {job && (
          <div style={{ marginTop: 20 }}>
            <JobConsole jobId={job.id} title={job.title} />
            <p className="hint" style={{ marginTop: 12 }}>
              When this finishes, add a Proxy Host in NPM → forward to hostname <code>{name}</code>, port <code>80</code>.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

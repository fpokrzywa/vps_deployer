"use client";

import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import JobConsole from "@/components/JobConsole";

export default function Update() {
  const [sites, setSites] = useState([]);
  const [name, setName] = useState("");
  const [job, setJob] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/sites", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setSites(d.sites || []);
        if (d.sites?.[0]) setName(d.sites[0].name);
      })
      .catch((e) => setErr(e.message));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setJob(null);
    setBusy(true);
    const res = await fetch("/api/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) setJob({ id: data.jobId, title: `Updating ${name}` });
    else setErr(data.error);
  }

  const selected = sites.find((s) => s.name === name);

  return (
    <>
      <Nav />
      <div className="container">
        <div className="page-head">
          <h1>Update a site</h1>
          <p>Pull the latest from git, rebuild, and restart the container.</p>
        </div>

        {err && <div className="banner err">{err}</div>}

        <form className="card" onSubmit={submit}>
          <div className="field">
            <label>Site</label>
            <select value={name} onChange={(e) => setName(e.target.value)}>
              {sites.map((s) => (
                <option key={s.name} value={s.name}>{s.name} ({s.type})</option>
              ))}
            </select>
            {selected && <div className="hint">{selected.dir} · {selected.status}</div>}
          </div>
          <button className="btn btn-primary" disabled={busy || !name}>
            {busy ? "Starting…" : "Pull & rebuild"}
          </button>
        </form>

        {job && (
          <div style={{ marginTop: 20 }}>
            <JobConsole jobId={job.id} title={job.title} />
          </div>
        )}
      </div>
    </>
  );
}

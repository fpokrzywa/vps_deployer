"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import JobConsole from "@/components/JobConsole";

export default function Dashboard() {
  const [sites, setSites] = useState(null);
  const [bind, setBind] = useState(null);
  const [err, setErr] = useState("");
  const [job, setJob] = useState(null); // { id, title }

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sites", { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to load");
      const data = await res.json();
      setSites(data.sites);
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => {
    load();
    fetch("/api/env", { cache: "no-store" })
      .then((r) => r.json())
      .then(setBind)
      .catch(() => {});
  }, [load]);

  async function update(name) {
    setJob(null);
    const res = await fetch("/api/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (res.ok) setJob({ id: data.jobId, title: `Updating ${name}` });
    else setErr(data.error);
  }

  return (
    <>
      <Nav />
      <div className="container">
        <div className="page-head flex-between">
          <div>
            <h1>Deployed sites</h1>
            <p>{sites ? `${sites.length} site${sites.length === 1 ? "" : "s"} on this VPS` : "Loading…"}</p>
          </div>
          <Link href="/deploy" className="btn btn-primary btn-sm">+ Deploy new site</Link>
        </div>

        {bind && (
          <div className="bind-strip">
            <span className={`bind-item ${bind.networkExists ? "ok" : "bad"}`}>
              <span className="led" /> network <code>{bind.network}</code>
              {bind.networkExists ? "" : " (missing)"}
            </span>
            <span className={`bind-item ${bind.npm.container && bind.npm.onNetwork ? "ok" : "bad"}`}>
              <span className="led" /> NPM{" "}
              {bind.npm.container ? (
                <>
                  <code>{bind.npm.container}</code> {bind.npm.onNetwork ? "· on network" : "· NOT on network"}
                </>
              ) : (
                "none running"
              )}
            </span>
            {bind.gateway && (
              <span className="bind-item">
                NPM reaches this app at <code>{bind.gateway}:{bind.port}</code>
              </span>
            )}
          </div>
        )}

        {err && <div className="banner err">{err}</div>}

        <div className="site-list">
          {sites?.map((s) => (
            <div className="site" key={s.name}>
              <div className={`dot-status ${s.running ? "up" : "down"}`}><span className="led" /></div>
              <div className="meta">
                <div className="name">{s.name}</div>
                <div className="sub">{s.dir} · {s.status}</div>
              </div>
              <span className="badge type">{s.type}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => update(s.name)}>Update</button>
            </div>
          ))}
          {sites?.length === 0 && <p className="muted">No sites yet. Deploy your first one.</p>}
        </div>

        {job && (
          <div style={{ marginTop: 20 }}>
            <JobConsole jobId={job.id} title={job.title} onDone={() => load()} />
          </div>
        )}
      </div>
    </>
  );
}

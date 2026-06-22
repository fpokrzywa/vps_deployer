"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Login() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (res.ok) {
      router.replace("/");
      router.refresh();
    } else {
      setErr("Invalid password");
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <h1 style={{ fontSize: 20, marginBottom: 4 }}>vps<span style={{ color: "var(--accent)" }}>·</span>deployer</h1>
        <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 18 }}>
          Sign in to manage deployments
        </p>
        {err && <div className="banner err">{err}</div>}
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={password}
            autoFocus
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        <button className="btn btn-primary" style={{ width: "100%" }} disabled={busy || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

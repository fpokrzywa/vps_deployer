"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function Nav() {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const is = (p) => (p === "/" ? path === "/" : path.startsWith(p));

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
  }

  const links = [
    { href: "/", label: "Dashboard" },
    { href: "/deploy", label: "Deploy" },
    { href: "/update", label: "Update" },
  ];

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <span className="brand">vps<span className="dot">·</span>deployer</span>
        <button className="nav-toggle" aria-label="Menu" onClick={() => setOpen((v) => !v)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {open ? (<><line x1="6" y1="6" x2="18" y2="18" /><line x1="6" y1="18" x2="18" y2="6" /></>)
                  : (<><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>)}
          </svg>
        </button>
        <nav className={`nav-links${open ? " open" : ""}`}>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={is(l.href) ? "active" : ""} onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
        </nav>
        <button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button>
      </div>
    </header>
  );
}

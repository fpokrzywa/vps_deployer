import { NextResponse } from "next/server";
import { passwordMatches, createSessionToken, COOKIE_NAME, COOKIE_MAX_AGE } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req) {
  let body = {};
  try {
    body = await req.json();
  } catch {}
  if (!passwordMatches(body.password)) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }
  const token = await createSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
}

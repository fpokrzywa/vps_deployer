import { NextResponse } from "next/server";
import { getJob } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  const job = getJob(params.id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { emitter, ...rest } = job;
  return NextResponse.json(rest);
}

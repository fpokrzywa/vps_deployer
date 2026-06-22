import { NextResponse } from "next/server";
import { getSite } from "@/lib/compose";
import { buildUpdateSteps } from "@/lib/deploy";
import { startJob } from "@/lib/jobs";

export const runtime = "nodejs";

export async function POST(req) {
  let body = {};
  try {
    body = await req.json();
  } catch {}
  const { name } = body;
  try {
    const site = await getSite(name);
    if (!site) return NextResponse.json({ error: `Unknown site: ${name}` }, { status: 404 });
    const { steps } = await buildUpdateSteps(site);
    const job = startJob({
      title: `Update ${site.name} (${site.type})`,
      kind: "update",
      target: site.name,
      steps,
    });
    return NextResponse.json({ jobId: job.id });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

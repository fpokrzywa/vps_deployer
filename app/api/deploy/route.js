import { NextResponse } from "next/server";
import { buildDeploySteps } from "@/lib/deploy";
import { startJob } from "@/lib/jobs";

export const runtime = "nodejs";

export async function POST(req) {
  let body = {};
  try {
    body = await req.json();
  } catch {}
  const { name, repo, type } = body;
  const valid = ["static-vite", "static-flutter", "nextjs", "docker-service"];
  if (!valid.includes(type)) {
    return NextResponse.json({ error: "Invalid app type" }, { status: 400 });
  }
  try {
    const { steps } = await buildDeploySteps({ name, repo, type });
    const job = startJob({
      title: `Deploy ${name} (${type})`,
      kind: "deploy",
      target: name,
      steps,
    });
    return NextResponse.json({ jobId: job.id });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

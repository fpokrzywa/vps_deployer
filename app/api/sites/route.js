import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { listSites } from "@/lib/compose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pexec = promisify(execFile);

async function dockerStatus() {
  try {
    const { stdout } = await pexec("docker", [
      "ps",
      "-a",
      "--format",
      "{{.Names}}\t{{.Status}}\t{{.Image}}",
    ]);
    const map = {};
    for (const line of stdout.trim().split("\n")) {
      if (!line) continue;
      const [name, status, image] = line.split("\t");
      map[name] = { status, image, running: /^Up/.test(status) };
    }
    return map;
  } catch {
    return {};
  }
}

export async function GET() {
  try {
    const [sites, status] = await Promise.all([listSites(), dockerStatus()]);
    const enriched = sites.map((s) => ({
      ...s,
      status: status[s.container]?.status || "not created",
      running: status[s.container]?.running || false,
    }));
    return NextResponse.json({ sites: enriched });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

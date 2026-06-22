import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PROXY_NETWORK, PORT, COMPOSE_PATH } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pexec = promisify(execFile);

async function dockerJson(args) {
  try {
    const { stdout } = await pexec("docker", args);
    return stdout.trim();
  } catch {
    return "";
  }
}

export async function GET() {
  // Gateway IP of the proxy network (what NPM uses to reach this host).
  const gateway = await dockerJson([
    "network",
    "inspect",
    PROXY_NETWORK,
    "-f",
    "{{range .IPAM.Config}}{{.Gateway}}{{end}}",
  ]);

  // Detect a running Nginx Proxy Manager and whether it's on the proxy network.
  const psList = await dockerJson(["ps", "--format", "{{.Names}}|{{.Image}}"]);
  let npmContainer = null;
  for (const line of psList.split("\n")) {
    const [name, image] = line.split("|");
    if (image && image.includes("nginx-proxy-manager")) {
      npmContainer = name;
      break;
    }
  }

  let npmOnNetwork = false;
  if (npmContainer) {
    const nets = await dockerJson([
      "inspect",
      npmContainer,
      "-f",
      "{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}",
    ]);
    npmOnNetwork = nets.split(/\s+/).includes(PROXY_NETWORK);
  }

  return NextResponse.json({
    network: PROXY_NETWORK,
    networkExists: Boolean(gateway),
    gateway: gateway || null,
    port: PORT,
    composePath: COMPOSE_PATH,
    npm: { container: npmContainer, onNetwork: npmOnNetwork },
  });
}

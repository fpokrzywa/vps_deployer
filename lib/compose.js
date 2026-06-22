// Read and edit /root/prxyman/docker-compose.yml the same way the
// deploy-site / update-site skills do.
import { readFile, writeFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import YAML from "yaml";

export const PRXY_DIR = "/root/prxyman";
export const COMPOSE_PATH = `${PRXY_DIR}/docker-compose.yml`;
export const ROOT = "/root";

// Services that are infrastructure, not deployable sites.
const INFRA = new Set(["npm", "oauth2-proxy"]);

export async function fileExists(p) {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

// Infer app type + directory from a compose service definition, mirroring the
// update-site rules.
function inferFromService(name, svc) {
  const vols = svc.volumes || [];
  const mount = vols.find((v) => typeof v === "string" && v.includes(":/usr/share/nginx/html"));
  if (mount) {
    const hostPath = mount.split(":")[0];
    if (hostPath.endsWith("/dist")) {
      return { type: "static-vite", dir: hostPath.replace(/\/dist$/, "") };
    }
    if (hostPath.endsWith("/build/web")) {
      return { type: "static-flutter", dir: hostPath.replace(/\/build\/web$/, "") };
    }
  }
  // Custom image (or a build:) => treat as nextjs-style app dir /root/<name>.
  return { type: "nextjs", dir: `${ROOT}/${name}` };
}

export async function listSites() {
  const raw = await readFile(COMPOSE_PATH, "utf8");
  const doc = YAML.parse(raw) || {};
  const services = doc.services || {};
  const sites = [];
  for (const [name, svc] of Object.entries(services)) {
    if (INFRA.has(name)) continue;
    const { type, dir } = inferFromService(name, svc);
    sites.push({
      name,
      type,
      dir,
      container: svc.container_name || name,
      image: svc.image || null,
    });
  }
  return sites.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getSite(name) {
  const sites = await listSites();
  return sites.find((s) => s.name === name) || null;
}

export async function serviceExists(name) {
  const raw = await readFile(COMPOSE_PATH, "utf8");
  const doc = YAML.parse(raw) || {};
  return Boolean(doc.services && doc.services[name]);
}

function titleCase(name) {
  return name.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Build the YAML service block text for a given app type.
function serviceBlock(name, type) {
  const head = `  # ${titleCase(name)}\n  ${name}:\n`;
  if (type === "static-vite" || type === "static-flutter") {
    const sub = type === "static-vite" ? "dist" : "build/web";
    return (
      head +
      `    image: nginx:alpine\n` +
      `    container_name: ${name}\n` +
      `    restart: unless-stopped\n` +
      `    volumes:\n` +
      `      - ${ROOT}/${name}/${sub}:/usr/share/nginx/html:ro\n` +
      `    expose:\n      - '80'\n` +
      `    networks:\n      - proxy\n`
    );
  }
  // nextjs
  return (
    head +
    `    image: ${name}-app\n` +
    `    container_name: ${name}\n` +
    `    restart: unless-stopped\n` +
    `    env_file:\n      - ${ROOT}/${name}/.env\n` +
    `    expose:\n      - '80'\n` +
    `    networks:\n      - proxy\n`
  );
}

// Insert a new service before the top-level `networks:` block, preserving the
// rest of the file (and its comments) verbatim.
export async function addService(name, type) {
  const raw = await readFile(COMPOSE_PATH, "utf8");
  const block = serviceBlock(name, type);
  const marker = /\nnetworks:/;
  if (!marker.test(raw)) {
    throw new Error("Could not find a top-level `networks:` block in docker-compose.yml");
  }
  const updated = raw.replace(marker, `\n${block}\n\nnetworks:`);
  await writeFile(COMPOSE_PATH, updated, "utf8");
}

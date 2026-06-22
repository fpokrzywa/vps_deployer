// Build the step pipelines for deploy and update, per app type.
// Mirrors the deploy-site / update-site skills, with the hard-won fixes baked in
// (Prisma/openssl Dockerfile, next.config standalone, AUTH_TRUST_HOST reminder).
import { readFile, writeFile } from "node:fs/promises";
import { ROOT, PRXY_DIR, addService, serviceExists, fileExists } from "./compose.js";

const FLUTTER_BIN = "/root/flutter/bin";

export function validateName(name) {
  if (!name || !/^[a-z0-9][a-z0-9_-]*$/.test(name)) {
    throw new Error(
      "App name must be lowercase letters/numbers/underscores/hyphens, no spaces."
    );
  }
  return name;
}

const NEXT_DOCKERFILE = `FROM node:20-alpine AS builder
WORKDIR /app
# openssl lets Prisma detect the correct query engine (linux-musl-openssl-3.0.x)
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=80
# openssl runtime lib (libssl) required by the Prisma query engine
RUN apk add --no-cache openssl
RUN addgroup --system --gid 1001 nextjs && adduser --system --uid 1001 nextjs
USER nextjs
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 80
CMD ["node", "server.js"]
`;

// Ensure a Next.js project will produce a standalone build + has a Dockerfile.
async function prepareNextProject(dir, log) {
  const dockerfile = `${dir}/Dockerfile`;
  if (!(await fileExists(dockerfile))) {
    await writeFile(dockerfile, NEXT_DOCKERFILE, "utf8");
    log("Created Dockerfile (with openssl + standalone runtime).");
  } else {
    log("Dockerfile already present — leaving it as-is.");
  }

  // Make sure next.config has output: 'standalone'.
  for (const cfg of ["next.config.mjs", "next.config.js"]) {
    const p = `${dir}/${cfg}`;
    if (await fileExists(p)) {
      let src = await readFile(p, "utf8");
      if (!/output\s*:\s*['"]standalone['"]/.test(src)) {
        if (/const\s+nextConfig\s*=\s*\{/.test(src)) {
          src = src.replace(/const\s+nextConfig\s*=\s*\{/, (m) => `${m}\n  output: 'standalone',`);
          await writeFile(p, src, "utf8");
          log(`Patched ${cfg} with output: 'standalone'.`);
        } else {
          log(`WARNING: could not auto-add output:'standalone' to ${cfg} — add it manually.`);
        }
      }
      break;
    }
  }

  // Ensure a public/ dir exists so the Docker COPY of /app/public succeeds.
  if (!(await fileExists(`${dir}/public`))) {
    await writeFile(`${dir}/public/.gitkeep`, "", "utf8").catch(() => {});
  }
}

// ---- DEPLOY (new site) ----
export async function buildDeploySteps({ name, repo, type }) {
  validateName(name);
  if (!repo || !/^https?:\/\/|^git@/.test(repo)) {
    throw new Error("Repo URL must be an http(s) or git@ URL.");
  }
  const dir = `${ROOT}/${name}`;
  const steps = [];

  steps.push({
    label: "Check for existing deployment",
    fn: async ({ log }) => {
      if (await fileExists(dir)) throw new Error(`${dir} already exists. Use Update instead.`);
      if (type !== "docker-service" && (await serviceExists(name)))
        throw new Error(`A service named "${name}" already exists in docker-compose.yml.`);
      log(`Target directory: ${dir}`);
    },
  });

  steps.push({ label: "Clone repository", cmd: "git", args: ["clone", repo, dir], cwd: ROOT });

  steps.push({
    label: "Set up environment file",
    fn: async ({ log, run }) => {
      for (const ex of [".env.example", ".env.template"]) {
        if ((await fileExists(`${dir}/${ex}`)) && !(await fileExists(`${dir}/.env`))) {
          await run({ label: `cp ${ex} .env`, cmd: "cp", args: [ex, ".env"], cwd: dir });
          log("NOTE: copied env template to .env — edit it on the server if values are required.");
          if (type === "nextjs") log("NOTE: for Auth.js apps, set AUTH_TRUST_HOST=true in .env.");
          return;
        }
      }
      log("No .env.example/.env.template found — skipping.");
    },
  });

  addBuildAndRegister(steps, { name, dir, type });
  return { dir, steps };
}

// ---- UPDATE (existing site) ----
export async function buildUpdateSteps(site) {
  const { name, dir, type } = site;
  const steps = [];
  steps.push({
    label: "Verify directory",
    fn: async ({ log }) => {
      if (!(await fileExists(dir))) throw new Error(`${dir} does not exist.`);
      log(`Updating ${name} (${type}) in ${dir}`);
    },
  });
  steps.push({ label: "git pull", cmd: "git", args: ["pull"], cwd: dir });
  addBuildAndRegister(steps, { name, dir, type, update: true });
  steps.push({
    label: "Report version",
    fn: async ({ run }) => {
      await run({ label: "git log -1", cmd: "git", args: ["log", "-1", "--oneline"], cwd: dir });
    },
  });
  return { dir, steps };
}

// Shared: build per type, register in compose (deploy only), (re)start container.
function addBuildAndRegister(steps, { name, dir, type, update = false }) {
  if (type === "static-vite") {
    steps.push({ label: "npm install", cmd: "npm", args: ["install"], cwd: dir });
    steps.push({ label: "npm run build", cmd: "npm", args: ["run", "build"], cwd: dir });
    if (!update) registerStep(steps, name, type);
    restartStep(steps, name, update ? "restart" : "up");
  } else if (type === "static-flutter") {
    const env = { PATH: `${FLUTTER_BIN}:${process.env.PATH}` };
    steps.push({ label: "flutter pub get", cmd: "flutter", args: ["pub", "get"], cwd: dir, env });
    steps.push({ label: "flutter build web", cmd: "flutter", args: ["build", "web"], cwd: dir, env });
    if (!update) registerStep(steps, name, type);
    restartStep(steps, name, update ? "restart" : "up");
  } else if (type === "nextjs") {
    steps.push({ label: "Prepare Next.js project", fn: async ({ log }) => prepareNextProject(dir, log) });
    steps.push({ label: "npm install", cmd: "npm", args: ["install"], cwd: dir });
    steps.push({ label: "npm run build", cmd: "npm", args: ["run", "build"], cwd: dir });
    steps.push({ label: "docker build", cmd: "docker", args: ["build", "-t", `${name}-app`, "."], cwd: dir });
    if (!update) registerStep(steps, name, type);
    // For nextjs we must recreate (up -d), not restart, to pick up the new image.
    restartStep(steps, name, "up");
  } else if (type === "docker-service") {
    steps.push({
      label: "docker compose up -d --build",
      cmd: "docker",
      args: ["compose", "up", "-d", "--build"],
      cwd: dir,
    });
  } else {
    throw new Error(`Unknown app type: ${type}`);
  }
}

function registerStep(steps, name, type) {
  steps.push({
    label: "Register service in proxy docker-compose.yml",
    fn: async ({ log }) => {
      await addService(name, type);
      log(`Added "${name}" service to ${PRXY_DIR}/docker-compose.yml`);
    },
  });
}

function restartStep(steps, name, mode) {
  const args =
    mode === "up" ? ["compose", "up", "-d", name] : ["compose", "restart", name];
  steps.push({ label: `docker ${args.join(" ")}`, cmd: "docker", args, cwd: PRXY_DIR });
  steps.push({
    label: "Verify container",
    fn: async ({ run }) => {
      await run({
        label: `docker ps (${name})`,
        cmd: "docker",
        args: ["ps", "--filter", `name=${name}`, "--format", "{{.Names}}\t{{.Status}}"],
      });
    },
  });
}

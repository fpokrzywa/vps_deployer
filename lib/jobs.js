// In-memory job manager. Persists for the lifetime of the Node process (the app
// runs as a single long-lived host process, so a module singleton is fine).
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";

// Survive dev hot-reloads by stashing on globalThis.
const store =
  globalThis.__deployerJobs ||
  (globalThis.__deployerJobs = { jobs: new Map(), seq: 1 });

function newId() {
  return `job_${Date.now().toString(36)}_${store.seq++}`;
}

export function getJob(id) {
  return store.jobs.get(id) || null;
}

export function listJobs() {
  return [...store.jobs.values()].map(({ emitter, ...rest }) => rest);
}

// Run a shell command, streaming output into the job. Returns a promise that
// resolves on exit 0 and rejects otherwise.
function runCommand(job, { label, cmd, args, cwd, env }) {
  return new Promise((resolve, reject) => {
    append(job, "step", `\n$ ${label || `${cmd} ${(args || []).join(" ")}`}`);
    const child = spawn(cmd, args || [], {
      cwd: cwd || "/root",
      env: { ...process.env, ...(env || {}) },
      shell: false,
    });
    child.stdout.on("data", (d) => append(job, "out", d.toString()));
    child.stderr.on("data", (d) => append(job, "out", d.toString()));
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`"${label || cmd}" exited with code ${code}`));
    });
  });
}

function append(job, kind, text) {
  for (const line of text.split("\n")) {
    if (line === "" && kind === "out") continue;
    const entry = { t: Date.now(), kind, line };
    job.logs.push(entry);
    job.emitter.emit("log", entry);
  }
}

// steps: array of either
//   { label, cmd, args, cwd, env }                  -> shell command
//   { label, fn: async (helpers) => {...} }         -> arbitrary JS step
// helpers = { log(line), run(commandSpec) }
export function startJob({ title, kind, target, steps }) {
  const id = newId();
  const job = {
    id,
    title,
    kind, // 'deploy' | 'update'
    target, // app name
    status: "running",
    logs: [],
    startedAt: Date.now(),
    endedAt: null,
    emitter: new EventEmitter(),
  };
  job.emitter.setMaxListeners(0);
  store.jobs.set(id, job);

  const helpers = {
    log: (line) => append(job, "info", line),
    run: (spec) => runCommand(job, spec),
  };

  (async () => {
    try {
      for (const step of steps) {
        if (typeof step.fn === "function") {
          if (step.label) append(job, "step", `\n• ${step.label}`);
          await step.fn(helpers);
        } else {
          await runCommand(job, step);
        }
      }
      job.status = "success";
      append(job, "done", "\n✓ Completed successfully.");
    } catch (err) {
      job.status = "error";
      append(job, "error", `\n✗ ${err.message}`);
    } finally {
      job.endedAt = Date.now();
      job.emitter.emit("end");
    }
  })();

  return job;
}

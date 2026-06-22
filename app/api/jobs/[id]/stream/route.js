import { getJob } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Server-Sent Events stream of a job's logs + final status.
export async function GET(_req, { params }) {
  const job = getJob(params.id);
  if (!job) return new Response("not found", { status: 404 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (event, data) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      // Replay existing logs first.
      for (const entry of job.logs) send("log", entry);

      if (job.status !== "running") {
        send("end", { status: job.status });
        controller.close();
        return;
      }

      const onLog = (entry) => send("log", entry);
      const onEnd = () => {
        send("end", { status: getJob(params.id)?.status || "error" });
        job.emitter.off("log", onLog);
        controller.close();
      };
      job.emitter.on("log", onLog);
      job.emitter.once("end", onEnd);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

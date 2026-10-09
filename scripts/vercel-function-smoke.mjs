/**
 * Local rehearsal of the deployed function: serves `api/index.mjs` — the exact
 * artifact Vercel runs — over real HTTP and drives the app's own flows through
 * it: sign-up, session, database writes, a real AI generation, the cron
 * contract and the serverless guards. Run it the way the platform runs the
 * function, with the environment outside the bundle:
 *
 *   node --env-file=.env scripts/vercel-function-smoke.mjs
 *
 * `VERCEL=1` is set before the import so every serverless code path (the
 * DATABASE_URL fail-fast, /tmp logging, the reminder freshness sync, the
 * backup refusal) is the one the deployment will take. The smoke account is
 * erased at the end, exactly like a student using the privacy page.
 */
import { existsSync, symlinkSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Vercel's node-file-trace ships the bundle's externals (better-auth, hono,
// postgres, …) in a node_modules beside the function. Locally the bundle sits
// at api/index.mjs where pnpm's isolated layout hides them, so point one
// junction at the server's own node_modules — same resolution, same modules.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_MODULES = join(ROOT, "api", "node_modules");
if (!existsSync(LOCAL_MODULES)) {
  symlinkSync(join(ROOT, "apps", "server", "node_modules"), LOCAL_MODULES, "junction");
}

process.env.VERCEL = "1";
process.env.CRON_SECRET ??= "local-smoke-secret";
const port = 0; // an ephemeral port: BASE_URL below names it for the auth check

const checks = [];
let failures = 0;

function check(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const server = createServer((_req, res) => {
    // The handler is attached after the port is known: BASE_URL must be set
    // before the function module loads, because that is when auth reads it.
    void handler(_req, res);
  });
  let handler;
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  process.env.BASE_URL = origin;

  const { default: loaded } = await import("../api/index.js");
  handler = loaded;

  const call = async (path, { method = "GET", body, headers = {}, jar } = {}) => {
    const response = await fetch(`${origin}${path}`, {
      method,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        ...(jar ? { cookie: jar } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not json — fine */
    }
    return { status: response.status, json, text, setCookie: response.headers.getSetCookie() };
  };

  const cookieJar = (setCookie) =>
    setCookie
      .map((line) => line.split(";")[0])
      .filter(Boolean)
      .join("; ");

  try {
    /* --- health: the platform's first request --------------------------- */
    const health = await call("/api/health");
    check("GET /api/health answers 200", health.status === 200, `status=${health.status}`);
    check(
      "the database driver is postgres, not the in-process fallback",
      health.json?.database?.driver === "postgres",
      `driver=${health.json?.database?.driver}`,
    );
    check("the AI provider reports configured", health.json?.ai?.configured === true);

    /* --- auth: Better Auth through the bundle --------------------------- */
    const email = `vercel-smoke-${Date.now()}@test.com`;
    const password = "Vercel-Smoke-2026!";
    const signup = await call("/api/auth/sign-up/email", {
      method: "POST",
      body: { email, password, name: "Vercel Smoke" },
      headers: { origin },
    });
    check(
      "POST /api/auth/sign-up/email creates an account",
      signup.status === 200,
      `status=${signup.status}`,
    );
    const jar = cookieJar(signup.setCookie);
    check("the session cookie comes back", jar.length > 0, jar.slice(0, 40));

    const me = await call("/api/me", { jar });
    check(
      "GET /api/me sees the signed-in user",
      me.json?.user?.email === email,
      `email=${me.json?.user?.email}`,
    );

    /* --- database: writes and reads through the function ---------------- */
    const subject = await call("/api/subjects", {
      method: "POST",
      body: { name: "Vercel Smoke" },
      jar,
    });
    const subjectId = subject.json?.subject?.id;
    check(
      "POST /api/subjects writes to the database",
      subject.status === 201 && Boolean(subjectId),
      `status=${subject.status}`,
    );

    const subjects = await call("/api/subjects", { jar });
    const list = subjects.json?.subjects;
    check(
      "GET /api/subjects lists it back",
      Array.isArray(list) && list.some((s) => s.name === "Vercel Smoke"),
      `count=${Array.isArray(list) ? list.length : "?"}`,
    );

    /* --- a real AI generation (Groq, server-side key) ------------------- */
    const note = await call("/api/notes", {
      method: "POST",
      body: { title: "Smoke note", bodyMd: "Photosynthesis is how plants turn light into sugar." },
      jar,
    });
    const noteId = note.json?.note?.id;
    check(
      "POST /api/notes creates a note",
      note.status === 201 && Boolean(noteId),
      `status=${note.status}`,
    );

    const explain = await call("/api/ai/explain", {
      method: "POST",
      body: { noteId, text: "In one sentence, what is photosynthesis?" },
      jar,
    });
    check(
      "POST /api/ai/explain returns a real generation",
      explain.status === 200 &&
        typeof explain.json?.text === "string" &&
        explain.json.text.length > 0,
      `status=${explain.status} text=${JSON.stringify(explain.json?.text ?? explain.text).slice(0, 80)}`,
    );

    /* --- reminders: the serverless freshness sync ----------------------- */
    const reminders = await call("/api/reminders", { jar });
    check(
      "GET /api/reminders answers 200 with the sync in the path",
      reminders.status === 200,
      `status=${reminders.status}`,
    );

    /* --- the cron contract ---------------------------------------------- */
    const cronOpen = await call("/api/cron/tick");
    check(
      "GET /api/cron/tick refuses a caller without the secret",
      cronOpen.status === 401,
      `status=${cronOpen.status}`,
    );
    const cronClosed = await call("/api/cron/tick", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    check(
      "GET /api/cron/tick runs for the platform's bearer token",
      cronClosed.status === 200 && cronClosed.json?.ok === true,
      `status=${cronClosed.status} accounts=${cronClosed.json?.accounts}`,
    );

    /* --- serverless guards ---------------------------------------------- */
    const backup = await call("/api/backup", { method: "POST", jar });
    check(
      "POST /api/backup refuses on a host with no disk (503)",
      backup.status === 503 && backup.json?.error === "backup_unavailable",
      `status=${backup.status}`,
    );
    const page = await call("/privacy");
    check(
      "a page path is a 404 for the function (the CDN rewrite owns pages)",
      page.status === 404 && page.json?.error === "not_found",
      `status=${page.status}`,
    );

    /* --- cleanup: the smoke account leaves nothing behind --------------- */
    const erase = await call("/api/erase", {
      method: "POST",
      body: { scope: "account", confirm: "ERASE" },
      jar,
    });
    check(
      "POST /api/erase removes the smoke account",
      erase.status === 200,
      `status=${erase.status}`,
    );
    const gone = await call("/api/auth/sign-in/email", {
      method: "POST",
      body: { email, password },
      headers: { origin },
    });
    check(
      "the smoke account is really gone (sign-in 401)",
      gone.status === 401,
      `status=${gone.status}`,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  console.log(`\n${checks.length - failures}/${checks.length} checks passed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("smoke harness crashed:", err);
  process.exit(1);
});

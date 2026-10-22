// Shared helpers for the prompt-recording hooks. Node built-ins only.
import fs from "node:fs";
import path from "node:path";

export function readInput() {
  try {
    return JSON.parse(fs.readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

export function projectRoot(input) {
  return process.env.CLAUDE_PROJECT_DIR || input.workspace?.project_dir || input.cwd || process.cwd();
}

export function recordsDir(root) {
  return path.join(root, "prompt-records");
}

export function statePath(root, sessionId) {
  return path.join(root, ".claude", "state", `${String(sessionId).replace(/[^\w-]/g, "_")}.json`);
}

// One Markdown file per session: <UTC date>_<first 8 characters of the session id>.md
export function sessionRecord(root, sessionId) {
  if (!sessionId) throw new Error("hook input had no session_id");
  const dir = recordsDir(root);
  fs.mkdirSync(dir, { recursive: true });
  const short = String(sessionId || "unknown").replace(/[^\w-]/g, "_").slice(0, 8);
  const existing = fs.readdirSync(dir).find((f) => f.endsWith(`_${short}.md`));
  if (existing) return path.join(dir, existing);
  const file = path.join(dir, `${new Date().toISOString().slice(0, 10)}_${short}.md`);
  fs.writeFileSync(file, `# Session ${sessionId}\n\n`);
  return file;
}

// A hook must never interrupt the student's work. Failures are logged for graders, not raised.
export function failOpen(name, root, fn) {
  try {
    fn();
  } catch (err) {
    try {
      fs.mkdirSync(recordsDir(root), { recursive: true });
      fs.appendFileSync(
        path.join(recordsDir(root), "_hook-errors.log"),
        `${new Date().toISOString()} ${name}: ${err?.stack || err}\n`
      );
    } catch {}
  }
  process.exit(0);
}

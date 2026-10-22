// Stop hook: after Claude finishes responding, appends the context window status
// to the current prompt record.
import fs from "node:fs";
import { readInput, projectRoot, sessionRecord, statePath, failOpen } from "./lib.mjs";

const input = readInput();
const root = projectRoot(input);
const FALLBACK_WINDOW = 200000; // only used when the status line snapshot is unavailable
const MAX_SNAPSHOT_AGE_MS = 120000;

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Exact figures from Claude Code's own context_window data, saved by statusline.mjs.
function fromStatusline() {
  try {
    const s = JSON.parse(fs.readFileSync(statePath(root, input.session_id), "utf8"));
    if (s.size && s.used != null && Date.now() - s.at < MAX_SNAPSHOT_AGE_MS) {
      return { used: s.used, size: s.size, source: "status line" };
    }
  } catch {}
  return null;
}

// Fallback: the last main-conversation API response in the transcript. Window size is assumed.
function fromTranscript() {
  const file = input.transcript_path;
  if (!file || !fs.existsSync(file)) return null;
  const fd = fs.openSync(file, "r");
  try {
    const { size } = fs.fstatSync(fd);
    const len = Math.min(size, 1 << 20);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    for (const line of buf.toString("utf8").split("\n").reverse()) {
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const u = entry.message?.usage;
      if (entry.type === "assistant" && !entry.isSidechain && u && entry.message.model !== "<synthetic>") {
        return {
          used: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0),
          size: Number(process.env.CLAUDE_CONTEXT_WINDOW) || FALLBACK_WINDOW,
          source: "transcript estimate, window size assumed",
        };
      }
    }
  } finally {
    fs.closeSync(fd);
  }
  return null;
}

failOpen("record-context", root, () => {
  sleep(600); // let the status line finish its debounced refresh for the last response
  const ctx = fromStatusline() ?? fromTranscript();
  const fmt = (n) => n.toLocaleString("en-US");
  const status = ctx
    ? `${fmt(ctx.used)} / ${fmt(ctx.size)} tokens (${((ctx.used / ctx.size) * 100).toFixed(1)}%) · ${ctx.source}`
    : "unavailable";
  fs.appendFileSync(
    sessionRecord(root, input.session_id),
    `**Context after response:** ${status} · ${new Date().toISOString()}\n\n`
  );
});

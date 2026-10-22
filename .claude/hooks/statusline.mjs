// Status line: shows context usage and saves a snapshot that record-context.mjs reads.
// Claude Code gives hooks no context data, but it does give it to the status line.
import fs from "node:fs";
import path from "node:path";
import { readInput, projectRoot, statePath } from "./lib.mjs";

const input = readInput();
const cw = input.context_window ?? {};
const used = cw.total_input_tokens ?? null; // input + cache tokens from the latest API response
const size = cw.context_window_size ?? null;
const k = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

try {
  if (input.session_id && size && used != null) {
    const file = statePath(projectRoot(input), input.session_id);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ used, size, at: Date.now() }));
    fs.renameSync(tmp, file);
  }
} catch {}

const pct = size && used != null ? Math.round((used / size) * 100) : 0;
console.log(`${input.model?.display_name ?? "Claude"} · context ${pct}% (${k(used ?? 0)}/${size ? k(size) : "?"})`);

// UserPromptSubmit hook: appends each prompt to prompt-records/<session>.md.
// Prints nothing to stdout, because UserPromptSubmit stdout is added to Claude's context.
import fs from "node:fs";
import { readInput, projectRoot, sessionRecord, failOpen } from "./lib.mjs";

const input = readInput();
const root = projectRoot(input);

failOpen("record-prompt", root, () => {
  const file = sessionRecord(root, input.session_id);
  const count = (fs.readFileSync(file, "utf8").match(/^## Prompt \d+ /gm) || []).length;
  // Blockquote every line so prompt text can never imitate a record heading.
  const quoted = String(input.prompt ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
  fs.appendFileSync(file, `## Prompt ${count + 1} · ${new Date().toISOString()}\n\n${quoted}\n\n`);
});

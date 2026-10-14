import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

const BOOTSTRAP_MARKER = "superpowers:using-superpowers bootstrap for omp";
const root = dirname(fileURLToPath(import.meta.url));
const bootstrapSkillPath = resolve(root, "skills/using-superpowers/SKILL.md");
const mappingPath = resolve(root, "skills/using-superpowers/references/omp-tools.md");
let cachedBootstrap: string | null | undefined;

function stripFrontmatter(content: string): string {
  if (!content.startsWith("---\n")) return content;
  const end = content.indexOf("\n---\n", 4);
  if (end === -1) return content;
  return content.slice(end + 5);
}

function getBootstrapContent(): string | null {
  if (cachedBootstrap !== undefined) return cachedBootstrap;
  try {
    const skill = stripFrontmatter(readFileSync(bootstrapSkillPath, "utf8")).trim();
    const mapping = readFileSync(mappingPath, "utf8").trim();
    cachedBootstrap =
      `<EXTREMELY_IMPORTANT>\n` +
      `${BOOTSTRAP_MARKER}\n` +
      `This bootstrap is already loaded for the current OMP session; do not re-fetch it.\n\n` +
      `${skill}\n\n` +
      `${mapping}\n` +
      `</EXTREMELY_IMPORTANT>`;
  } catch {
    cachedBootstrap = null;
  }
  return cachedBootstrap;
}

function blockContainsBootstrap(block: unknown): boolean {
  if (typeof block !== "object" || block === null) return false;
  const candidate = block as { type?: unknown; text?: unknown };
  return candidate.type === "text" && typeof candidate.text === "string" && candidate.text.includes(BOOTSTRAP_MARKER);
}

function messageContainsBootstrap(message: { content: unknown }): boolean {
  if (typeof message.content === "string") return message.content.includes(BOOTSTRAP_MARKER);
  if (Array.isArray(message.content)) return message.content.some(blockContainsBootstrap);
  return false;
}

function bootstrapMessage(text: string) {
  return { role: "user", content: [{ type: "text", text }], timestamp: Date.now() };
}

function firstNonCompactionSummaryIndex(messages: Array<{ role: string }>): number {
  let index = 0;
  while (index < messages.length && messages[index].role === "compactionSummary") index += 1;
  return index;
}

export default function superpowersOmpExtension(pi: ExtensionAPI): void {
  let injectBootstrap = true;
  pi.on("session_start", async () => {
    injectBootstrap = true;
  });
  pi.on("before_agent_start", async () => {
    injectBootstrap = true;
  });
  pi.on("session_compact", async () => {
    injectBootstrap = true;
  });
  pi.on("agent_end", async event => {
    injectBootstrap = event.willContinue === true;
  });
  pi.on("context", async event => {
    if (!injectBootstrap || event.messages.some(messageContainsBootstrap)) return;
    const bootstrap = getBootstrapContent();
    if (!bootstrap) return;
    const insertAt = firstNonCompactionSummaryIndex(event.messages);
    return {
      messages: [...event.messages.slice(0, insertAt), bootstrapMessage(bootstrap), ...event.messages.slice(insertAt)],
    };
  });
}

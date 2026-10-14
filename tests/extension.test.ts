import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import registerExtension_ from "../extension.ts";

const repoRoot = resolve(import.meta.dir, "..");
const skillSource = readFileSync(resolve(repoRoot, "skills/using-superpowers/SKILL.md"), "utf8");
const mappingSource = readFileSync(resolve(repoRoot, "skills/using-superpowers/references/omp-tools.md"), "utf8");

function skillBody(source: string): string {
  const match = /^---\n[\s\S]*?\n---\n/.exec(source);
  if (!match) throw new Error("using-superpowers SKILL.md must start with frontmatter");
  return source.slice(match[0].length).trim();
}

interface TextBlock {
  type: "text";
  text: string;
}

interface OtherBlock {
  type: string;
  text?: string;
}

type ContentBlock = TextBlock | OtherBlock;

interface Message {
  role: string;
  content: string | ContentBlock[];
  timestamp?: number;
}

interface ContextEvent {
  messages: Message[];
}

interface ContextResult {
  messages: Message[];
}

type LifecycleEvent = Record<string, unknown>;

interface AgentEndEvent {
  willContinue?: boolean;
}

type SessionHandler = (event: LifecycleEvent) => Promise<void> | void;
type AgentEndHandler = (event: AgentEndEvent) => Promise<void> | void;
type ContextHandler = (event: ContextEvent) => Promise<ContextResult | undefined> | ContextResult | undefined;
type AnyHandler = SessionHandler | AgentEndHandler | ContextHandler;

interface RecordedCall {
  event: string;
  handler: AnyHandler;
}

interface FakeExtensionAPI {
  on(event: string, handler: AnyHandler): void;
}

interface Handlers {
  session_start: SessionHandler;
  before_agent_start: SessionHandler;
  session_compact: SessionHandler;
  agent_end: AgentEndHandler;
  context: ContextHandler;
}

interface Registered {
  handlers: Handlers;
  calls: RecordedCall[];
}

function registerExtension(): Registered {
  const calls: RecordedCall[] = [];
  const handlers: Partial<Record<string, AnyHandler>> = {};
  const fake: FakeExtensionAPI = {
    on(event, handler) {
      calls.push({ event, handler });
      handlers[event] = handler;
    },
  };
  // The fake stands in for OMP's real ExtensionAPI; it only needs to satisfy
  // the single `on(event, handler)` method the extension calls.
  registerExtension_(fake as unknown as Parameters<typeof registerExtension_>[0]);
  return { handlers: handlers as unknown as Handlers, calls };
}

function isTextBlock(block: ContentBlock): block is TextBlock {
  return block.type === "text" && typeof block.text === "string";
}

function text(message: Message): string {
  if (typeof message.content === "string") return message.content;
  return message.content
    .filter(isTextBlock)
    .map(block => block.text)
    .join("\n");
}

function messagesOf(result: ContextResult | undefined): Message[] {
  if (!result) throw new Error("expected a context result with messages");
  return result.messages;
}

describe("superpowersOmpExtension", () => {
  test("registers exactly five lifecycle handlers with no duplicate registrations", () => {
    const { handlers, calls } = registerExtension();
    expect(calls).toHaveLength(5);
    expect(calls.map(call => call.event).sort()).toEqual(
      ["agent_end", "before_agent_start", "context", "session_compact", "session_start"].sort(),
    );
    expect(Object.keys(handlers).sort()).toEqual(
      ["agent_end", "before_agent_start", "context", "session_compact", "session_start"].sort(),
    );
  });

  test("injects exactly one bootstrap into each fresh provider context while active", async () => {
    const { handlers } = registerExtension();
    await handlers.session_start({});
    const first = messagesOf(await handlers.context({ messages: [{ role: "user", content: "first" }] }));
    const second = messagesOf(await handlers.context({ messages: [{ role: "user", content: "second" }] }));

    expect(first).toHaveLength(2);
    expect(second).toHaveLength(2);
    expect(text(first[0])).toContain("superpowers:using-superpowers bootstrap for omp");
    expect(text(first[0])).toContain("# OMP (Oh My Pi) Tool Mapping");
  });

  test("retains bootstrap injection for an OMP scheduled continuation", async () => {
    const { handlers } = registerExtension();
    await handlers.session_start({});
    await handlers.agent_end({ willContinue: true });
    const result = messagesOf(await handlers.context({ messages: [{ role: "user", content: "continue" }] }));
    expect(result).toHaveLength(2);
  });

  test("an existing marker in a text block prevents another insertion", async () => {
    const { handlers } = registerExtension();
    await handlers.session_start({});
    const existing: Message = {
      role: "user",
      content: [{ type: "text", text: "superpowers:using-superpowers bootstrap for omp already here" }],
    };
    const result = await handlers.context({ messages: [existing, { role: "user", content: "hi" }] });
    expect(result).toBeUndefined();
  });

  test("an existing marker in plain string content prevents another insertion", async () => {
    const { handlers } = registerExtension();
    await handlers.session_start({});
    const result = await handlers.context({
      messages: [{ role: "user", content: "superpowers:using-superpowers bootstrap for omp" }],
    });
    expect(result).toBeUndefined();
  });

  test("leading compactionSummary remains first after reinjection", async () => {
    const { handlers } = registerExtension();
    await handlers.session_start({});
    const summary: Message = { role: "compactionSummary", content: "summary of prior session" };
    const result = messagesOf(await handlers.context({ messages: [summary, { role: "user", content: "next" }] }));

    expect(result).toHaveLength(3);
    expect(result[0]).toBe(summary);
    expect(text(result[1])).toContain("superpowers:using-superpowers bootstrap for omp");
    expect(result[2].content).toBe("next");
  });

  test("terminal agent_end disables injection", async () => {
    const { handlers } = registerExtension();
    await handlers.session_start({});
    await handlers.agent_end({ willContinue: false });
    const result = await handlers.context({ messages: [{ role: "user", content: "after end" }] });
    expect(result).toBeUndefined();
  });

  test("before_agent_start re-arms injection after a terminal agent_end", async () => {
    const { handlers } = registerExtension();
    await handlers.session_start({});
    await handlers.agent_end({ willContinue: false });
    await handlers.before_agent_start({});
    const result = messagesOf(await handlers.context({ messages: [{ role: "user", content: "new turn" }] }));
    expect(result).toHaveLength(2);
  });

  test("session_compact re-arms injection after a terminal agent_end", async () => {
    const { handlers } = registerExtension();
    await handlers.agent_end({ willContinue: false });
    await handlers.session_compact({});
    const result = messagesOf(await handlers.context({ messages: [{ role: "user", content: "plain" }] }));
    expect(result).toHaveLength(2);
    expect(text(result[0])).toContain("superpowers:using-superpowers bootstrap for omp");
  });

  test("session_start re-arms injection after a terminal agent_end", async () => {
    const { handlers } = registerExtension();
    await handlers.agent_end({ willContinue: false });
    await handlers.session_start({});
    const result = messagesOf(await handlers.context({ messages: [{ role: "user", content: "plain" }] }));
    expect(result).toHaveLength(2);
    expect(text(result[0])).toContain("superpowers:using-superpowers bootstrap for omp");
  });
});

describe("package wiring", () => {
  test("package.json omp.extensions points at the tested extension module", () => {
    const manifest = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8"));
    expect(manifest.omp?.extensions).toEqual(["./extension.ts"]);
    const entry = resolve(repoRoot, manifest.omp.extensions[0]);
    expect(existsSync(entry)).toBe(true);
    expect(entry).toBe(resolve(repoRoot, "extension.ts"));
    expect(typeof registerExtension_).toBe("function");
  });
});

describe("injected bootstrap message", () => {
  async function injected(): Promise<Message> {
    const { handlers } = registerExtension();
    await handlers.session_start({});
    return messagesOf(await handlers.context({ messages: [{ role: "user", content: "hi" }] }))[0];
  }

  test("is a single user text block with a numeric timestamp", async () => {
    const message = await injected();
    expect(Object.keys(message).sort()).toEqual(["content", "role", "timestamp"]);
    expect(message.role).toBe("user");
    expect(typeof message.timestamp).toBe("number");
    expect(Array.isArray(message.content)).toBe(true);
    const blocks = message.content as ContentBlock[];
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("text");
    expect(Object.keys(blocks[0]).sort()).toEqual(["text", "type"]);
  });

  test("wraps marker, embedded skill body, and OMP mapping in order", async () => {
    const body = text(await injected());
    expect(body.startsWith("<EXTREMELY_IMPORTANT>\nsuperpowers:using-superpowers bootstrap for omp\n")).toBe(true);
    expect(body.endsWith("</EXTREMELY_IMPORTANT>")).toBe(true);
    const skillAt = body.indexOf(skillBody(skillSource));
    const mappingAt = body.indexOf(mappingSource.trim());
    expect(skillAt).toBeGreaterThan(0);
    expect(mappingAt).toBeGreaterThan(skillAt);
  });

  test("embeds the skill without its YAML frontmatter", async () => {
    const body = text(await injected());
    const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(skillSource)![1];
    for (const line of frontmatter.split("\n")) expect(body).not.toContain(line);
    expect(body).not.toContain("\n---\nname:");
  });
});

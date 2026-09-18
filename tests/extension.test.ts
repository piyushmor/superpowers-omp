import { describe, expect, test } from "bun:test";
import registerExtension_ from "../extension.ts";

type Handler = (event?: any) => any;

interface FakeExtensionAPI {
  on(event: string, handler: Handler): void;
}

interface Handlers {
  [event: string]: Handler;
}

function registerExtension(): Handlers {
  const handlers: Handlers = {};
  const fake: FakeExtensionAPI = {
    on(event, handler) {
      handlers[event] = handler;
    },
  };
  registerExtension_(fake as any);
  return handlers;
}

function text(message: any): string {
  if (typeof message.content === "string") return message.content;
  return message.content
    .filter((block: any) => block.type === "text")
    .map((block: any) => block.text)
    .join("\n");
}

describe("superpowersOmpExtension", () => {
  test("registers exactly the five expected lifecycle handlers", () => {
    const handlers = registerExtension();
    expect(Object.keys(handlers).sort()).toEqual(
      ["agent_end", "before_agent_start", "context", "session_compact", "session_start"].sort(),
    );
  });

  test("injects exactly one bootstrap into each fresh provider context while active", async () => {
    const handlers = registerExtension();
    await handlers.session_start({});
    const first = await handlers.context({ messages: [{ role: "user", content: "first" }] });
    const second = await handlers.context({ messages: [{ role: "user", content: "second" }] });

    expect(first.messages).toHaveLength(2);
    expect(second.messages).toHaveLength(2);
    expect(text(first.messages[0])).toContain("superpowers:using-superpowers bootstrap for omp");
    expect(text(first.messages[0])).toContain("# OMP (Oh My Pi) Tool Mapping");
  });

  test("retains bootstrap injection for an OMP scheduled continuation", async () => {
    const handlers = registerExtension();
    await handlers.session_start({});
    await handlers.agent_end({ willContinue: true });
    const result = await handlers.context({ messages: [{ role: "user", content: "continue" }] });
    expect(result.messages).toHaveLength(2);
  });

  test("an existing marker prevents another insertion", async () => {
    const handlers = registerExtension();
    await handlers.session_start({});
    const existing = {
      role: "user",
      content: [{ type: "text", text: "superpowers:using-superpowers bootstrap for omp already here" }],
    };
    const result = await handlers.context({ messages: [existing, { role: "user", content: "hi" }] });
    expect(result).toBeUndefined();
  });

  test("leading compactionSummary remains first after reinjection", async () => {
    const handlers = registerExtension();
    await handlers.session_start({});
    const summary = { role: "compactionSummary", content: "summary of prior session" };
    const result = await handlers.context({ messages: [summary, { role: "user", content: "next" }] });

    expect(result.messages).toHaveLength(3);
    expect(result.messages[0]).toBe(summary);
    expect(text(result.messages[1])).toContain("superpowers:using-superpowers bootstrap for omp");
    expect(result.messages[2].content).toBe("next");
  });

  test("terminal agent_end disables injection", async () => {
    const handlers = registerExtension();
    await handlers.session_start({});
    await handlers.agent_end({ willContinue: false });
    const result = await handlers.context({ messages: [{ role: "user", content: "after end" }] });
    expect(result).toBeUndefined();
  });

  test("before_agent_start re-arms injection after a terminal agent_end", async () => {
    const handlers = registerExtension();
    await handlers.session_start({});
    await handlers.agent_end({ willContinue: false });
    await handlers.before_agent_start({});
    const result = await handlers.context({ messages: [{ role: "user", content: "new turn" }] });
    expect(result.messages).toHaveLength(2);
  });
});

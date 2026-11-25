import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

const header = "<EXTREMELY_IMPORTANT>\nsuperpowers:using-superpowers bootstrap for omp\n";

export default function observe(pi: ExtensionAPI): void {
  pi.on("context", event => {
    let count = 0;
    for (const message of event.messages) {
      if (message.role !== "user") continue;
      if (typeof message.content === "string" && message.content.startsWith(header)) count++;
      if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block.type === "text" && block.text.startsWith(header)) count++;
        }
      }
    }
    console.error(`SUPERPOWERS_EVAL_BOOTSTRAP_COUNT=${count}`);
  });
}

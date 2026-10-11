// Echoes Pi-like records. Splits one reply across two writes to test reassembly.
process.stdin.setEncoding("utf8");
let buf = "";
process.stdout.write(JSON.stringify({ type: "entry_appended", entry: { type: "custom", customType: "tutor_status", data: { kind: "ready" } } }) + "\n");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line) continue;
    const cmd = JSON.parse(line);
    if (cmd.type === "prompt" && cmd.message.startsWith("@@tutor-signal ")) {
      process.stdout.write(JSON.stringify({ id: cmd.id, type: "response", command: "prompt", success: true, data: { disposition: "handled" } }) + "\n");
    } else if (cmd.type === "prompt") {
      const resp = JSON.stringify({ id: cmd.id, type: "response", command: "prompt", success: true, data: { disposition: "started" } }) + "\n";
      const d1 = JSON.stringify({ type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Hel" } }) + "\n";
      const d2 = JSON.stringify({ type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "lo !" } }) + "\n";
      const end = JSON.stringify({ type: "agent_settled" }) + "\n";
      const all = resp + d1 + d2 + end;
      const cut = Math.floor(all.length / 2);
      process.stdout.write(all.slice(0, cut));
      setTimeout(() => process.stdout.write(all.slice(cut)), 20);
    } else if (cmd.type === "exit") {
      process.exit(3);
    } else {
      process.stdout.write(JSON.stringify({ id: cmd.id, type: "response", command: cmd.type, success: true, data: { model: { id: "fake" } } }) + "\n");
    }
  }
});

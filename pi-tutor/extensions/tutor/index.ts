import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI): void {
  pi.on("session_start", () => {
    pi.appendEntry("tutor_status", { kind: "ready", package: "pi-tutor", version: "0.1.0" });
  });
  pi.on("input", () => ({ action: "continue" as const }));
}

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI): void {
  pi.on("session_start", () => {
    pi.appendEntry("tutor_status", { kind: "ready", package: "pi-tutor", version: "0.2.0" });
  });
  pi.on("session_shutdown", () => {});
}

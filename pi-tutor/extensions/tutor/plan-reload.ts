import { join } from "node:path";

/** The editor calls this needs (NvimLink has both, nvim.ts). */
export interface PlanBufferLink {
  isModified(path: string): Promise<boolean>;
  reloadFile(path: string): Promise<void>;
  holdBuffer(path: string): Promise<void>;
}

/** The files the plan job rewrites in an existing project (writeScaffold `{ existing: true }`). */
const PLAN_FILES = ["README.md", join("spec", "tasks.md")];

/**
 * Wayfinding spec §9.4: after the plan job, an open buffer of its files shows the new text. A buffer with unsaved edits
 * is left alone and the learner is told how to see the plan's version; one file failing never stops the other.
 */
export async function refreshPlanBuffers(link: PlanBufferLink, root: string, notify: (msg: string) => void): Promise<void> {
  for (const rel of PLAN_FILES) {
    const path = join(root, rel);
    try {
      if (await link.isModified(path)) {
        await link.holdBuffer(path); // final review I2: no W12 prompt when Neovim next checks the file
        notify(`${rel} changed on disk with the plan: :e! to see it (your unsaved edits there would be lost)`);
      }
      else await link.reloadFile(path);
    } catch { /* the file is written; the buffer reloads on focus */ }
  }
}

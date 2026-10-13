import { describe, it, expect } from "vitest";
import { scanForSecrets, assertNoSecrets } from "../extensions/tutor/vendor/pify-secrets.js";

const NV = "nvapi-" + "Zx9Kq2Lm7Rt4Wv8Yb3Nc6Pd1Hf5Gj0Ts";

describe("secret scanner (vendored @pify/memory 0.13.1 + nvapi)", () => {
  it("blocks an NVIDIA key (added pattern) and a provider key", () => {
    expect(scanForSecrets(`my key is ${NV}`, []).map((m) => m.label)).toContain("NVIDIA API key");
    expect(scanForSecrets("ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8", []).length).toBeGreaterThan(0);
  });
  it("lets placeholders and plain learner facts through", () => {
    expect(scanForSecrets("nvapi-xxxxxxxxxxxxxxxxxxxxxxxxxxxx", [])).toEqual([]);
    expect(scanForSecrets("learner prefers comparisons with Rust; struggles with closures", [])).toEqual([]);
  });
  it("blocks a literal the environment holds, shape or no shape", () => {
    expect(scanForSecrets("the token is Qw7Rt2Yp9Lk", ["Qw7Rt2Yp9Lk"]).map((m) => m.label)).toEqual(["known credential from the environment"]);
  });
  it("assertNoSecrets throws a message that never contains the whole secret", () => {
    let msg = "";
    try { assertNoSecrets(`key ${NV}`); } catch (e) { msg = (e as Error).message; }
    expect(msg).toMatch(/^Refusing to save/);
    expect(msg).not.toContain(NV);
  });
});

// A visible, cancellable wait for model calls made from a command handler.
// ctx.ui.setWorkingMessage only shows during agent turns, so /tutor-start puts Pi's
// BorderedLoader in the editor slot instead (pattern: Pi examples/extensions/qna.ts).

/**
 * The longest one /tutor-start model call may take. The scaffold call (three documents in one
 * reply) ran past 180 s on z-ai/glm-5.3-flash in the live check; the loader's Esc cancels sooner.
 */
export const MODEL_TIMEOUT_MS = 600_000;
/** The background plan job (spec 2026-10-19 Q10): nobody waits on it, and a slow provider needed over 10 minutes. */
export const SPEC_JOB_TIMEOUT_MS = 30 * 60_000;
/**
 * Retries for our own model calls on transient provider errors (timeouts, 5xx, overload), as Pi's
 * settings.retry does for its turns; quota and billing errors fail at once (pi-ai isRetryableAssistantError).
 * Live check 2026-10-20: the NVIDIA endpoint timed out once and the whole plan was lost.
 */
export const PROVIDER_RETRY = { enabled: true, maxRetries: 3, baseDelayMs: 2_000 };

export interface LoaderLike { readonly signal: AbortSignal; onAbort?: () => void }

/** The slice of ctx.ui.custom this needs; the factory returns the component to show. */
export type CustomUi = <T>(factory: (tui: unknown, theme: unknown, keybindings: unknown, done: (result: T) => void) => unknown) => Promise<T>;

export type MakeLoader = (tui: unknown, theme: unknown, message: string) => LoaderLike;

export class Cancelled extends Error {
  constructor() { super("cancelled"); this.name = "Cancelled"; }
}

/** `what` names the slow work in the timeout error (M5 #41: a docs download is not a model call). */
export function withLoader<T>(custom: CustomUi, make: MakeLoader, message: string, run: (signal: AbortSignal) => Promise<T>, timeoutMs: number, what = "model call"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    // A factory that throws (e.g. theme not ready) must reject, not leave /tutor-start hanging.
    custom<null>((tui, theme, _kb, done) => {
      const loader = make(tui, theme, `${message} (Esc cancels)`);
      const timeout = AbortSignal.timeout(timeoutMs);
      const signal = AbortSignal.any([loader.signal, timeout]);
      let settled = false;
      const finish = (fn: () => void) => { if (settled) return; settled = true; done(null); fn(); };
      loader.onAbort = () => finish(() => reject(new Cancelled()));
      run(signal).then(
        (v) => finish(() => resolve(v)),
        (e) => finish(() => reject(
          loader.signal.aborted ? new Cancelled()
            : timeout.aborted ? new Error(`${what} timed out after ${Math.round(timeoutMs / 1000)}s`)
              : e)),
      );
      return loader;
    }).catch(reject);
  });
}

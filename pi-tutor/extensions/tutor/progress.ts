// A visible, cancellable wait for model calls made from a command handler.
// ctx.ui.setWorkingMessage only shows during agent turns, so /tutor-start puts Pi's
// BorderedLoader in the editor slot instead (pattern: Pi examples/extensions/qna.ts).

export interface LoaderLike { readonly signal: AbortSignal; onAbort?: () => void }

/** The slice of ctx.ui.custom this needs; the factory returns the component to show. */
export type CustomUi = <T>(factory: (tui: unknown, theme: unknown, keybindings: unknown, done: (result: T) => void) => unknown) => Promise<T>;

export type MakeLoader = (tui: unknown, theme: unknown, message: string) => LoaderLike;

export class Cancelled extends Error {
  constructor() { super("cancelled"); this.name = "Cancelled"; }
}

export function withLoader<T>(custom: CustomUi, make: MakeLoader, message: string, run: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
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
            : timeout.aborted ? new Error(`model call timed out after ${Math.round(timeoutMs / 1000)}s`)
              : e)),
      );
      return loader;
    }).catch(reject);
  });
}

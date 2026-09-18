import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { LOAD_TIMEOUT_MS } from "../constants";
import { recoverFromStaleChunk } from "./swRecovery";

type Importer<T extends ComponentType> = () => Promise<{ default: T }>;

/** Tagged so we can tell a hung import (timeout) apart from a quick rejection. */
class ChunkTimeoutError extends Error {
  constructor() {
    super("dynamically imported module timed out");
    this.name = "ChunkTimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ChunkTimeoutError()), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * `React.lazy` hardened for a PWA on flaky / iOS networks.
 *
 * A bare lazy import that HANGS leaves the user stuck on the old page: during a
 * router navigation (a React transition) a suspended route shows no Suspense
 * fallback and throws no error, so neither `vite:preloadError` nor the route
 * ErrorBoundary fires — the only way out is a manual full refresh. This wrapper:
 *  - times out a hung import (`LOAD_TIMEOUT_MS`) so it becomes a failure;
 *  - retries once for a transient network blip (a re-`import()` of the same URL
 *    won't re-fetch a hard 404/hang, so the reload below is the real fix there);
 *  - on final failure calls `recoverFromStaleChunk()` (auto reload → hardReset,
 *    loop-guarded) so the user never has to manually refresh, then rethrows so
 *    the route ErrorBoundary still renders its brief "Updating…" screen.
 */
export type PreloadableLazy<T extends ComponentType> = LazyExoticComponent<T> & {
  /**
   * Load the route's chunk ahead of navigation. Once it resolves, the first
   * render of the route doesn't suspend at all (no spinner flash). Failures are
   * swallowed — a real navigation retries and runs the recovery path.
   */
  preload: () => Promise<void>;
};

export function lazyWithRecovery<T extends ComponentType>(
  factory: Importer<T>,
): PreloadableLazy<T> {
  // Set once the module has loaded (via preload or a render).
  let loaded: { default: T } | undefined;

  const Component = lazy(() => {
    // React.lazy reads a thenable that settles synchronously without
    // suspending, so an already-loaded route renders on the first pass instead
    // of flashing the Suspense fallback for a tick.
    if (loaded) {
      const mod = loaded;
      return { then: (resolve: (m: { default: T }) => void) => resolve(mod) } as unknown as Promise<{ default: T }>;
    }
    return loadWithRecovery();
  }) as PreloadableLazy<T>;

  async function loadWithRecovery(): Promise<{ default: T }> {
    try {
      return (loaded = await withTimeout(factory(), LOAD_TIMEOUT_MS));
    } catch (firstErr) {
      // A quick rejection might be a one-off blip → retry once. A timeout means
      // the request is wedged; re-importing the same URL won't help, so skip
      // straight to recovery.
      if (!(firstErr instanceof ChunkTimeoutError)) {
        try {
          await delay(500);
          return (loaded = await withTimeout(factory(), LOAD_TIMEOUT_MS));
        } catch { /* fall through to recovery */ }
      }
      recoverFromStaleChunk();
      throw firstErr;
    }
  }

  Component.preload = () =>
    loaded
      ? Promise.resolve()
      : factory().then(
          (mod) => { loaded = mod; },
          () => {},
        );

  return Component;
}

export default lazyWithRecovery;

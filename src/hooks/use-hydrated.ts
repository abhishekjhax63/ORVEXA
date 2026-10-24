import { useSyncExternalStore } from "react";

/**
 * Nothing subscribes: the value only ever flips once, when React finishes
 * hydrating, so the store never needs to notify.
 */
function subscribe() {
  return () => {};
}

function getSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

/**
 * `false` while rendering on the server and during the first client render,
 * `true` once hydration has completed.
 *
 * Used by components whose markup depends on browser-only state (the stored
 * theme, filter interactivity). Reading it through `useSyncExternalStore`
 * keeps the server and hydration renders identical without the extra
 * render-and-`setState` that a mounting effect would otherwise cause.
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

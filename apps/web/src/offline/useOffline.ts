import { useSyncExternalStore } from "react";

import { getOfflineState, subscribeOffline, type OfflineState } from "./store";

/** Live offline state: connectivity plus how many edits are queued (P20). */
export function useOfflineState(): OfflineState {
  return useSyncExternalStore(subscribeOffline, getOfflineState, getOfflineState);
}

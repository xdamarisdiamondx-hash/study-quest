/**
 * One name for the runtime cache of API reads (shared by the service worker
 * and the page). The worker fills it with last-viewed answers for offline
 * reading; the page wipes it on sign-out, so both sides must agree on the key.
 */
export const API_CACHE = "sq-api";

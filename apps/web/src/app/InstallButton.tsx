/**
 * The topbar install affordance (requested for the release build): the same
 * store as the Settings card — P20's installPrompt module — so both surfaces
 * stay in step. It renders only while the browser is actually offering
 * `beforeinstallprompt`, which means it disappears by itself once the app is
 * installed or the offer is withdrawn; Safari never offers, so iOS users get
 * the card's Share-menu instructions instead of a dead button.
 */
import { useState, useSyncExternalStore } from "react";

import { getInstallState, promptInstall, subscribeInstall } from "../offline/installPrompt";

export function InstallButton() {
  const install = useSyncExternalStore(subscribeInstall, getInstallState, getInstallState);
  const [busy, setBusy] = useState(false);

  if (!install.available || install.installed) return null;

  return (
    <button
      type="button"
      className="sq-btn sq-btn-secondary sq-btn-sm sq-install-btn"
      aria-label="Install Study Quest"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void promptInstall().finally(() => setBusy(false));
      }}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3.5v9m0 0 3.5-3.5M12 12.5 8.5 9" />
        <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
      </svg>
      Install
    </button>
  );
}

/**
 * Install and offline (P20): the card behind the phase's "install prompt with
 * custom UI". A real button when the browser offers `beforeinstallprompt`,
 * honest menu instructions when it does not (Safari has never fired it), and
 * a plain statement of what offline means here — including what deliberately
 * stays online-only, so nothing promises a queue it does not keep.
 */
import { useState, useSyncExternalStore } from "react";
import { Button, Card } from "@sq/ui";

import { getInstallState, promptInstall, subscribeInstall } from "../../offline/installPrompt";
import { useOfflineState } from "../../offline/useOffline";

export function PwaCard() {
  const install = useSyncExternalStore(subscribeInstall, getInstallState, getInstallState);
  const { online, queued } = useOfflineState();
  const [busy, setBusy] = useState(false);

  async function installNow() {
    setBusy(true);
    try {
      await promptInstall();
    } finally {
      setBusy(false);
    }
  }

  const status = online
    ? queued > 0
      ? `Online · ${queued} edit${queued === 1 ? "" : "s"} waiting to sync`
      : "Online · nothing queued"
    : queued > 0
      ? `Offline · ${queued} edit${queued === 1 ? "" : "s"} queued`
      : "Offline · showing your last-viewed content";

  return (
    <Card title="Install and offline">
      <div className="sq-row" style={{ gap: "var(--s4)", alignItems: "center", flexWrap: "wrap" }}>
        <p className="sq-help" style={{ margin: 0, flex: "1 1 260px", minWidth: 0 }}>
          {install.installed
            ? "This window is the installed app — its own icon, its own window."
            : install.available
              ? "Install Study Quest as an app: its own window and icon, with the shell and your last-viewed pages saved on this device."
              : "No install button was offered here. In your browser's menu, choose “Install app” (Chrome, Edge) or “Add to Home Screen” (Safari, phones)."}
        </p>
        {install.available && !install.installed ? (
          <Button variant="secondary" disabled={busy} onClick={() => void installNow()}>
            {busy ? "Waiting for the browser…" : "Install Study Quest"}
          </Button>
        ) : null}
      </div>

      <ul className="sq-bullets">
        <li>
          <b>Offline reading</b> — the app and every page you have already opened keep working with
          no network.
        </li>
        <li>
          <b>Offline edits</b> — changes to existing tasks, notes and settings queue on this device
          and sync in order the moment you are back; the header shows how many.
        </li>
        <li>
          <b>Online only</b> — creating something new and AI actions need the server, and say so
          rather than pretending to queue.
        </li>
      </ul>

      <p className="sq-label" role="status">
        {status}
      </p>
    </Card>
  );
}

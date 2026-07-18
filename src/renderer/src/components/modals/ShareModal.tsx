import { useState } from "react";
import { useApp } from "@/stores/app";
import { useRuns } from "@/stores/runs";
import { useUi } from "@/stores/ui";
import { Overlay } from "@/components/common/Overlay";

export function ShareModal(): React.JSX.Element {
  const toggleShare = useUi((s) => s.toggleShare);
  const toast = useUi((s) => s.toast);
  const applyBoot = useApp((s) => s.applyBoot);
  const loadAll = useRuns((s) => s.loadAll);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"Editor" | "Viewer">("Editor");
  const [includeHistory, setIncludeHistory] = useState(true);
  const [busy, setBusy] = useState(false);

  const invite = (): void => {
    toast("Invites need a Rewind account — Rewind is local-first for now");
    setEmail("");
  };

  const doExport = async (): Promise<void> => {
    setBusy(true);
    try {
      const result = await window.rewind.exportBundle({ includeHistory });
      if (result.path) toast(`Exported to ${result.path}`);
      else if (result.error) toast(result.error, "error");
    } finally {
      setBusy(false);
    }
  };

  const doImport = async (): Promise<void> => {
    setBusy(true);
    try {
      const result = await window.rewind.importBundle();
      if (result.error) {
        toast(result.error, "error");
      } else if (result.ok && result.boot) {
        applyBoot(result.boot);
        void loadAll();
        toggleShare();
        toast(
          `Imported ${result.counts?.collections ?? 0} collections, ${result.counts?.environments ?? 0} environments, ${result.counts?.runs ?? 0} runs`,
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay onClose={toggleShare} center>
      <div className="modal share-modal">
        <div className="modal-title-row">
          <span className="modal-title">Share workspace</span>
          <button className="icon-btn" onClick={toggleShare}>
            ✕
          </button>
        </div>
        <div className="invite-row">
          <input
            className="invite-input"
            placeholder="teammate@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && invite()}
          />
          <select
            className="role-select"
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
          >
            <option>Editor</option>
            <option>Viewer</option>
          </select>
          <button className="btn-accent" onClick={invite}>
            Invite
          </button>
        </div>
        <div className="invite-empty">
          No teammates yet — invites need a Rewind account. Your workspace stays
          on this machine until you share it.
        </div>
        <div className="move-section">
          <span className="micro-label">MOVE TO ANOTHER DEVICE</span>
          <span className="move-note">
            Bundle collections, environments and run history into one plain-JSON
            file — import it on any machine, no account needed.
          </span>
          <div className="move-actions">
            <button
              className="ghost-btn"
              disabled={busy}
              onClick={() => void doExport()}
            >
              ⤓ Export .rewind
            </button>
            <button
              className="ghost-btn"
              disabled={busy}
              onClick={() => void doImport()}
            >
              ⤒ Import from file
            </button>
            <label className="include-history">
              <input
                type="checkbox"
                checked={includeHistory}
                onChange={(e) => setIncludeHistory(e.target.checked)}
              />
              include history
            </label>
          </div>
        </div>
        <div className="modal-footer-note">
          <span className="dot dot-ok" />
          Invites need a Rewind account · exports stay fully local
        </div>
      </div>
    </Overlay>
  );
}

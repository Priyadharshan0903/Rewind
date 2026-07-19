import { useState } from "react";
import { X } from "lucide-react";
import { useApp } from "@/stores/app";
import { useRuns } from "@/stores/runs";
import { useUi } from "@/stores/ui";
import { Overlay } from "@/components/common/Overlay";

export function NewProfileModal(): React.JSX.Element {
  const closeOverlays = useUi((s) => s.closeOverlays);
  const toast = useUi((s) => s.toast);
  const applyBoot = useApp((s) => s.applyBoot);
  const setProfilesState = useApp((s) => s.setProfilesState);
  const loadAll = useRuns((s) => s.loadAll);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async (): Promise<void> => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const result = await window.rewind.createProfile(name.trim());
      setProfilesState(result);
      applyBoot(result.boot);
      void loadAll();
      closeOverlays();
      toast(`Profile “${name.trim()}” created — you're in it now`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay onClose={() => closeOverlays()} center>
      <div className="modal new-profile-modal">
        <div className="modal-title-row">
          <span className="modal-title">New profile</span>
          <button className="icon-btn" onClick={() => closeOverlays()}>
            <X size={14} strokeWidth={2} />
          </button>
        </div>
        <span className="move-note">
          A profile is a separate local workspace — its own collections,
          environments and run history, stored side by side on this machine.
        </span>
        <div className="invite-row">
          <input
            className="invite-input"
            placeholder="e.g. Personal, Klenty, Side project"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void create()}
          />
          <button
            className="btn-accent"
            disabled={!name.trim() || busy}
            onClick={() => void create()}
          >
            Create &amp; switch
          </button>
        </div>
        <div className="modal-footer-note">
          <span className="dot dot-ok" />
          Stored under profiles/ in the app data folder — fully local
        </div>
      </div>
    </Overlay>
  );
}

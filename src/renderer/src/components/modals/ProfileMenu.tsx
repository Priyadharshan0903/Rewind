import { useApp } from "@/stores/app";
import { useRuns } from "@/stores/runs";
import { useUi } from "@/stores/ui";

export function ProfileMenu(): React.JSX.Element {
  const toggleProfile = useUi((s) => s.toggleProfile);
  const openPrefs = useUi((s) => s.openPrefs);
  const openShortcuts = useUi((s) => s.openShortcuts);
  const openNewProfile = useUi((s) => s.openNewProfile);
  const toast = useUi((s) => s.toast);
  const applyBoot = useApp((s) => s.applyBoot);
  const setProfilesState = useApp((s) => s.setProfilesState);
  const profiles = useApp((s) => s.profiles);
  const activeProfileId = useApp((s) => s.activeProfileId);
  const loadAll = useRuns((s) => s.loadAll);

  const activeProfile = profiles.find((p) => p.id === activeProfileId);

  const switchTo = async (id: string): Promise<void> => {
    if (id === activeProfileId) return;
    toggleProfile();
    const result = await window.rewind.switchProfile(id);
    setProfilesState(result);
    applyBoot(result.boot);
    void loadAll();
    toast(
      `Switched to “${result.profiles.find((p) => p.id === result.activeId)?.name}”`,
    );
  };

  const removeProfile = async (id: string, name: string): Promise<void> => {
    if (
      !window.confirm(
        `Delete profile “${name}” and all of its collections, environments and history?`,
      )
    )
      return;
    setProfilesState(await window.rewind.deleteProfile(id));
    toast(`Deleted profile “${name}”`);
  };

  const doExport = async (): Promise<void> => {
    toggleProfile();
    const result = await window.rewind.exportBundle({ includeHistory: true });
    if (result.path) toast(`Exported to ${result.path}`);
    else if (result.error) toast(result.error, "error");
  };

  const doImport = async (): Promise<void> => {
    toggleProfile();
    const result = await window.rewind.importBundle();
    if (result.error) toast(result.error, "error");
    else if (result.ok && result.boot) {
      applyBoot(result.boot);
      void loadAll();
      toast("Workspace imported");
    }
  };

  return (
    <div className="profile-overlay" onMouseDown={toggleProfile}>
      <div
        className="menu profile-menu"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="profile-head">
          <span className="avatar avatar-lg">
            {(activeProfile?.name ?? "L")[0].toUpperCase()}
          </span>
          <span className="profile-col">
            <span className="profile-name">
              {activeProfile?.name ?? "Local profile"}
            </span>
            <span className="profile-sub">
              local profile · this device · no account needed
            </span>
          </span>
        </div>
        <div className="menu-section-label micro-label">PROFILES</div>
        {profiles.map((p) => (
          <div
            key={p.id}
            className="menu-item profile-row"
            onClick={() => void switchTo(p.id)}
          >
            <span className="avatar">{p.name[0]?.toUpperCase() ?? "?"}</span>
            <span className="profile-row-name">{p.name}</span>
            {p.id === activeProfileId ? (
              <span className="menu-check">✓</span>
            ) : (
              <button
                className="row-action profile-delete"
                title="Delete profile"
                onClick={(e) => {
                  e.stopPropagation();
                  void removeProfile(p.id, p.name);
                }}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button className="menu-item menu-accent" onClick={openNewProfile}>
          + New profile…
        </button>
        <div className="menu-sep" />
        <button className="menu-item" onClick={openPrefs}>
          Preferences<span className="menu-kbd">⌘ ,</span>
        </button>
        <button className="menu-item" onClick={openShortcuts}>
          Keyboard shortcuts<span className="menu-kbd">⌘ /</span>
        </button>
        <div className="menu-sep" />
        <button
          className="menu-item menu-accent"
          onClick={() => {
            toggleProfile();
            toast(
              "Team sync is not available in this build — Rewind is local-first",
            );
          }}
        >
          ☁ Sign in to enable team sync
        </button>
        <div className="menu-sep" />
        <button className="menu-item" onClick={() => void doExport()}>
          ⤓ Export workspace…
        </button>
        <button className="menu-item" onClick={() => void doImport()}>
          ⤒ Import workspace…
        </button>
      </div>
    </div>
  );
}

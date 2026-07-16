import { useApp } from '@/stores/app'
import { useRuns } from '@/stores/runs'
import { useUi } from '@/stores/ui'

export function ProfileMenu(): React.JSX.Element {
  const toggleProfile = useUi((s) => s.toggleProfile)
  const openPrefs = useUi((s) => s.openPrefs)
  const openShortcuts = useUi((s) => s.openShortcuts)
  const toast = useUi((s) => s.toast)
  const applyBoot = useApp((s) => s.applyBoot)
  const loadAll = useRuns((s) => s.loadAll)

  const doExport = async (): Promise<void> => {
    toggleProfile()
    const result = await window.relay.exportBundle({ includeHistory: true })
    if (result.path) toast(`Exported to ${result.path}`)
    else if (result.error) toast(result.error, 'error')
  }

  const doImport = async (): Promise<void> => {
    toggleProfile()
    const result = await window.relay.importBundle()
    if (result.error) toast(result.error, 'error')
    else if (result.ok && result.boot) {
      applyBoot(result.boot)
      void loadAll()
      toast('Workspace imported')
    }
  }

  return (
    <div className="profile-overlay" onMouseDown={toggleProfile}>
      <div className="menu profile-menu" onMouseDown={(e) => e.stopPropagation()}>
        <div className="profile-head">
          <span className="avatar avatar-lg">Y</span>
          <span className="profile-col">
            <span className="profile-name">Local profile</span>
            <span className="profile-sub">this device · no account needed</span>
          </span>
        </div>
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
            toggleProfile()
            toast('Team sync is not available in this build — Relay is local-first')
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
  )
}

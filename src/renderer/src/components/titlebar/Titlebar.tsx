import { useState } from 'react'
import { useApp, useActiveEnv } from '@/stores/app'
import { useUi } from '@/stores/ui'

export function Titlebar(): React.JSX.Element {
  const view = useUi((s) => s.view)
  const setView = useUi((s) => s.setView)
  const toggleShare = useUi((s) => s.toggleShare)
  const toggleProfile = useUi((s) => s.toggleProfile)

  return (
    <div className="titlebar">
      <div className="traffic-space" />
      <div className="seg no-drag">
        <button className={view === 'runbook' ? 'seg-btn seg-active' : 'seg-btn'} onClick={() => setView('runbook')}>
          Runbook
        </button>
        <button className={view === 'history' ? 'seg-btn seg-active' : 'seg-btn'} onClick={() => setView('history')}>
          History
        </button>
      </div>
      <div className="tb-spacer" />
      {view === 'runbook' && <LayoutToggles />}
      <EnvPill />
      <button className="btn-accent no-drag" onClick={toggleShare}>
        ⇪ Share
      </button>
      <ProfileChip onClick={toggleProfile} />
    </div>
  )
}

/** Panel icon: outer frame + the toggled region, filled when the panel is visible. */
function PanelIcon({ side, on }: { side: 'left' | 'bottom' | 'right'; on: boolean }): React.JSX.Element {
  const region =
    side === 'left'
      ? { x: 3, y: 4.5, width: 3.5, height: 7 }
      : side === 'right'
        ? { x: 9.5, y: 4.5, width: 3.5, height: 7 }
        : { x: 3, y: 8, width: 10, height: 3.5 }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16">
      <rect x="1.5" y="3" width="13" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect {...region} rx="0.8" fill="currentColor" opacity={on ? 0.85 : 0.2} />
    </svg>
  )
}

/** VSCode-style layout toggles: hide/show sidebar, response pane, history panel. */
function LayoutToggles(): React.JSX.Element {
  const sidebarOpen = useApp((s) => s.settings.sidebarOpen)
  const responsePaneOpen = useApp((s) => s.settings.responsePaneOpen)
  const historyPanelOpen = useApp((s) => s.settings.historyPanelOpen)
  const patchSettings = useApp((s) => s.patchSettings)
  return (
    <div className="layout-toggles no-drag">
      <button
        className="icon-btn"
        title={`${sidebarOpen ? 'Hide' : 'Show'} sidebar (⌘B)`}
        onClick={() => patchSettings({ sidebarOpen: !sidebarOpen })}
      >
        <PanelIcon side="left" on={sidebarOpen} />
      </button>
      <button
        className="icon-btn"
        title={`${responsePaneOpen ? 'Hide' : 'Show'} response pane (⌘J)`}
        onClick={() => patchSettings({ responsePaneOpen: !responsePaneOpen })}
      >
        <PanelIcon side="bottom" on={responsePaneOpen} />
      </button>
      <button
        className="icon-btn"
        title={`${historyPanelOpen ? 'Hide' : 'Show'} history panel (⌘⌥B)`}
        onClick={() => patchSettings({ historyPanelOpen: !historyPanelOpen })}
      >
        <PanelIcon side="right" on={historyPanelOpen} />
      </button>
    </div>
  )
}

function ProfileChip({ onClick }: { onClick: () => void }): React.JSX.Element {
  const profiles = useApp((s) => s.profiles)
  const activeProfileId = useApp((s) => s.activeProfileId)
  const active = profiles.find((p) => p.id === activeProfileId)
  const name = active?.name ?? 'you'
  return (
    <button className="profile-chip no-drag" onClick={onClick} title={`Profile: ${name}`}>
      <span className="profile-label">{name}</span>
      <span className="avatar">{name[0]?.toUpperCase() ?? 'Y'}</span>
    </button>
  )
}

function EnvPill(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const environments = useApp((s) => s.environments)
  const setActiveEnv = useApp((s) => s.setActiveEnv)
  const openEnvEditor = useUi((s) => s.openEnvEditor)
  const env = useActiveEnv()

  return (
    <div className="env-wrap no-drag">
      <button className="env-pill" onClick={() => setOpen((v) => !v)}>
        <span className={`dot dot-${env?.dotColor ?? 'warn'}`} />
        {env?.name ?? 'No env'}
        <span className="caret">▾</span>
      </button>
      {open && (
        <>
          <div className="click-away" onMouseDown={() => setOpen(false)} />
          <div className="menu env-menu">
            {environments.map((e) => (
              <button
                key={e.id}
                className="menu-item"
                onClick={() => {
                  setActiveEnv(e.id)
                  setOpen(false)
                }}
              >
                <span className={`dot dot-${e.dotColor}`} />
                {e.name}
                {e.id === env?.id && <span className="menu-check">✓</span>}
              </button>
            ))}
            <div className="menu-sep" />
            <button
              className="menu-item menu-accent"
              onClick={() => {
                setOpen(false)
                openEnvEditor()
              }}
            >
              ⚙ Edit variables…<span className="menu-kbd">⌘ E</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

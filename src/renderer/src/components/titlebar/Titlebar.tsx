import { useState } from 'react'
import {
  PanelLeft,
  PanelBottom,
  PanelRight,
  ChevronDown,
  Check,
  Settings,
  Share2
} from 'lucide-react'
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
        <button
          className={view === 'runbook' ? 'seg-btn seg-active' : 'seg-btn'}
          onClick={() => setView('runbook')}
        >
          Runbook
        </button>
        <button
          className={view === 'history' ? 'seg-btn seg-active' : 'seg-btn'}
          onClick={() => setView('history')}
        >
          History
        </button>
        <button
          className={view === 'docs' ? 'seg-btn seg-active' : 'seg-btn'}
          onClick={() => setView('docs')}
        >
          Docs
        </button>
      </div>
      <div className="tb-spacer" />
      {view === 'runbook' && <LayoutToggles />}
      <EnvPill />
      <button className="btn-accent no-drag" onClick={toggleShare}>
        <Share2 size={13} strokeWidth={2} /> Share
      </button>
      <ProfileChip onClick={toggleProfile} />
    </div>
  )
}

/** VSCode-style layout toggles: hide/show sidebar, response pane, history panel. */
function LayoutToggles(): React.JSX.Element {
  const sidebarOpen = useApp((s) => s.settings.sidebarOpen)
  const responsePaneOpen = useApp((s) => s.settings.responsePaneOpen)
  const historyPanelOpen = useApp((s) => s.settings.historyPanelOpen)
  const patchSettings = useApp((s) => s.patchSettings)
  // Active (panel visible) reads darker; hidden reads muted.
  const tint = (on: boolean): string => (on ? 'var(--text)' : 'var(--text3)')
  return (
    <div className="layout-toggles no-drag">
      <button
        className="icon-btn"
        title={`${sidebarOpen ? 'Hide' : 'Show'} sidebar (⌘B)`}
        onClick={() => patchSettings({ sidebarOpen: !sidebarOpen })}
      >
        <PanelLeft size={16} strokeWidth={1.8} color={tint(sidebarOpen)} />
      </button>
      <button
        className="icon-btn"
        title={`${responsePaneOpen ? 'Hide' : 'Show'} response pane (⌘J)`}
        onClick={() => patchSettings({ responsePaneOpen: !responsePaneOpen })}
      >
        <PanelBottom size={16} strokeWidth={1.8} color={tint(responsePaneOpen)} />
      </button>
      <button
        className="icon-btn"
        title={`${historyPanelOpen ? 'Hide' : 'Show'} history panel (⌘⌥B)`}
        onClick={() => patchSettings({ historyPanelOpen: !historyPanelOpen })}
      >
        <PanelRight size={16} strokeWidth={1.8} color={tint(historyPanelOpen)} />
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
        <ChevronDown className="caret" size={13} strokeWidth={2} />
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
                {e.id === env?.id && <Check className="menu-check" size={13} strokeWidth={2.5} />}
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
              <Settings size={13} strokeWidth={2} /> Edit variables…
              <span className="menu-kbd">⌘ E</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

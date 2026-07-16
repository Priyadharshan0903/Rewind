import { useState } from 'react'
import { useApp, useActiveEnv } from '@/stores/app'
import { useUi } from '@/stores/ui'

export function Titlebar(): React.JSX.Element {
  const workspace = useApp((s) => s.workspace)
  const view = useUi((s) => s.view)
  const setView = useUi((s) => s.setView)
  const toggleShare = useUi((s) => s.toggleShare)
  const toggleProfile = useUi((s) => s.toggleProfile)

  return (
    <div className="titlebar">
      <div className="traffic-space" />
      <span className="tb-app">Relay</span>
      <span className="tb-sep">/</span>
      <span className="tb-workspace">{workspace?.name ?? ''}</span>
      <div className="seg no-drag">
        <button className={view === 'runbook' ? 'seg-btn seg-active' : 'seg-btn'} onClick={() => setView('runbook')}>
          Runbook
        </button>
        <button className={view === 'history' ? 'seg-btn seg-active' : 'seg-btn'} onClick={() => setView('history')}>
          History
        </button>
      </div>
      <div className="tb-spacer" />
      <EnvPill />
      <button className="btn-accent no-drag" onClick={toggleShare}>
        ⇪ Share
      </button>
      <button className="profile-chip no-drag" onClick={toggleProfile}>
        <span className="profile-label">you</span>
        <span className="avatar">Y</span>
      </button>
    </div>
  )
}

function EnvPill(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const environments = useApp((s) => s.environments)
  const setActiveEnv = useApp((s) => s.setActiveEnv)
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
          </div>
        </>
      )}
    </div>
  )
}

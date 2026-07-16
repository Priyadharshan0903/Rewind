import type { AccentId } from '@shared/types'
import { ACCENTS } from '@shared/types'
import { useApp } from '@/stores/app'
import { useUi } from '@/stores/ui'
import { Overlay } from '@/components/common/Overlay'

const LIMITS = [
  { label: '256 KB', value: 256 * 1024 },
  { label: '1 MB', value: 1024 * 1024 },
  { label: '4 MB', value: 4 * 1024 * 1024 }
]

export function PreferencesModal(): React.JSX.Element {
  const settings = useApp((s) => s.settings)
  const patchSettings = useApp((s) => s.patchSettings)
  const closeOverlays = useUi((s) => s.closeOverlays)

  return (
    <Overlay onClose={() => closeOverlays()} center>
      <div className="modal prefs-modal">
        <div className="modal-title-row">
          <span className="modal-title">Preferences</span>
          <button className="icon-btn" onClick={() => closeOverlays()}>
            ✕
          </button>
        </div>
        <div className="pref-row">
          <span className="pref-label">Theme</span>
          <div className="seg">
            <button
              className={settings.theme === 'light' ? 'seg-btn seg-active' : 'seg-btn'}
              onClick={() => patchSettings({ theme: 'light' })}
            >
              Light
            </button>
            <button
              className={settings.theme === 'dark' ? 'seg-btn seg-active' : 'seg-btn'}
              onClick={() => patchSettings({ theme: 'dark' })}
            >
              Dark
            </button>
          </div>
        </div>
        <div className="pref-row">
          <span className="pref-label">Accent</span>
          <div className="swatches">
            {(Object.keys(ACCENTS) as AccentId[]).map((id) => (
              <button
                key={id}
                className={settings.accent === id ? 'swatch swatch-active' : 'swatch'}
                style={{ background: ACCENTS[id] }}
                title={id}
                onClick={() => patchSettings({ accent: id })}
              />
            ))}
          </div>
        </div>
        <div className="pref-row">
          <span className="pref-label">History panel</span>
          <label className="include-history">
            <input
              type="checkbox"
              checked={settings.historyPanelOpen}
              onChange={(e) => patchSettings({ historyPanelOpen: e.target.checked })}
            />
            show runs &amp; diff in Runbook
          </label>
        </div>
        <div className="pref-row">
          <span className="pref-label">Response body limit</span>
          <select
            className="role-select"
            value={settings.responseBodyLimitBytes}
            onChange={(e) => patchSettings({ responseBodyLimitBytes: Number(e.target.value) })}
          >
            {LIMITS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div className="modal-footer-note">
          <span className="dot dot-ok" />
          Settings are stored in settings.json next to your workspace data
        </div>
      </div>
    </Overlay>
  )
}

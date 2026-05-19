import styles from './SettingsPanel.module.css'
import Dropdown from './Dropdown.jsx'
import { shortName } from '../lib/format.js'

// 프리셋 컬러 (액센트 + 배경 틴트 모두에 사용)
const COLOR_PRESETS = [
  '#7aa2ff', // 블루
  '#6ddc94', // 그린
  '#ff8a5c', // 오렌지
  '#d28aff', // 퍼플
  '#ffd93d', // 옐로
  '#ff6b8a' // 핑크
]

const SIZE_OPTIONS = [
  { key: 'S', label: 'S' },
  { key: 'M', label: 'M' },
  { key: 'L', label: 'L' }
]

const MODE_OPTIONS = [
  { key: 'dark', label: '다크' },
  { key: 'light', label: '라이트' }
]

export default function SettingsPanel({
  size,
  settings,
  members,
  onChangeMember,
  onToggleAlwaysOnTop,
  onChangeOpacity,
  onChangeThemeColor,
  onChangeMode,
  onChangeSize
}) {
  // 멤버 옵션: value는 풀네임(저장/식별용), label은 성씨 뗀 단축 이름
  const memberOptions = (members ?? []).map((name) => ({
    value: name,
    label: shortName(name)
  }))
  return (
    <div className={`${styles.panel} ${size === 'S' ? styles.panelCompact : ''}`}>
      {/* 사용자 선택 */}
      {memberOptions.length > 0 && (
        <Row label="사용자">
          <Dropdown
            value={settings.activeMember ?? ''}
            options={memberOptions}
            onChange={(v) => onChangeMember(v || null)}
            placeholder="선택…"
          />
        </Row>
      )}

      {/* 항상 위 고정 */}
      <Row label="항상 위에 고정">
        <button
          type="button"
          role="switch"
          aria-checked={settings.alwaysOnTop}
          className={`${styles.toggle} ${settings.alwaysOnTop ? styles.toggleOn : ''}`}
          onClick={() => onToggleAlwaysOnTop(!settings.alwaysOnTop)}
        >
          <span className={styles.toggleKnob} />
        </button>
      </Row>

      {/* 크기 전환 */}
      <Row label="크기">
        <div className={styles.segmented}>
          {SIZE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={`${styles.segment} ${
                settings.size === opt.key ? styles.segmentActive : ''
              }`}
              onClick={() => onChangeSize(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Row>

      {/* 투명도 */}
      <Row label={`투명도 ${Math.round(settings.opacity * 100)}%`}>
        <input
          type="range"
          min="0.4"
          max="1"
          step="0.05"
          value={settings.opacity}
          onChange={(e) => onChangeOpacity(parseFloat(e.target.value))}
          className={styles.range}
        />
      </Row>

      {/* 다크/라이트 모드 */}
      <Row label="모드">
        <div className={styles.segmented}>
          {MODE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={`${styles.segment} ${
                settings.mode === opt.key ? styles.segmentActive : ''
              }`}
              onClick={() => onChangeMode(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Row>

      {/* 테마 컬러 */}
      <Row label="테마 컬러" vertical>
        <div className={styles.colorRow}>
          {COLOR_PRESETS.map((hex) => (
            <button
              key={hex}
              type="button"
              aria-label={`프리셋 ${hex}`}
              className={`${styles.swatch} ${
                settings.themeColor.toLowerCase() === hex.toLowerCase()
                  ? styles.swatchActive
                  : ''
              }`}
              style={{ background: hex }}
              onClick={() => onChangeThemeColor(hex)}
            />
          ))}
          <label className={styles.picker} aria-label="커스텀 컬러">
            <span
              className={styles.pickerDot}
              style={{ background: settings.themeColor }}
            />
            <input
              type="color"
              value={settings.themeColor}
              onChange={(e) => onChangeThemeColor(e.target.value)}
            />
          </label>
        </div>
      </Row>
    </div>
  )
}

function Row({ label, vertical = false, children }) {
  return (
    <div className={`${styles.row} ${vertical ? styles.rowVertical : ''}`}>
      <span className={styles.rowLabel}>{label}</span>
      <div className={styles.rowControl}>{children}</div>
    </div>
  )
}

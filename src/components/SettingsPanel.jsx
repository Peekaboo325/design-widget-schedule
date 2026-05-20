import styles from './SettingsPanel.module.css'
import Dropdown from './Dropdown.jsx'
import { shortName } from '../lib/format.js'
import { hexFromHue, hueFromHex } from '../lib/color.js'

// 프리셋 hue 6개 (60도 간격, 디폴트 핑크 346 시작 기준)
const PRESET_HUES = [346, 30, 90, 150, 210, 270]
const COLOR_PRESETS = PRESET_HUES.map((h) => hexFromHue(h))

export default function SettingsPanel({
  size,
  settings,
  members,
  onChangeMember,
  onToggleAlwaysOnTop,
  onChangeOpacity,
  onChangeThemeColor,
  onChangeLaunchOnBoot
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

      {/* 시작 시 자동 실행 */}
      <Row label="시작 시 자동 실행">
        <button
          type="button"
          role="switch"
          aria-checked={settings.launchOnBoot}
          className={`${styles.toggle} ${settings.launchOnBoot ? styles.toggleOn : ''}`}
          onClick={() => onChangeLaunchOnBoot(!settings.launchOnBoot)}
        >
          <span className={styles.toggleKnob} />
        </button>
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

      {/* 테마 컬러 — hue 슬라이더(두 색 평행이동) + 프리셋 */}
      <Row label="테마 컬러" vertical>
        <div className={styles.colorStack}>
          <input
            type="range"
            min="0"
            max="359"
            step="1"
            value={hueFromHex(settings.themeColor)}
            onChange={(e) =>
              onChangeThemeColor(hexFromHue(parseInt(e.target.value, 10)))
            }
            className={styles.hueSlider}
            aria-label="색상(hue)"
          />
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
          </div>
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

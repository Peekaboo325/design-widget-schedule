import { useEffect, useRef, useState } from 'react'
import styles from './EmojiPicker.module.css'

// 프로필 이모지 피커 — 프리셋 12개 + 직접 입력
// 외부 클릭 / ESC로 닫힘
const PRESETS = ['🐶', '🐱', '🐰', '🐻', '🐼', '🌸', '👑', '💸', '🍩', '🎀']

export default function EmojiPicker({ value, onChange, onClose }) {
  const rootRef = useRef(null)
  const [custom, setCustom] = useState('')

  useEffect(() => {
    function handleClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) onClose()
    }
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  function applyCustom() {
    const trimmed = custom.trim()
    if (!trimmed) return
    // 1 grapheme(이모지 1자)만 적용. surrogate pair는 Array.from으로 안전 분리.
    // 자동 닫힘 X — 시스템 이모지 패널이 떠 있을 수 있고 코드로 닫기 어려우니
    // picker도 함께 두어 사용자가 외부 클릭/ESC로 일관되게 닫도록
    onChange(Array.from(trimmed).slice(0, 1).join(''))
    setCustom('')
  }

  return (
    <div ref={rootRef} className={styles.picker} role="dialog" aria-label="이모지 선택">
      <div className={styles.grid}>
        {PRESETS.map((e) => (
          <button
            key={e}
            type="button"
            className={`${styles.emoji} ${value === e ? styles.emojiActive : ''}`}
            onClick={() => {
              onChange(e)
              onClose()
            }}
            aria-label={e}
          >
            {e}
          </button>
        ))}
      </div>
      <div className={styles.customRow}>
        <input
          type="text"
          placeholder="이모지 더보기"
          value={custom}
          onChange={(e) => {
            // 1 grapheme(이모지 1자)만 허용. 즉시 적용.
            // 자동 닫힘 X — 시스템 이모지 패널이 떠 있을 수 있고 코드로 닫기 어려우니
            // picker도 함께 두어 사용자가 외부 클릭/ESC로 일관되게 닫도록.
            // input은 비워서 다음 이모지 선택도 받을 수 있게
            const v = Array.from(e.target.value).slice(0, 1).join('')
            if (v) onChange(v)
            setCustom('')
          }}
          onFocus={() => {
            // macOS면 시스템 이모지 패널을 자동으로 띄움 (Windows/Linux는 무시)
            window.widgetAPI?.showEmojiPanel?.()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') applyCustom()
          }}
          className={styles.customInput}
        />
        <button
          type="button"
          className={styles.customApply}
          onClick={applyCustom}
          disabled={!custom.trim()}
          aria-label="적용"
        >
          ✓
        </button>
      </div>
    </div>
  )
}

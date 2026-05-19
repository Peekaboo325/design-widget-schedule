import { useMemo } from 'react'
import styles from './ChecklistView.module.css'
import CHECKLIST, { TOTAL_ITEMS, itemKey } from '../data/checklist.js'

// 기획 해석 및 실행 점검 체크리스트
// SPEC: 기록 저장 없음, 순수 본인용. 전체 리셋 버튼 제공.
// 체크 상태는 부모(App)에서 관리 (탭 전환 시 유지, 재시작 시 초기화)
export default function ChecklistView({ checked, onToggle, onResetAll }) {
  const checkedCount = useMemo(
    () => Object.values(checked).filter(Boolean).length,
    [checked]
  )

  return (
    <div className={styles.container}>
      <div className={styles.head}>
        <span className={styles.progress}>
          {checkedCount} / {TOTAL_ITEMS}
        </span>
        <button
          type="button"
          className={styles.resetBtn}
          onClick={onResetAll}
          disabled={checkedCount === 0}
          aria-label="전체 리셋"
        >
          전체 리셋
        </button>
      </div>

      <ul className={styles.sections}>
        {CHECKLIST.map((section) => (
          <li key={section.id} className={styles.section}>
            <h3 className={styles.sectionTitle}>{section.title}</h3>
            <ul className={styles.items}>
              {section.items.map((text, idx) => {
                const key = itemKey(section.id, idx)
                const isChecked = Boolean(checked[key])
                return (
                  <li key={key} className={styles.item}>
                    <label className={styles.label}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={isChecked}
                        onChange={() => onToggle(key)}
                      />
                      <span
                        className={`${styles.text} ${
                          isChecked ? styles.textDone : ''
                        }`}
                      >
                        {text}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}

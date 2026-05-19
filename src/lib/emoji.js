// 멤버 이름 기반 자동 이모지 할당 — 사용자가 직접 설정 안 했을 때
const FALLBACK_POOL = [
  '🐰',
  '🍓',
  '🌸',
  '🐱',
  '🦊',
  '🐻',
  '🍑',
  '🌿',
  '☕',
  '🎨',
  '✨',
  '⭐'
]

function hashString(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export function resolveMemberEmoji(member, map) {
  if (!member) return '🙂'
  const custom = map?.[member]
  if (typeof custom === 'string' && custom.trim()) return custom
  return FALLBACK_POOL[hashString(member) % FALLBACK_POOL.length]
}

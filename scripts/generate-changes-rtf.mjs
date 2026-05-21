// CHANGES.txt(UTF-8) → CHANGES.rtf 변환
// NSIS 인스톨러의 license 페이지는 ANSI 디코딩이라 UTF-8 한국어가 깨짐.
// RTF 포맷은 한국어를 \uXXXX escape으로 표현 → 인코딩 무관하게 정확히 렌더링.
//
// build:win 직전에 자동 실행 (package.json의 prebuild:win)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const srcPath = path.join(projectRoot, 'CHANGES.txt')
const dstPath = path.join(projectRoot, 'CHANGES.rtf')

const content = fs.readFileSync(srcPath, 'utf8')

// RTF 헤더 — Malgun Gothic(맑은 고딕)을 한국어 폰트로, 영문은 기본
// fs20 = 10pt, fcharset129 = 한국어 charset
const rtfHeader =
  '{\\rtf1\\ansi\\ansicpg949\\deff0\\nouicompat\\deflang1042' +
  '{\\fonttbl{\\f0\\fnil\\fcharset129 Malgun Gothic;}}' +
  '\\viewkind4\\uc1\\f0\\fs20 '
const rtfFooter = '}'

function escapeChar(c) {
  if (c === '\n') return '\\par\n'
  if (c === '\r') return ''
  if (c === '\\' || c === '{' || c === '}') return '\\' + c
  const code = c.charCodeAt(0)
  if (code < 128) return c
  // RTF의 \u는 signed 16-bit. 32768 이상은 음수로 표기. ? 는 ANSI fallback char.
  const signed = code > 32767 ? code - 65536 : code
  return `\\u${signed}?`
}

const body = content.split('').map(escapeChar).join('')
fs.writeFileSync(dstPath, rtfHeader + body + rtfFooter, 'ascii')

console.log(`[generate-changes-rtf] ${srcPath} → ${dstPath}`)

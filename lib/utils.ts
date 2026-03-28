import type { NodeRecord, StyleEntry } from './types'

// 基础类型提取函数
export function getString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function getOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function getNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function getOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

export function getBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

export function getList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function getObjectArray(value: unknown): NodeRecord[] {
  return getList(value).filter((item) => typeof item === 'object' && item !== null) as NodeRecord[]
}

// 数值处理
export function toPx(value: number): string {
  return `${roundNumber(value)}px`
}

export function roundNumber(value: number): number {
  return Math.round(value * 100) / 100
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

// 字符串处理
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function escapeVueText(value: string): string {
  return escapeHtml(value)
    .replace(/\{\{/g, '&#123;&#123;')
    .replace(/\}\}/g, '&#125;&#125;')
}

export function escapeJsString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

export function escapeCssUrl(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '')
}

// 错误处理
export function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error
  }

  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }

  try {
    return JSON.stringify(error, null, 2)
  } catch (jsonError) {
    return String(jsonError)
  }
}

// 样式操作
export function pushStyle(styles: StyleEntry[], prop: string, value: string) {
  if (!value) {
    return
  }

  const hasExisting = styles.some((style) => style.prop === prop)
  if (hasExisting) {
    return
  }

  styles.push({ prop, value })
}

export function appendStyle(styles: StyleEntry[], prop: string, value: string, separator = ', ') {
  if (!value) {
    return
  }

  const existing = styles.find((style) => style.prop === prop)
  if (!existing) {
    styles.push({ prop, value })
    return
  }

  if (!existing.value.includes(value)) {
    existing.value = `${existing.value}${separator}${value}`
  }
}

// 类名处理
export function sanitizeClassName(value: string): string {
  const normalized = value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()

  if (!normalized) {
    return ''
  }

  return /^[a-z_]/.test(normalized) ? normalized : `node-${normalized}`
}

export function toPascalCase(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9]+/g, ' ').trim()
  if (!normalized) {
    return 'MastergoLayout'
  }

  const pascalCase = normalized
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')

  return /^[A-Za-z_]/.test(pascalCase) ? pascalCase : `Mastergo${pascalCase}`
}

// Base64 编码
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let output = ''

  for (let index = 0; index < bytes.length; index += 3) {
    const byte1 = bytes[index]
    const byte2 = index + 1 < bytes.length ? bytes[index + 1] : 0
    const byte3 = index + 2 < bytes.length ? bytes[index + 2] : 0
    const chunk = (byte1 << 16) | (byte2 << 8) | byte3

    output += alphabet[(chunk >> 18) & 63]
    output += alphabet[(chunk >> 12) & 63]
    output += index + 1 < bytes.length ? alphabet[(chunk >> 6) & 63] : '='
    output += index + 2 < bytes.length ? alphabet[chunk & 63] : '='
  }

  return output
}
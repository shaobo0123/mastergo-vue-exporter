import type { GeneratorSettings, GenerateEvent, SnippetBlock, SnippetLanguage, StyleFormat, ExportImageFormat, AssetRenderMode, CodeFile } from './types'
import { DEFAULT_GENERATOR_SETTINGS, SETTINGS_STORAGE_KEY, PROMPT_STORAGE_KEY } from './constants'
import { getString, escapeHtml, getErrorMessage } from './utils'
import promptTemplate from '../prompt.md?raw'

const DEFAULT_PROMPT_TEMPLATE = promptTemplate.trim()

// 配置解析
export async function resolveGeneratorSettings(data?: GenerateEvent): Promise<GeneratorSettings> {
  const storedSettings = normalizePartialGeneratorSettings(await mg.clientStorage.getAsync(SETTINGS_STORAGE_KEY))
  const legacySettings = data ? resolveLegacyGeneratorSettings(data) : {}

  return normalizeGeneratorSettings({
    ...DEFAULT_GENERATOR_SETTINGS,
    ...legacySettings,
    ...storedSettings,
  })
}

export async function buildUiState(): Promise<GeneratorSettings & { promptContent: string }> {
  return {
    ...(await resolveGeneratorSettings()),
    promptContent: await resolveStoredPrompt(),
  }
}

export async function resolveStoredPrompt(): Promise<string> {
  return normalizePromptContent(await mg.clientStorage.getAsync(PROMPT_STORAGE_KEY))
}

function resolveLegacyGeneratorSettings(data: GenerateEvent): Partial<GeneratorSettings> {
  const preferences = getPreferencesRecord(data.preferences)
  const settings: Partial<GeneratorSettings> = {}
  settings.framework = normalizeLanguage(data.language)
  const directStyleFormat = normalizeStyleFormat(data.styleFormat)
  const preferredStyleFormat = normalizeStyleFormat(preferences.styleFormat)
  const styleFormat = directStyleFormat || preferredStyleFormat

  if (styleFormat) {
    settings.styleFormat = styleFormat
  }

  const mode = getString(preferences.styleExtractMode)
  if (mode === 'off' || mode === 'layout') {
    settings.styleExtractionMode = mode
  } else if (mode === 'full') {
    settings.styleExtractionMode = 'layout'
  } else if (getString(preferences.extractStyles) === 'off') {
    settings.styleExtractionMode = 'off'
  }

  if ('exportImages' in preferences) {
    settings.exportImages = resolveExportImagesPreference(preferences.exportImages)
  }

  const imageFormat = resolveExportImageFormat(preferences.imageFormat)
  if (preferences.imageFormat !== undefined) {
    settings.imageFormat = imageFormat
  }

  if (preferences.imageScale !== undefined) {
    settings.imageScale = normalizeImageScale(preferences.imageScale)
  }

  const assetRenderMode = resolveAssetRenderMode(preferences.assetRenderMode)
  if (preferences.assetRenderMode !== undefined) {
    settings.assetRenderMode = assetRenderMode
  }

  return settings
}

function getPreferencesRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

export function getMessageRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const record = value as Record<string, unknown>
  const pluginMessage = record.pluginMessage
  if (pluginMessage && typeof pluginMessage === 'object' && !Array.isArray(pluginMessage)) {
    return pluginMessage as Record<string, unknown>
  }
  return record
}

function resolveExportImagesPreference(value: unknown): boolean {
  return getString(value) !== 'off'
}

function resolveExportImageFormat(value: unknown): ExportImageFormat {
  const format = getString(value).toUpperCase()
  return format === 'JPG' || format === 'WEBP' || format === 'SVG' ? format : 'PNG'
}

function resolveAssetRenderMode(value: unknown): AssetRenderMode {
  const mode = getString(value).toLowerCase()
  return mode === 'css' || mode === 'image' ? mode : 'auto'
}

function normalizeStyleFormat(value: unknown): StyleFormat | '' {
  return value === 'scss' ? 'scss' : value === 'css' ? 'css' : ''
}

function normalizeImageScale(value: unknown): string {
  const scale = getString(value)
  return scale === '1' || scale === '3' || scale === '4' ? scale : '2'
}

export function normalizePromptContent(value: unknown): string {
  if (typeof value !== 'string') {
    return DEFAULT_PROMPT_TEMPLATE
  }
  const content = value.replace(/\r\n?/g, '\n').trim()
  return content || DEFAULT_PROMPT_TEMPLATE
}

function normalizePartialGeneratorSettings(value: unknown): Partial<GeneratorSettings> {
  const data = getMessageRecord(value)
  const partial: Partial<GeneratorSettings> = {}
  const framework = normalizeLanguage(data.framework as string | undefined)
  const styleFormat = normalizeStyleFormat(data.styleFormat)
  const styleExtractionMode = getString(data.styleExtractionMode)
  const imageFormat = resolveExportImageFormat(data.imageFormat)
  const assetRenderMode = resolveAssetRenderMode(data.assetRenderMode)

  if (data.framework !== undefined) {
    partial.framework = framework
  }

  if (typeof data.useOfficialCodegen === 'boolean') {
    partial.useOfficialCodegen = data.useOfficialCodegen
  }

  if (styleFormat) {
    partial.styleFormat = styleFormat
  }

  if (styleExtractionMode === 'off' || styleExtractionMode === 'layout') {
    partial.styleExtractionMode = styleExtractionMode
  } else if (styleExtractionMode === 'full') {
    partial.styleExtractionMode = 'layout'
  }

  if (typeof data.exportImages === 'boolean') {
    partial.exportImages = data.exportImages
  }

  if (data.assetRenderMode !== undefined) {
    partial.assetRenderMode = assetRenderMode
  }

  if (data.imageFormat !== undefined) {
    partial.imageFormat = imageFormat
  }

  if (data.imageScale !== undefined) {
    partial.imageScale = normalizeImageScale(data.imageScale)
  }

  return partial
}

export function normalizeGeneratorSettings(value: unknown): GeneratorSettings {
  const partial = normalizePartialGeneratorSettings(value)

  return {
    framework: partial.framework || DEFAULT_GENERATOR_SETTINGS.framework,
    useOfficialCodegen: partial.useOfficialCodegen ?? DEFAULT_GENERATOR_SETTINGS.useOfficialCodegen,
    styleFormat: partial.styleFormat || DEFAULT_GENERATOR_SETTINGS.styleFormat,
    styleExtractionMode: partial.styleExtractionMode || DEFAULT_GENERATOR_SETTINGS.styleExtractionMode,
    exportImages: partial.exportImages ?? DEFAULT_GENERATOR_SETTINGS.exportImages,
    assetRenderMode: partial.assetRenderMode || DEFAULT_GENERATOR_SETTINGS.assetRenderMode,
    imageFormat: partial.imageFormat || DEFAULT_GENERATOR_SETTINGS.imageFormat,
    imageScale: partial.imageScale || DEFAULT_GENERATOR_SETTINGS.imageScale,
  }
}

function normalizeLanguage(value?: string): SnippetLanguage {
  return value === 'vue2' ? 'vue2' : 'vue3'
}

// Official Codegen
export function mapFrameworkToCodegen(framework: SnippetLanguage): MGDSL.Framework {
  return framework === 'vue2' ? 'VUE2' : 'VUE3'
}

export function buildOfficialCodegenUnavailableBlock(reason: string): SnippetBlock {
  return {
    language: 'html',
    title: 'SwitchToSnippetMode.txt',
    code: [
      '<!-- Official Codegen unavailable -->',
      `<!-- ${escapeHtml(reason)} -->`,
      '<!-- Disable Official Codegen in plugin settings and regenerate snippets. -->',
    ].join('\n'),
  }
}

export async function buildOfficialCodegenSnippets(layerId: string, framework: SnippetLanguage): Promise<SnippetBlock[]> {
  if (!mg.codegen || typeof mg.codegen.getCode !== 'function') {
    return [buildOfficialCodegenUnavailableBlock('Current environment does not support Official Codegen.')]
  }

  try {
    const codeFile = await mg.codegen.getCode(layerId, mapFrameworkToCodegen(framework))
    const blocks = flattenCodeFile(codeFile)
      .filter((file) => typeof file.code === 'string' && file.code.trim())
      .map((file) => ({
        language: mapCodeFileTypeToSnippetLanguage(file.type),
        title: file.fileName || file.relativePath || file.path || 'OfficialCodegen',
        code: file.code,
      }))

    if (blocks.length) {
      return blocks
    }
    return [buildOfficialCodegenUnavailableBlock('Official Codegen returned no usable code.')]
  } catch (error) {
    return [buildOfficialCodegenUnavailableBlock(`Official Codegen failed: ${getErrorMessage(error)}`)]
  }
}

function flattenCodeFile(codeFile: CodeFile | null | undefined): CodeFile[] {
  if (!codeFile) {
    return []
  }
  const chunks = Array.isArray(codeFile.chunks) ? codeFile.chunks.flatMap((chunk) => flattenCodeFile(chunk)) : []
  return [codeFile, ...chunks]
}

function mapCodeFileTypeToSnippetLanguage(type: CodeFile['type']): string {
  switch (type) {
    case 'css':
      return 'css'
    case 'typescript':
      return 'typescript'
    case 'ts-definition':
      return 'typescript'
    case 'vue':
      return 'html'
    case 'js':
      return 'javascript'
    case 'react':
      return 'jsx'
    case 'xml':
      return 'xml'
    case 'java':
      return 'java'
    case 'kt':
      return 'kotlin'
    default:
      return 'text'
  }
}

// 导出存储键和默认模板供消息处理使用
export { SETTINGS_STORAGE_KEY, PROMPT_STORAGE_KEY, DEFAULT_GENERATOR_SETTINGS, DEFAULT_PROMPT_TEMPLATE }

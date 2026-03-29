import type {
  GeneratorSettings,
  AssetExportOptions,
  ExportableNode,
  ExportSettingsImage,
  ExportSettingsSVG,
  ExportImageFormat,
  AssetRef,
  AssetManifest,
  AssetManifestEntry,
  AssetContentEncoding,
  BuildContext,
} from './types'
import { uint8ArrayToBase64, getErrorMessage, getNumber, getString, hashString, sanitizeFileName } from './utils'
import { shouldRasterizeNode } from './node'

// 配置转换
export function resolveAssetExportOptions(settings: GeneratorSettings): AssetExportOptions {
  return {
    enabled: settings.exportImages,
    format: settings.imageFormat,
    scale: resolveExportImageScale(settings.imageScale),
    renderMode: settings.assetRenderMode,
  }
}

function resolveExportImageScale(value: string): number {
  const parsed = Number(value)
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed
  }
  return 2
}

// 图片导出
export async function resolveRasterAssetRef(
  rawNode: ExportableNode,
  type: string,
  name: string,
  assetExport: AssetExportOptions,
  context: BuildContext,
  pushWarningFn: (message: string) => void,
): Promise<AssetRef | null> {
  if (!assetExport.enabled) {
    return null
  }

  if (!shouldRasterizeNode(rawNode, type, assetExport.renderMode)) {
    return null
  }

  try {
    const exported = await exportNodeAsImage(rawNode, assetExport)
    const assetPayload = toAssetPayload(exported, assetExport.format)
    if (!assetPayload) {
      pushWarningFn(`${name}: ${assetExport.format} ${assetExport.scale}x export returned empty data.`)
      return null
    }
    return registerAsset(context, rawNode, name, assetExport.format, assetPayload)
  } catch (error) {
    pushWarningFn(`${name}: ${assetExport.format} ${assetExport.scale}x export failed: ${getErrorMessage(error)}`)
    return null
  }
}

async function exportNodeAsImage(rawNode: ExportableNode, assetExport: AssetExportOptions): Promise<Uint8Array | string> {
  const exportSettings = createImageExportSettings(assetExport)

  if (typeof rawNode.exportAsync === 'function') {
    return rawNode.exportAsync(exportSettings)
  }

  if (typeof rawNode.export === 'function') {
    return rawNode.export(exportSettings)
  }

  throw new Error('Node does not support export/exportAsync.')
}

function createImageExportSettings(assetExport: AssetExportOptions): ExportSettingsImage | ExportSettingsSVG {
  if (assetExport.format === 'SVG') {
    return {
      format: 'SVG',
    }
  }

  return {
    format: assetExport.format,
    constraint: {
      type: 'SCALE',
      value: assetExport.scale,
    },
    useAbsoluteBounds: true,
    useRenderBounds: false,
  }
}

type AssetPayload = {
  mimeType: string
  extension: string
  encoding: AssetContentEncoding
  content: string
}

function toAssetPayload(exported: Uint8Array | string, format: ExportImageFormat): AssetPayload | null {
  if (typeof exported === 'string') {
    const parsedDataUrl = parseDataUrl(exported, format)
    if (parsedDataUrl) {
      return parsedDataUrl
    }

    if (format === 'SVG') {
      const normalized = normalizeSvgMarkup(exported)
      if (!normalized) {
        return null
      }

      return {
        mimeType: resolveImageMimeType(format),
        extension: resolveImageExtension(format),
        encoding: 'utf8',
        content: normalized,
      }
    }

    return null
  }

  if (!(exported instanceof Uint8Array) || exported.length === 0) {
    return null
  }

  return {
    mimeType: resolveImageMimeType(format),
    extension: resolveImageExtension(format),
    encoding: 'base64',
    content: uint8ArrayToBase64(exported),
  }
}

function resolveImageMimeType(format: ExportImageFormat): string {
  switch (format) {
    case 'JPG':
      return 'image/jpeg'
    case 'SVG':
      return 'image/svg+xml'
    case 'WEBP':
      return 'image/webp'
    case 'PNG':
    default:
      return 'image/png'
  }
}

function resolveImageExtension(format: ExportImageFormat): string {
  switch (format) {
    case 'JPG':
      return 'jpg'
    case 'SVG':
      return 'svg'
    case 'WEBP':
      return 'webp'
    case 'PNG':
    default:
      return 'png'
  }
}

function parseDataUrl(value: string, format: ExportImageFormat): AssetPayload | null {
  if (!value.startsWith('data:')) {
    return null
  }

  const separatorIndex = value.indexOf(',')
  if (separatorIndex < 0) {
    return null
  }

  const meta = value.slice(5, separatorIndex)
  const body = value.slice(separatorIndex + 1)
  const segments = meta.split(';').filter(Boolean)
  const mimeType = segments[0] || resolveImageMimeType(format)
  const isBase64 = segments.includes('base64')
  const content = isBase64 ? body : decodeDataUrlContent(body)

  if (!content) {
    return null
  }

  const normalizedContent = mimeType === 'image/svg+xml' ? normalizeSvgMarkup(content) : content
  if (!normalizedContent) {
    return null
  }

  return {
    mimeType,
    extension: resolveImageExtension(format),
    encoding: isBase64 ? 'base64' : 'utf8',
    content: normalizedContent,
  }
}

function decodeDataUrlContent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function normalizeSvgMarkup(svg: string): string {
  const normalized = svg.replace(/\r\n?/g, '\n').trim()
  return normalized
}

function registerAsset(
  context: BuildContext,
  rawNode: ExportableNode,
  name: string,
  format: ExportImageFormat,
  assetPayload: AssetPayload,
): AssetRef {
  const hash = hashString([assetPayload.mimeType, assetPayload.encoding, assetPayload.content].join('\u0000'))
  const cached = context.assetIndexByHash[hash]

  if (cached) {
    return cached
  }

  const fileName = createAssetFileName(name, assetPayload.extension, context)
  const assetRef: AssetRef = {
    id: `asset-${context.assets.length + 1}`,
    fileName,
    relativePath: `./generated-assets/${fileName}`,
    mimeType: assetPayload.mimeType,
    format,
    width: Math.max(0, Math.round(getNumber(rawNode.width))),
    height: Math.max(0, Math.round(getNumber(rawNode.height))),
  }

  const manifestEntry: AssetManifestEntry = {
    ...assetRef,
    nodeId: getString(rawNode.id),
    nodeName: name,
    hash,
    encoding: assetPayload.encoding,
    content: assetPayload.content,
  }

  context.assetIndexByHash[hash] = assetRef
  context.assets.push(manifestEntry)

  return assetRef
}

function createAssetFileName(name: string, extension: string, context: BuildContext): string {
  const baseName = sanitizeFileName(name, 'asset')
  const used = context.assetFileNameCount[baseName] || 0
  context.assetFileNameCount[baseName] = used + 1
  return `${used === 0 ? baseName : `${baseName}-${used + 1}`}.${extension}`
}

export function buildAssetManifest(assets: AssetManifestEntry[]): AssetManifest {
  return {
    version: 1,
    basePath: './generated-assets',
    assets,
  }
}

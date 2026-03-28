import type { GeneratorSettings, AssetExportOptions, ExportableNode, ExportSettingsImage, ExportSettingsSVG, ExportImageFormat } from './types'
import { uint8ArrayToBase64, getErrorMessage } from './utils'
import { shouldRasterizeNode, pushWarning } from './node'

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
export async function resolveRasterAssetDataUrl(
  rawNode: ExportableNode,
  type: string,
  name: string,
  assetExport: AssetExportOptions,
  pushWarningFn: (message: string) => void,
): Promise<string> {
  if (!assetExport.enabled) {
    return ''
  }

  if (!shouldRasterizeNode(rawNode, type, assetExport.renderMode)) {
    return ''
  }

  try {
    const exported = await exportNodeAsImage(rawNode, assetExport)
    const dataUrl = toImageDataUrl(exported, assetExport.format)
    if (!dataUrl) {
      pushWarningFn(`${name}: ${assetExport.format} ${assetExport.scale}x export returned empty data.`)
    }
    return dataUrl
  } catch (error) {
    pushWarningFn(`${name}: ${assetExport.format} ${assetExport.scale}x export failed: ${getErrorMessage(error)}`)
    return ''
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

function toImageDataUrl(exported: Uint8Array | string, format: ExportImageFormat): string {
  if (typeof exported === 'string') {
    if (exported.startsWith('data:image/')) {
      return exported
    }
    if (format === 'SVG') {
      return svgToDataUrl(exported)
    }
    return ''
  }

  if (!(exported instanceof Uint8Array) || exported.length === 0) {
    return ''
  }

  return `data:${resolveImageMimeType(format)};base64,${uint8ArrayToBase64(exported)}`
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

function svgToDataUrl(svg: string): string {
  const normalized = svg.replace(/\r?\n/g, ' ').trim()
  if (!normalized) {
    return ''
  }
  return `data:image/svg+xml;charset=utf-8,${encodeSvgData(normalized)}`
}

function encodeSvgData(svg: string): string {
  return svg
    .replace(/%/g, '%25')
    .replace(/#/g, '%23')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')
    .replace(/"/g, "'")
    .replace(/\s+/g, ' ')
}
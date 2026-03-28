// Vue 导出插件类型定义

export type SnippetLanguage = 'vue3' | 'vue2'
export type StyleFormat = 'css' | 'scss'
export type StyleExtractionMode = 'off' | 'layout' | 'full'
export type AssetRenderMode = 'css' | 'auto' | 'image'
export type ExportImageFormat = 'PNG' | 'JPG' | 'WEBP' | 'SVG'

export type GenerateEvent = {
  layerId: string
  language?: SnippetLanguage | string
  styleFormat?: StyleFormat | string
  preferences?: Record<string, unknown>
}

export type SnippetBlock = {
  language: string
  code: string
  title: string
}

export type NodeRecord = Record<string, unknown>

export type ExportSettingsConstraints = {
  type: 'SCALE' | 'WIDTH' | 'HEIGHT'
  value: number
}

export type ExportSettingsImage = {
  format: 'PNG' | 'JPG' | 'WEBP'
  constraint?: ExportSettingsConstraints
  useAbsoluteBounds?: boolean
  useRenderBounds?: boolean
}

export type ExportSettingsSVG = {
  format: 'SVG'
  isSuffix?: boolean
  fileName?: string
}

export type AssetExportOptions = {
  enabled: boolean
  format: ExportImageFormat
  scale: number
  renderMode: AssetRenderMode
}

export type GeneratorSettings = {
  framework: SnippetLanguage
  useOfficialCodegen: boolean
  styleFormat: StyleFormat
  styleExtractionMode: StyleExtractionMode
  exportImages: boolean
  assetRenderMode: AssetRenderMode
  imageFormat: ExportImageFormat
  imageScale: string
}

export type ExportableNode = NodeRecord & {
  exportAsync?: (settings?: ExportSettingsImage | ExportSettingsSVG) => Promise<Uint8Array | string>
  export?: (settings?: ExportSettingsImage | ExportSettingsSVG) => Uint8Array | string
}

export type StyleEntry = {
  prop: string
  value: string
}

export type BackgroundLayer = {
  image: string
  size: string
  position: string
  repeat: string
  blendMode: string
  solidColor?: string
}

export type SharedStyleBlock = {
  className: string
  styles: StyleEntry[]
}

export type StyleExtractionResult = {
  sharedBlocks: SharedStyleBlock[]
  classNamesByNodeId: Record<string, string[]>
  nodeStylesByNodeId: Record<string, StyleEntry[]>
}

export type RenderNode = {
  id: string
  name: string
  type: string
  tag: string
  className: string
  text: string
  styles: StyleEntry[]
  children: RenderNode[]
  rasterAssetDataUrl: string
}

export type BuildContext = {
  classNameCount: Record<string, number>
  warnings: string[]
  assetExport: AssetExportOptions
  styleCodeCache: Record<string, StyleEntry[]>
  styleExtractionMode: StyleExtractionMode
}

// MasterGo CodeFile 类型 (来自官方 API)
export type CodeFile = {
  type: 'css' | 'typescript' | 'ts-definition' | 'vue' | 'js' | 'react' | 'xml' | 'java' | 'kt' | string
  code: string
  fileName?: string
  relativePath?: string
  path?: string
  chunks?: CodeFile[]
}
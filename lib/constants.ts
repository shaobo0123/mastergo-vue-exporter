import type { GeneratorSettings } from './types'

// 布局共享样式属性白名单
export const LAYOUT_SHARED_STYLE_PROP_ALLOWLIST = new Set([
  'box-sizing',
  'display',
  'flex-direction',
  'justify-content',
  'align-items',
  'flex-wrap',
  'align-self',
  'gap',
])

// 存储键名
export const SETTINGS_STORAGE_KEY = 'vue-exporter-settings'
export const PROMPT_STORAGE_KEY = 'vue-exporter-prompt'
export const ASSET_BUNDLE_STORAGE_KEY = 'vue-exporter-asset-bundle'

// 默认生成器设置
export const DEFAULT_GENERATOR_SETTINGS: GeneratorSettings = {
  framework: 'vue3',
  useOfficialCodegen: false,
  styleFormat: 'css',
  styleExtractionMode: 'layout',
  exportImages: true,
  assetRenderMode: 'auto',
  imageFormat: 'PNG',
  imageScale: '2',
}

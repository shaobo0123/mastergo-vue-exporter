import { PluginMessage, UIMessage, sendMsgToUI } from '@messages/sender'
import promptTemplate from '../prompt.md?raw'

declare const __html__: string

type SnippetLanguage = 'vue3' | 'vue2'
type StyleFormat = 'css' | 'scss'
type ExportImageFormat = 'PNG' | 'JPG' | 'WEBP' | 'SVG'
type AssetRenderMode = 'css' | 'auto' | 'image'
type StyleExtractionMode = 'off' | 'layout' | 'full'

type GenerateEvent = {
  layerId: string
  language?: SnippetLanguage | string
  styleFormat?: StyleFormat | string
  preferences?: Record<string, unknown>
}

type SnippetBlock = {
  language: string
  code: string
  title: string
}

type NodeRecord = Record<string, unknown>

type ExportSettingsConstraints = {
  type: 'SCALE' | 'WIDTH' | 'HEIGHT'
  value: number
}

type ExportSettingsImage = {
  format: 'PNG' | 'JPG' | 'WEBP'
  constraint?: ExportSettingsConstraints
  useAbsoluteBounds?: boolean
  useRenderBounds?: boolean
}

type ExportSettingsSVG = {
  format: 'SVG'
  isSuffix?: boolean
  fileName?: string
}

type AssetExportOptions = {
  enabled: boolean
  format: ExportImageFormat
  scale: number
  renderMode: AssetRenderMode
}

type GeneratorSettings = {
  framework: SnippetLanguage
  useOfficialCodegen: boolean
  styleFormat: StyleFormat
  styleExtractionMode: StyleExtractionMode
  exportImages: boolean
  assetRenderMode: AssetRenderMode
  imageFormat: ExportImageFormat
  imageScale: string
}

type ExportableNode = NodeRecord & {
  exportAsync?: (settings?: ExportSettingsImage | ExportSettingsSVG) => Promise<Uint8Array | string>
  export?: (settings?: ExportSettingsImage | ExportSettingsSVG) => Uint8Array | string
}

type StyleEntry = {
  prop: string
  value: string
}

type BackgroundLayer = {
  image: string
  size: string
  position: string
  repeat: string
  blendMode: string
  solidColor?: string
}

type SharedStyleBlock = {
  className: string
  styles: StyleEntry[]
}

type StyleExtractionResult = {
  sharedBlocks: SharedStyleBlock[]
  classNamesByNodeId: Record<string, string[]>
  nodeStylesByNodeId: Record<string, StyleEntry[]>
}

type RenderNode = {
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

type BuildContext = {
  classNameCount: Record<string, number>
  warnings: string[]
  assetExport: AssetExportOptions
  styleCodeCache: Record<string, StyleEntry[]>
  styleExtractionMode: StyleExtractionMode
}

const LAYOUT_SHARED_STYLE_PROP_ALLOWLIST = new Set([
  'box-sizing',
  'display',
  'flex-direction',
  'justify-content',
  'align-items',
  'flex-wrap',
  'align-self',
  'gap',
])
const SETTINGS_STORAGE_KEY = 'vue-exporter-settings'
const PROMPT_STORAGE_KEY = 'vue-exporter-prompt'
const DEFAULT_GENERATOR_SETTINGS: GeneratorSettings = {
  framework: 'vue3',
  useOfficialCodegen: false,
  styleFormat: 'css',
  styleExtractionMode: 'layout',
  exportImages: true,
  assetRenderMode: 'auto',
  imageFormat: 'PNG',
  imageScale: '2',
}
const DEFAULT_PROMPT_TEMPLATE = promptTemplate.trim()

mg.showUI(__html__, {
  width: 420,
  height: 780,
  visible: false,
})

mg.snippetgen.on('generate', (data: GenerateEvent, callback: (blocks: SnippetBlock[]) => void) => {
  void buildSnippets(data)
    .then((blocks) => callback(blocks))
    .catch((error: unknown) => {
      callback([
        {
          language: 'javascript',
          title: 'Error',
          code: `// Failed to generate Vue code\n${getErrorMessage(error)}`,
        },
      ])
    })
})

mg.snippetgen.on('action', (value: string) => {
  if (value === 'openSettings') {
    mg.ui.show()
    return
  }

  mg.notify(`Snippet action: ${value}`)
})

mg.ui.onmessage = (message: unknown) => {
  void handleUiMessage(message).catch((error: unknown) => {
    const errorMessage = getErrorMessage(error)
    sendMsgToUI({
      type: PluginMessage.ERROR,
      data: {
        message: errorMessage,
      },
    })
    mg.notify(`璁剧疆澶勭悊澶辫触: ${errorMessage}`, { type: 'error' })
  })
}

async function buildSnippets(data: GenerateEvent): Promise<SnippetBlock[]> {
  const rawNode = mg.getNodeById(data.layerId) as unknown

  if (!rawNode || typeof rawNode !== 'object') {
    return [
      {
        language: 'javascript',
        title: 'Unavailable',
        code: '// No node is available for the selected layer.',
      },
    ]
  }

  const settings = await resolveGeneratorSettings(data)
  if (settings.useOfficialCodegen) {
    return buildOfficialCodegenSnippets(data.layerId, settings.framework)
  }

  const context: BuildContext = {
    classNameCount: {},
    warnings: [],
    assetExport: resolveAssetExportOptions(settings),
    styleCodeCache: {},
    styleExtractionMode: settings.styleExtractionMode,
  }

  const root = normalizeRenderTree(await createRenderNode(rawNode as ExportableNode, null, context), true)
  const styleExtraction = buildStyleExtraction(root, context.styleExtractionMode)
  const componentName = toPascalCase(root.name || 'MastergoLayout')
  const styleFormat = settings.styleFormat
  const template = buildTemplate(root, 1, styleExtraction)
  const styleContent = buildStyleSheet(root, styleExtraction)
  const noteComment = buildWarningComment(context.warnings)
  const vueSfc = buildVueSfc(template, styleContent, styleFormat, noteComment, settings.framework, componentName)

  return [
    {
      language: 'html',
      title: `${componentName}.vue`,
      code: vueSfc,
    },
  ]
}

async function buildOfficialCodegenSnippets(layerId: string, framework: SnippetLanguage): Promise<SnippetBlock[]> {
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

async function handleUiMessage(message: unknown): Promise<void> {
  const data = getMessageRecord(message)
  const type = getString(data.type)

  if (type === UIMessage.GET_SETTINGS) {
    sendMsgToUI({
      type: PluginMessage.SETTINGS,
      data: await buildUiState(),
    })
    return
  }

  if (type === UIMessage.SAVE_SETTINGS) {
    const settings = normalizeGeneratorSettings(data.data)
    await mg.clientStorage.setAsync(SETTINGS_STORAGE_KEY, settings)
    sendMsgToUI({
      type: PluginMessage.SETTINGS_SAVED,
      data: {
        ...settings,
        promptContent: await resolveStoredPrompt(),
      },
    })
    mg.notify('导出设置已保存。', { type: 'success' })
    return
  }

  if (type === UIMessage.RESET_SETTINGS) {
    await mg.clientStorage.setAsync(SETTINGS_STORAGE_KEY, DEFAULT_GENERATOR_SETTINGS)
    sendMsgToUI({
      type: PluginMessage.SETTINGS_SAVED,
      data: {
        ...DEFAULT_GENERATOR_SETTINGS,
        promptContent: await resolveStoredPrompt(),
      },
    })
    mg.notify('导出设置已恢复默认。', { type: 'success' })
    return
  }

  if (type === UIMessage.SAVE_PROMPT) {
    const promptContent = normalizePromptContent(data.data)
    await mg.clientStorage.setAsync(PROMPT_STORAGE_KEY, promptContent)
    sendMsgToUI({
      type: PluginMessage.PROMPT_SAVED,
      data: {
        promptContent,
      },
    })
    mg.notify('提示词已保存。', { type: 'success' })
    return
  }

  if (type === UIMessage.RESET_PROMPT) {
    await mg.clientStorage.setAsync(PROMPT_STORAGE_KEY, DEFAULT_PROMPT_TEMPLATE)
    sendMsgToUI({
      type: PluginMessage.PROMPT_SAVED,
      data: {
        promptContent: DEFAULT_PROMPT_TEMPLATE,
      },
    })
    mg.notify('提示词已恢复默认。', { type: 'success' })
    return
  }

  if (type === UIMessage.HIDE_SETTINGS) {
    mg.ui.hide()
  }
}

async function createRenderNode(rawNode: ExportableNode, parentLayoutMode: string | null, context: BuildContext): Promise<RenderNode> {
  const type = normalizeNodeType(getString(rawNode.type))
  const name = getString(rawNode.name) || type.toLowerCase()
  const layoutMode = normalizeLayoutMode(getString(rawNode.layoutMode))
  const rasterAssetDataUrl = await resolveRasterAssetDataUrl(rawNode, type, name, context)
  const children = rasterAssetDataUrl
    ? []
    : await Promise.all(
        getChildren(rawNode)
          .filter((child) => isNodeVisible(child))
          .map((child) => createRenderNode(child as ExportableNode, layoutMode, context)),
      )

  const unsupportedFillTypes = getUnsupportedFillTypes(rawNode)
  if (unsupportedFillTypes.length) {
    pushWarning(context, `${name}: unsupported fill types are ignored: ${unsupportedFillTypes.join(', ')}.`)
  }

  return {
    id: getString(rawNode.id),
    name,
    type,
    tag: pickTag(type, children.length > 0),
    className: createClassName(name, context),
    text: getNodeText(rawNode, type),
    styles: buildNodeStyles(rawNode, type, layoutMode, parentLayoutMode, children.length > 0, rasterAssetDataUrl, context),
    children,
    rasterAssetDataUrl,
  }
}

function normalizeRenderTree(node: RenderNode, isRoot = false): RenderNode {
  const normalizedChildren = node.children
    .map((child) => normalizeRenderTree(child))
    .filter((child): child is RenderNode => !isRedundantEmptyNode(child))

  const normalizedNode: RenderNode = {
    ...node,
    children: normalizedChildren,
  }

  if (!isRoot && isNeutralWrapperNode(normalizedNode)) {
    return normalizedNode.children[0]
  }

  return normalizedNode
}

function buildNodeStyles(
  rawNode: NodeRecord,
  type: string,
  layoutMode: string,
  parentLayoutMode: string | null,
  hasChildren: boolean,
  rasterAssetDataUrl: string,
  context: BuildContext,
): StyleEntry[] {
  const styles: StyleEntry[] = []
  const width = getNumber(rawNode.width)
  const height = getNumber(rawNode.height)
  const x = getNumber(rawNode.x)
  const y = getNumber(rawNode.y)
  const opacity = getNumber(rawNode.opacity)
  const rotation = getNumber(rawNode.rotation)
  const zIndex = getOptionalNumber((rawNode as Record<string, unknown>).zIndex)
  const layoutGrow = getNumber(rawNode.layoutGrow)
  const layoutAlign = getString(rawNode.layoutAlign)
  const itemSpacing = getNumber(rawNode.itemSpacing)
  const clipContent = getBoolean(rawNode.clipsContent)

  pushStyle(styles, 'box-sizing', 'border-box')

  if (parentLayoutMode === 'NONE') {
    pushStyle(styles, 'position', 'absolute')
    pushStyle(styles, 'left', toPx(x))
    pushStyle(styles, 'top', toPx(y))
  } else if (!parentLayoutMode) {
    pushStyle(styles, 'position', 'relative')
  }

  if (hasChildren && layoutMode === 'NONE') {
    pushStyle(styles, 'position', 'relative')
  }

  if (layoutMode === 'HORIZONTAL' || layoutMode === 'VERTICAL') {
    pushStyle(styles, 'display', 'flex')
    pushStyle(styles, 'flex-direction', layoutMode === 'HORIZONTAL' ? 'row' : 'column')
    pushStyle(styles, 'justify-content', mapPrimaryAxisAlign(getString(rawNode.primaryAxisAlignItems)))
    pushStyle(styles, 'align-items', mapCounterAxisAlign(getString(rawNode.counterAxisAlignItems)))
    pushStyle(styles, 'gap', toPx(itemSpacing))

    if (normalizeWrap(getString(rawNode.layoutWrap)) === 'WRAP') {
      pushStyle(styles, 'flex-wrap', 'wrap')
    }
  }

  if (layoutGrow > 0 && parentLayoutMode && parentLayoutMode !== 'NONE') {
    pushStyle(styles, 'flex', `${layoutGrow} 1 0`)
  }

  if (layoutAlign === 'STRETCH' && parentLayoutMode && parentLayoutMode !== 'NONE') {
    pushStyle(styles, 'align-self', 'stretch')
  }

  if (typeof zIndex === 'number') {
    pushStyle(styles, 'z-index', String(Math.round(zIndex)))
  }

  pushStyleIdFallbackStyles(styles, rawNode, type, context)

  pushPaddingStyles(styles, rawNode)
  if (rasterAssetDataUrl) {
    pushSizeStyles(styles, width, height, type)
    pushRasterAssetStyles(styles, rasterAssetDataUrl)
  } else if (type === 'LINE') {
    pushLineStyles(styles, rawNode, width, height, rotation)
  } else {
    pushSizeStyles(styles, width, height, type)
    pushFillStyles(styles, rawNode, type)
    pushBorderStyles(styles, rawNode)
    pushRadiusStyles(styles, rawNode)
  }

  pushEffectStyles(styles, rawNode)
  pushBlendStyles(styles, rawNode)

  if (clipContent) {
    pushStyle(styles, 'overflow', 'hidden')
  }

  if (opacity > 0 && opacity < 1) {
    pushStyle(styles, 'opacity', String(roundNumber(opacity)))
  }

  if (rotation !== 0 && type !== 'LINE') {
    pushStyle(styles, 'transform', `rotate(${roundNumber(rotation)}deg)`)
    pushStyle(styles, 'transform-origin', 'center')
  }

  if (type === 'TEXT') {
    pushTextStyles(styles, rawNode)
  }

  return styles
}

function pushRasterAssetStyles(styles: StyleEntry[], rasterAssetDataUrl: string) {
  pushStyle(styles, 'background-image', `url("${escapeCssUrl(rasterAssetDataUrl)}")`)
  pushStyle(styles, 'background-size', '100% 100%')
  pushStyle(styles, 'background-position', 'center')
  pushStyle(styles, 'background-repeat', 'no-repeat')
}

function pushStyleIdFallbackStyles(styles: StyleEntry[], rawNode: NodeRecord, type: string, context: BuildContext) {
  const styleIds = collectNodeStyleIds(rawNode, type)
  if (!styleIds.length) {
    return
  }

  styleIds
    .flatMap((styleId) => resolveStyleEntriesById(styleId, context))
    .forEach((entry) => pushStyle(styles, entry.prop, entry.value))
}

function collectNodeStyleIds(rawNode: NodeRecord, type: string): string[] {
  const candidates = [
    getString(rawNode.fillStyleId),
    getString(rawNode.strokeFillStyleId),
    getString(rawNode.strokeWidthStyleId),
    getString(rawNode.strokeStyleId),
    getString(rawNode.effectStyleId),
    getString(rawNode.cornerRadiusStyleId),
    getString(rawNode.paddingStyleId),
    getString(rawNode.spacingStyleId),
    getString(rawNode.gridStyleId),
    type === 'TEXT' ? getString(rawNode.textStyleId) : '',
  ]

  return [...new Set(candidates.filter(Boolean))]
}

function resolveStyleEntriesById(styleId: string, context: BuildContext): StyleEntry[] {
  const cached = context.styleCodeCache[styleId]
  if (cached) {
    return cached
  }

  const fallback = getWebStyleEntriesById(styleId)
  context.styleCodeCache[styleId] = fallback
  return fallback
}

function getWebStyleEntriesById(styleId: string): StyleEntry[] {
  if (typeof mg.getWebStyleCodeById !== 'function') {
    return []
  }

  const codeString = mg.getWebStyleCodeById(styleId, { unit: 'px' }) as unknown
  return extractStyleEntriesFromCodeString(codeString)
}

function extractStyleEntriesFromCodeString(codeString: unknown): StyleEntry[] {
  if (!codeString || typeof codeString !== 'object' || Array.isArray(codeString)) {
    return []
  }

  const data = (codeString as Record<string, unknown>).data
  if (!data) {
    return []
  }

  const sourceChunks =
    typeof data === 'string'
      ? [data]
      : Object.values(data as Record<string, unknown>).filter((value): value is string => typeof value === 'string')

  return parseCssStyleEntries(sourceChunks.join('\n'))
}

function parseCssStyleEntries(source: string): StyleEntry[] {
  if (!source.trim()) {
    return []
  }

  const body = extractCssDeclarationBody(source)
  const matches = body.matchAll(/([a-zA-Z-]+)\s*:\s*([^;]+);?/g)
  const entries: StyleEntry[] = []

  for (const match of matches) {
    const prop = match[1]?.trim()
    const value = match[2]?.trim()
    if (!prop || !value) {
      continue
    }

    entries.push({ prop, value })
  }

  return dedupeStyleEntries(entries)
}

function extractCssDeclarationBody(source: string): string {
  const firstBrace = source.indexOf('{')
  const lastBrace = source.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return source.slice(firstBrace + 1, lastBrace)
  }

  return source
}

function dedupeStyleEntries(entries: StyleEntry[]): StyleEntry[] {
  const seen = new Set<string>()
  const deduped: StyleEntry[] = []

  for (const entry of entries) {
    if (seen.has(entry.prop)) {
      continue
    }

    seen.add(entry.prop)
    deduped.push(entry)
  }

  return deduped
}

function pushLineStyles(styles: StyleEntry[], rawNode: NodeRecord, width: number, height: number, rotation: number) {
  const strokeWeight = getNumber(rawNode.strokeWeight, 1)
  const strokeStyle = normalizeStrokeStyle(getString(rawNode.strokeStyle), getList(rawNode.strokeDashes))
  const stroke = getVisiblePaints(rawNode.strokes)[0]
  const strokeColor = stroke ? resolveCssFill(stroke, 'FRAME') : ''
  const lineLength = roundNumber(Math.sqrt(width * width + height * height)) || Math.max(width, height)
  const lineAngle = width === 0 ? 90 : (Math.atan2(height, width) * 180) / Math.PI
  const finalAngle = roundNumber(rotation + lineAngle)

  pushStyle(styles, 'width', toPx(lineLength))
  pushStyle(styles, 'height', '0px')
  pushStyle(styles, 'border-top', `${toPx(strokeWeight)} ${strokeStyle} ${strokeColor || '#000000'}`)
  pushStyle(styles, 'transform', `rotate(${finalAngle}deg)`)
  pushStyle(styles, 'transform-origin', '0 0')
}

function pushSizeStyles(styles: StyleEntry[], width: number, height: number, type: string) {
  if (width > 0) {
    pushStyle(styles, 'width', toPx(width))
  }

  if (height > 0 && type !== 'TEXT') {
    pushStyle(styles, 'height', toPx(height))
  }
}

function pushPaddingStyles(styles: StyleEntry[], rawNode: NodeRecord) {
  const paddingTop = getNumber(rawNode.paddingTop)
  const paddingRight = getNumber(rawNode.paddingRight)
  const paddingBottom = getNumber(rawNode.paddingBottom)
  const paddingLeft = getNumber(rawNode.paddingLeft)

  if (paddingTop || paddingRight || paddingBottom || paddingLeft) {
    pushStyle(
      styles,
      'padding',
      `${toPx(paddingTop)} ${toPx(paddingRight)} ${toPx(paddingBottom)} ${toPx(paddingLeft)}`,
    )
  }
}

function pushFillStyles(styles: StyleEntry[], rawNode: NodeRecord, type: string) {
  const visibleFills = getVisiblePaints(rawNode.fills)
  if (!visibleFills.length) {
    return
  }

  if (type === 'TEXT') {
    pushTextFillStyles(styles, visibleFills)
    return
  }

  pushNodeFillStyles(styles, visibleFills)
}

function pushBorderStyles(styles: StyleEntry[], rawNode: NodeRecord) {
  const strokeWeight = getNumber(rawNode.strokeWeight)
  const strokes = getVisiblePaints(rawNode.strokes)
  const visibleStroke = strokes[0]
  const strokeAlign = normalizeStrokeAlign(getString(rawNode.strokeAlign))
  const strokeStyle = normalizeStrokeStyle(getString(rawNode.strokeStyle), getList(rawNode.strokeDashes))

  if (!visibleStroke || strokeWeight <= 0) {
    return
  }

  const borderImageSource = resolveCssBorderImage(visibleStroke)
  if (borderImageSource) {
    pushStyle(styles, 'border', `${toPx(strokeWeight)} ${strokeStyle} transparent`)
    pushStyle(styles, 'border-image-source', borderImageSource)
    pushStyle(styles, 'border-image-slice', '1')
    return
  }

  const color = resolveCssFill(visibleStroke, 'FRAME')
  if (!color) {
    return
  }

  if (strokeAlign === 'INSIDE') {
    appendStyle(styles, 'box-shadow', `inset 0 0 0 ${toPx(strokeWeight)} ${color}`)
    return
  }

  if (strokeAlign === 'OUTSIDE') {
    appendStyle(styles, 'box-shadow', `0 0 0 ${toPx(strokeWeight)} ${color}`)
    return
  }

  pushStyle(styles, 'border', `${toPx(strokeWeight)} ${strokeStyle} ${color}`)
}

function pushRadiusStyles(styles: StyleEntry[], rawNode: NodeRecord) {
  const radius = getNumber(rawNode.cornerRadius)
  const radii = getList(rawNode.rectangleCornerRadii).map((value) => getNumber(value))

  if (radius > 0) {
    pushStyle(styles, 'border-radius', toPx(radius))
    return
  }

  if (radii.length === 4) {
    pushStyle(styles, 'border-radius', radii.map((value) => toPx(value)).join(' '))
  }
}

function pushTextStyles(styles: StyleEntry[], rawNode: NodeRecord) {
  const fontSize = getNumber(getTextField(rawNode, 'fontSize'))
  const fontWeight = resolveFontWeight(rawNode)
  const fontFamily = resolveFontFamily(rawNode)
  const fontStyle = resolveFontStyle(rawNode)
  const lineHeight = resolveLineHeight(getTextField(rawNode, 'lineHeight'), fontSize)
  const letterSpacing = resolveLetterSpacing(getTextField(rawNode, 'letterSpacing'))
  const textAlign = mapTextAlign(getString(getTextField(rawNode, 'textAlignHorizontal')))
  const textDecoration = mapTextDecoration(getString(getTextField(rawNode, 'textDecoration')))
  const textTransform = mapTextCase(getString(getTextField(rawNode, 'textCase')))
  const text = getString(rawNode.characters)

  if (fontSize > 0) {
    pushStyle(styles, 'font-size', toPx(fontSize))
  }

  pushStyle(styles, 'font-weight', fontWeight || 'normal')

  if (fontFamily) {
    pushStyle(styles, 'font-family', fontFamily)
  }

  if (fontStyle) {
    pushStyle(styles, 'font-style', fontStyle)
  }

  if (lineHeight) {
    pushStyle(styles, 'line-height', lineHeight)
  }

  pushStyle(styles, 'letter-spacing', letterSpacing || 'normal')

  if (textAlign && textAlign !== 'left') {
    pushStyle(styles, 'text-align', textAlign)
  }

  if (textDecoration) {
    pushStyle(styles, 'text-decoration', textDecoration)
  }

  if (textTransform) {
    pushStyle(styles, 'text-transform', textTransform)
  }

  if (text.includes('\n')) {
    pushStyle(styles, 'white-space', 'pre-wrap')
  }
}

function pushNodeFillStyles(styles: StyleEntry[], fills: NodeRecord[]) {
  const layers = fills.map((fill) => resolveBackgroundLayer(fill)).filter((layer): layer is BackgroundLayer => Boolean(layer))
  if (!layers.length) {
    return
  }

  if (layers.length === 1 && layers[0].solidColor) {
    pushStyle(styles, 'background', layers[0].solidColor)
    return
  }

  pushBackgroundLayerStyles(styles, layers)
}

function pushTextFillStyles(styles: StyleEntry[], fills: NodeRecord[]) {
  const layers = fills.map((fill) => resolveBackgroundLayer(fill)).filter((layer): layer is BackgroundLayer => Boolean(layer))
  if (!layers.length) {
    return
  }

  if (layers.length === 1 && layers[0].solidColor) {
    pushStyle(styles, 'color', layers[0].solidColor)
    return
  }

  pushBackgroundLayerStyles(styles, layers)
  pushStyle(styles, 'background-clip', 'text')
  pushStyle(styles, '-webkit-background-clip', 'text')
  pushStyle(styles, 'color', 'transparent')
  pushStyle(styles, '-webkit-text-fill-color', 'transparent')
}

function pushBackgroundLayerStyles(styles: StyleEntry[], layers: BackgroundLayer[]) {
  pushStyle(styles, 'background-image', layers.map((layer) => layer.image).join(', '))
  pushStyle(styles, 'background-size', layers.map((layer) => layer.size).join(', '))
  pushStyle(styles, 'background-position', layers.map((layer) => layer.position).join(', '))
  pushStyle(styles, 'background-repeat', layers.map((layer) => layer.repeat).join(', '))

  const blendModes = layers.map((layer) => layer.blendMode || 'normal')
  if (blendModes.some((blendMode) => blendMode !== 'normal')) {
    pushStyle(styles, 'background-blend-mode', blendModes.join(', '))
  }
}

function pushEffectStyles(styles: StyleEntry[], rawNode: NodeRecord) {
  const effects = getObjectArray(rawNode.effects).filter((effect) => isEffectVisible(effect))
  const boxShadows: string[] = []
  const filters: string[] = []
  const backdropFilters: string[] = []

  effects.forEach((effect) => {
    const effectType = getString(effect.type)

    if (effectType === 'DROP_SHADOW' || effectType === 'INNER_SHADOW') {
      const shadow = toCssShadow(effect)
      if (shadow) {
        boxShadows.push(shadow)
      }
      return
    }

    if (effectType === 'LAYER_BLUR') {
      const radius = getNumber(effect.radius)
      if (radius > 0) {
        filters.push(`blur(${toPx(radius)})`)
      }
      return
    }

    if (effectType === 'BACKGROUND_BLUR') {
      const radius = getNumber(effect.radius)
      if (radius > 0) {
        backdropFilters.push(`blur(${toPx(radius)})`)
      }
    }
  })

  if (boxShadows.length) {
    appendStyle(styles, 'box-shadow', boxShadows.join(', '))
  }

  if (filters.length) {
    appendStyle(styles, 'filter', filters.join(' '))
  }

  if (backdropFilters.length) {
    appendStyle(styles, 'backdrop-filter', backdropFilters.join(' '))
  }
}

function pushBlendStyles(styles: StyleEntry[], rawNode: NodeRecord) {
  const blendMode = mapBlendMode(getString(rawNode.blendMode))
  if (blendMode && blendMode !== 'normal') {
    pushStyle(styles, 'mix-blend-mode', blendMode)
  }
}

function buildTemplate(node: RenderNode, depth: number, styleExtraction: StyleExtractionResult): string {
  const indent = '  '.repeat(depth)
  const classNames = styleExtraction.classNamesByNodeId[node.id] || []
  const classAttr = classNames.length ? ` class="${escapeHtml(classNames.join(' '))}"` : ''
  const openTag = `${indent}<${node.tag}${classAttr}>`
  const closeTag = `${indent}</${node.tag}>`
  const childLines = node.children.map((child) => buildTemplate(child, depth + 1, styleExtraction))
  const text = escapeVueText(node.text)

  if (!childLines.length && !text) {
    return `${openTag}${closeTag.slice(indent.length)}`
  }

  if (!childLines.length) {
    return `${openTag}${text}</${node.tag}>`
  }

  const lines = [openTag]
  if (text) {
    lines.push(`${indent}  ${text}`)
  }
  lines.push(...childLines)
  lines.push(closeTag)
  return lines.join('\n')
}

function buildStyleSheet(root: RenderNode, styleExtraction: StyleExtractionResult): string {
  const blocks: string[] = styleExtraction.sharedBlocks.map((block) => {
    const lines = block.styles.map((style) => `  ${style.prop}: ${style.value};`)
    return `.${block.className} {\n${lines.join('\n')}\n}`
  })

  walkTree(root, (node) => {
    const nodeStyles = styleExtraction.nodeStylesByNodeId[node.id] || []
    if (!nodeStyles.length) {
      return
    }

    const lines = nodeStyles.map((style) => `  ${style.prop}: ${style.value};`)
    blocks.push(`.${node.className} {\n${lines.join('\n')}\n}`)
  })

  return blocks.join('\n\n')
}

function buildVueSfc(
  template: string,
  styleContent: string,
  styleFormat: StyleFormat,
  noteComment: string,
  framework: SnippetLanguage,
  componentName: string,
): string {
  const styleLangAttr = styleFormat === 'scss' ? ' lang="scss"' : ''
  const scriptBlock = framework === 'vue2' ? buildVue2ScriptBlock(componentName) : ''
  const parts = [
    noteComment,
    '<template>',
    template,
    '</template>',
    scriptBlock,
    '',
    `<style scoped${styleLangAttr}>`,
    styleContent,
    '</style>',
  ].filter(Boolean)

  return parts.join('\n')
}

function buildVue2ScriptBlock(componentName: string): string {
  return `<script>\nexport default {\n  name: '${escapeJsString(componentName)}'\n}\n</script>`
}

function buildWarningComment(warnings: string[]): string {
  if (!warnings.length) {
    return '<!-- Generated from MasterGo DevMode snippet plugin -->'
  }

  const lines = ['<!-- Generated from MasterGo DevMode snippet plugin', ...warnings.map((warning) => `  - ${warning}`), '-->']
  return lines.join('\n')
}

function walkTree(node: RenderNode, visitor: (node: RenderNode) => void) {
  visitor(node)
  node.children.forEach((child) => walkTree(child, visitor))
}

function buildStyleExtraction(root: RenderNode, mode: StyleExtractionMode): StyleExtractionResult {
  if (mode === 'off') {
    return createInlineStyleExtraction(root)
  }

  return extractSharedStyles(root, mode)
}

function extractSharedStyles(root: RenderNode, mode: Exclude<StyleExtractionMode, 'off'>): StyleExtractionResult {
  const signatureCount: Record<string, number> = {}

  walkTree(root, (node) => {
    node.styles.forEach((style) => {
      if (!isExtractableSharedStyle(style, mode)) {
        return
      }

      const signature = getStyleSignature(style)
      signatureCount[signature] = (signatureCount[signature] || 0) + 1
    })
  })

  const sharedClassBySignature: Record<string, string> = {}
  const sharedBlocks: SharedStyleBlock[] = []
  const classNamesByNodeId: Record<string, string[]> = {}
  const nodeStylesByNodeId: Record<string, StyleEntry[]> = {}

  walkTree(root, (node) => {
    const classNames: string[] = []
    const ownStyles: StyleEntry[] = []

    node.styles.forEach((style) => {
      const signature = getStyleSignature(style)
      if (isExtractableSharedStyle(style, mode) && (signatureCount[signature] || 0) >= 2) {
        let sharedClassName = sharedClassBySignature[signature]
        if (!sharedClassName) {
          sharedClassName = `shared-style-${sharedBlocks.length + 1}`
          sharedClassBySignature[signature] = sharedClassName
          sharedBlocks.push({
            className: sharedClassName,
            styles: [style],
          })
        }
        classNames.push(sharedClassName)
        return
      }

      ownStyles.push(style)
    })

    if (ownStyles.length) {
      classNames.push(node.className)
    }

    classNamesByNodeId[node.id] = classNames
    nodeStylesByNodeId[node.id] = ownStyles
  })

  return {
    sharedBlocks,
    classNamesByNodeId,
    nodeStylesByNodeId,
  }
}

function createInlineStyleExtraction(root: RenderNode): StyleExtractionResult {
  const classNamesByNodeId: Record<string, string[]> = {}
  const nodeStylesByNodeId: Record<string, StyleEntry[]> = {}

  walkTree(root, (node) => {
    classNamesByNodeId[node.id] = node.styles.length ? [node.className] : []
    nodeStylesByNodeId[node.id] = node.styles
  })

  return {
    sharedBlocks: [],
    classNamesByNodeId,
    nodeStylesByNodeId,
  }
}

function isExtractableSharedStyle(style: StyleEntry, mode: Exclude<StyleExtractionMode, 'off'>): boolean {
  if (mode === 'full') {
    return true
  }

  return LAYOUT_SHARED_STYLE_PROP_ALLOWLIST.has(style.prop)
}

function getStyleSignature(style: StyleEntry): string {
  return `${style.prop}\u0000${style.value}`
}

function isRedundantEmptyNode(node: RenderNode): boolean {
  if (node.tag === 'span' || node.text || node.rasterAssetDataUrl || node.children.length > 0) {
    return false
  }

  return node.styles.every((style) => isStructurallyNeutralStyle(style))
}

function isNeutralWrapperNode(node: RenderNode): boolean {
  if (node.tag === 'span' || node.text || node.rasterAssetDataUrl || node.children.length !== 1) {
    return false
  }

  return node.styles.length > 0 && node.styles.every((style) => isStructurallyNeutralStyle(style))
}

function isStructurallyNeutralStyle(style: StyleEntry): boolean {
  return (
    (style.prop === 'box-sizing' && style.value === 'border-box') ||
    (style.prop === 'position' && style.value === 'relative')
  )
}

function pickTag(type: string, hasChildren: boolean): string {
  if (type === 'TEXT') {
    return 'span'
  }

  if (type === 'SECTION' || type === 'COMPONENT_SET') {
    return 'section'
  }

  if (type === 'COMPONENT' && hasChildren) {
    return 'section'
  }

  return 'div'
}

function getNodeText(rawNode: NodeRecord, type: string): string {
  if (type !== 'TEXT') {
    return ''
  }

  return getString(rawNode.characters)
}

function getChildren(rawNode: NodeRecord): NodeRecord[] {
  return getObjectArray(rawNode.children)
}

function isNodeVisible(rawNode: NodeRecord): boolean {
  return getBoolean(rawNode.visible, true)
}

function getUnsupportedFillTypes(rawNode: NodeRecord): string[] {
  const unsupported = new Set<string>()
  const supportedFillTypes = new Set(['SOLID', 'IMAGE', 'GRADIENT_LINEAR', 'GRADIENT_RADIAL', 'GRADIENT_ANGULAR', 'GRADIENT_DIAMOND'])

  getObjectArray(rawNode.fills)
    .filter((fill) => isPaintVisible(fill))
    .map((fill) => getString(fill.type))
    .filter((fillType) => fillType && !supportedFillTypes.has(fillType))
    .forEach((fillType) => unsupported.add(fillType))

  return [...unsupported]
}

function isAssetHeavyNode(type: string): boolean {
  return ['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'LINE', 'ELLIPSE', 'POLYGON'].includes(type)
}

async function resolveRasterAssetDataUrl(
  rawNode: ExportableNode,
  type: string,
  name: string,
  context: BuildContext,
): Promise<string> {
  if (!context.assetExport.enabled) {
    return ''
  }

  if (!shouldRasterizeNode(rawNode, type, context.assetExport.renderMode)) {
    return ''
  }

  try {
    const exported = await exportNodeAsImage(rawNode, context.assetExport)
    const dataUrl = toImageDataUrl(exported, context.assetExport.format)
    if (!dataUrl) {
      pushWarning(context, `${name}: ${context.assetExport.format} ${context.assetExport.scale}x export returned empty data.`)
    }
    return dataUrl
  } catch (error) {
    pushWarning(context, `${name}: ${context.assetExport.format} ${context.assetExport.scale}x export failed: ${getErrorMessage(error)}`)
    return ''
  }
}

function shouldRasterizeNode(rawNode: NodeRecord, type: string, renderMode: AssetRenderMode): boolean {
  if (type === 'TEXT') {
    return false
  }

  const imageFillLeaf = hasImageFill(rawNode) && getChildren(rawNode).length === 0
  const autoAssetNode = isAssetHeavyNode(type) || isSmallAssetContainer(rawNode, type)
  const aggressiveAssetNode = autoAssetNode || isSmallVisualNode(rawNode, type)

  if (renderMode === 'css') {
    return imageFillLeaf
  }

  if (renderMode === 'image') {
    return imageFillLeaf || aggressiveAssetNode
  }

  return imageFillLeaf || autoAssetNode
}

function hasImageFill(rawNode: NodeRecord): boolean {
  return getVisiblePaints(rawNode.fills).some((fill) => getString(fill.type) === 'IMAGE')
}

function isSmallAssetContainer(rawNode: NodeRecord, type: string): boolean {
  if (type === 'TEXT' || hasTextDescendant(rawNode)) {
    return false
  }

  const width = getNumber(rawNode.width)
  const height = getNumber(rawNode.height)
  if (width <= 0 || height <= 0 || width > 80 || height > 80) {
    return false
  }

  return hasAssetHeavyDescendant(rawNode) || hasDecorativeVisualDescendant(rawNode)
}

function isSmallVisualNode(rawNode: NodeRecord, type: string): boolean {
  if (type === 'TEXT' || hasTextDescendant(rawNode)) {
    return false
  }

  const width = getNumber(rawNode.width)
  const height = getNumber(rawNode.height)
  if (width <= 0 || height <= 0 || width > 80 || height > 80) {
    return false
  }

  return isDecorativeVisualNode(rawNode) || getChildren(rawNode).length > 0
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

function hasAssetHeavyDescendant(rawNode: NodeRecord): boolean {
  return getChildren(rawNode).some((child) => {
    const childType = normalizeNodeType(getString(child.type))
    return isAssetHeavyNode(childType) || hasAssetHeavyDescendant(child)
  })
}

function hasDecorativeVisualDescendant(rawNode: NodeRecord): boolean {
  return getChildren(rawNode).some((child) => isDecorativeVisualNode(child) || hasDecorativeVisualDescendant(child))
}

function isDecorativeVisualNode(rawNode: NodeRecord): boolean {
  const type = normalizeNodeType(getString(rawNode.type))
  if (type === 'TEXT') {
    return false
  }

  const width = getNumber(rawNode.width)
  const height = getNumber(rawNode.height)
  if (width <= 0 || height <= 0 || width > 80 || height > 80) {
    return false
  }

  const hasVisibleFills = getVisiblePaints(rawNode.fills).length > 0
  const hasVisibleStrokes = getVisiblePaints(rawNode.strokes).length > 0 && getNumber(rawNode.strokeWeight) > 0
  const hasRotation = getNumber(rawNode.rotation) !== 0

  return hasVisibleFills || hasVisibleStrokes || hasRotation
}

function hasTextDescendant(rawNode: NodeRecord): boolean {
  return getChildren(rawNode).some((child) => {
    const childType = normalizeNodeType(getString(child.type))
    return childType === 'TEXT' || hasTextDescendant(child)
  })
}

function resolveAssetExportOptions(settings: GeneratorSettings): AssetExportOptions {
  return {
    enabled: settings.exportImages,
    format: settings.imageFormat,
    scale: resolveExportImageScale(settings.imageScale),
    renderMode: settings.assetRenderMode,
  }
}

function mapFrameworkToCodegen(framework: SnippetLanguage): MGDSL.Framework {
  return framework === 'vue2' ? 'VUE2' : 'VUE3'
}

function buildOfficialCodegenUnavailableBlock(reason: string): SnippetBlock {
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

async function resolveGeneratorSettings(data?: GenerateEvent): Promise<GeneratorSettings> {
  const storedSettings = normalizePartialGeneratorSettings(await mg.clientStorage.getAsync(SETTINGS_STORAGE_KEY))
  const legacySettings = data ? resolveLegacyGeneratorSettings(data) : {}

  return normalizeGeneratorSettings({
    ...DEFAULT_GENERATOR_SETTINGS,
    ...legacySettings,
    ...storedSettings,
  })
}

async function buildUiState(): Promise<GeneratorSettings & { promptContent: string }> {
  return {
    ...(await resolveGeneratorSettings()),
    promptContent: await resolveStoredPrompt(),
  }
}

async function resolveStoredPrompt(): Promise<string> {
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
  if (mode === 'off' || mode === 'layout' || mode === 'full') {
    settings.styleExtractionMode = mode
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

function getMessageRecord(value: unknown): Record<string, unknown> {
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

function resolveExportImageScale(value: unknown): number {
  const parsed = Number(normalizeImageScale(value))
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed
  }

  return 2
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

function normalizePromptContent(value: unknown): string {
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

  if (styleExtractionMode === 'off' || styleExtractionMode === 'layout' || styleExtractionMode === 'full') {
    partial.styleExtractionMode = styleExtractionMode
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

function normalizeGeneratorSettings(value: unknown): GeneratorSettings {
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

function escapeJsString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function normalizeNodeType(value: string): string {
  return value ? value.toUpperCase() : 'NODE'
}

function normalizeLayoutMode(value: string): string {
  return value ? value.toUpperCase() : 'NONE'
}

function normalizeWrap(value: string): string {
  return value ? value.toUpperCase() : 'NO_WRAP'
}

function mapPrimaryAxisAlign(value: string): string {
  switch (value) {
    case 'CENTER':
      return 'center'
    case 'MAX':
      return 'flex-end'
    case 'SPACE_BETWEEN':
      return 'space-between'
    default:
      return 'flex-start'
  }
}

function mapCounterAxisAlign(value: string): string {
  switch (value) {
    case 'CENTER':
      return 'center'
    case 'MAX':
      return 'flex-end'
    case 'BASELINE':
      return 'baseline'
    default:
      return 'flex-start'
  }
}

function mapTextAlign(value: string): string {
  switch (value) {
    case 'CENTER':
      return 'center'
    case 'RIGHT':
      return 'right'
    case 'JUSTIFIED':
      return 'justify'
    default:
      return value === 'LEFT' ? 'left' : ''
  }
}

function resolveFontWeight(rawNode: NodeRecord): string {
  const explicitWeight = getNumber(getTextField(rawNode, 'fontWeight'))
  if (explicitWeight > 0) {
    return String(Math.round(explicitWeight))
  }

  const fontName = getFontNameRecord(rawNode)
  if (fontName) {
    const style = getString(fontName.style).toLowerCase()
    if (style.includes('regular') || style.includes('normal') || style.includes('book') || style.includes('roman')) {
      return 'normal'
    }
    if (style.includes('thin')) return '100'
    if (style.includes('extralight') || style.includes('ultralight')) return '200'
    if (style.includes('light')) return '300'
    if (style.includes('medium')) return '500'
    if (style.includes('semibold') || style.includes('demibold')) return '600'
    if (style.includes('extrabold') || style.includes('ultrabold')) return '800'
    if (style.includes('bold')) return '700'
    if (style.includes('black') || style.includes('heavy')) return '900'
  }

  return ''
}

function resolveFontFamily(rawNode: NodeRecord): string {
  const fontName = getFontNameRecord(rawNode)
  if (!fontName) {
    return ''
  }

  return normalizeFontFamilyName(getString(fontName.family))
}

function resolveFontStyle(rawNode: NodeRecord): string {
  const fontName = getFontNameRecord(rawNode)
  if (!fontName) {
    return ''
  }

  const style = getString(fontName.style).toLowerCase()
  if (style.includes('italic')) {
    return 'italic'
  }

  if (style.includes('oblique')) {
    return 'oblique'
  }

  return ''
}

function resolveLineHeight(value: unknown, fontSize: number): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return ''
  }

  const lineHeight = value as NodeRecord
  const unit = getString(lineHeight.unit)
  const numericValue = getNumber(lineHeight.value)

  if (!numericValue) {
    return ''
  }

  if (unit === 'PIXELS') {
    return toPx(numericValue)
  }

  if (unit === 'PERCENT') {
    return `${roundNumber(numericValue)}%`
  }

  if (unit === 'AUTO' && fontSize > 0) {
    return `${roundNumber(fontSize * 1.2)}px`
  }

  return ''
}

function resolveLetterSpacing(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return ''
  }

  const record = value as NodeRecord
  const unit = getString(record.unit)
  const numericValue = getNumber(record.value)

  if (!numericValue) {
    return ''
  }

  if (unit === 'PERCENT') {
    return `${roundNumber(numericValue)}%`
  }

  return toPx(numericValue)
}

function toCssColor(fill: NodeRecord): string {
  const color = fill.color
  if (!color || typeof color !== 'object' || Array.isArray(color)) {
    return ''
  }

  return toCssColorFromColorRecord(color as NodeRecord, getPaintAlpha(fill))
}

function toCssColorFromColorRecord(colorRecord: NodeRecord, alphaMultiplier = 1): string {
  const red = normalizeChannel(getNumber(colorRecord.r))
  const green = normalizeChannel(getNumber(colorRecord.g))
  const blue = normalizeChannel(getNumber(colorRecord.b))
  const alpha = Math.min(1, Math.max(0, getNumber(colorRecord.a, 1) * alphaMultiplier))

  if (alpha === 1) {
    return `#${toHexChannel(red)}${toHexChannel(green)}${toHexChannel(blue)}`
  }

  return `rgba(${red}, ${green}, ${blue}, ${roundNumber(alpha)})`
}

function resolveCssFill(fill: NodeRecord, type: string): string {
  const fillType = getString(fill.type)

  if (fillType === 'SOLID') {
    return toCssColor(fill)
  }

  if (fillType === 'GRADIENT_LINEAR') {
    return toCssLinearGradient(fill)
  }

  if (fillType === 'GRADIENT_RADIAL') {
    return toCssRadialGradient(fill)
  }

  if (fillType === 'GRADIENT_ANGULAR') {
    return toCssAngularGradient(fill)
  }

  if (fillType === 'GRADIENT_DIAMOND') {
    return toCssDiamondGradient(fill)
  }

  if (fillType === 'IMAGE' && type !== 'TEXT') {
    const layer = resolveImageBackgroundLayer(fill)
    return layer?.image || ''
  }

  return ''
}

function toCssLinearGradient(fill: NodeRecord): string {
  const stopValues = getGradientStopValues(fill)
  if (!stopValues.length) {
    return ''
  }

  const angle = getLinearGradientAngle(fill)
  return `linear-gradient(${roundNumber(angle)}deg, ${stopValues.join(', ')})`
}

function toCssRadialGradient(fill: NodeRecord): string {
  const stopValues = getGradientStopValues(fill)
  if (!stopValues.length) {
    return ''
  }

  const center = getGradientCenter(fill)
  return `radial-gradient(circle at ${center.x}% ${center.y}%, ${stopValues.join(', ')})`
}

function toCssAngularGradient(fill: NodeRecord): string {
  const stopValues = getGradientStopValues(fill)
  if (!stopValues.length) {
    return ''
  }

  const center = getGradientCenter(fill)
  const angle = getLinearGradientAngle(fill)
  return `conic-gradient(from ${roundNumber(angle)}deg at ${center.x}% ${center.y}%, ${stopValues.join(', ')})`
}

function toCssDiamondGradient(fill: NodeRecord): string {
  const stopValues = getGradientStopValues(fill)
  if (!stopValues.length) {
    return ''
  }

  const center = getGradientCenter(fill)
  return `radial-gradient(circle at ${center.x}% ${center.y}%, ${stopValues.join(', ')})`
}

function getGradientStopValues(fill: NodeRecord): string[] {
  const stops = getObjectArray(fill.gradientStops)
  if (!stops.length) {
    return []
  }

  return stops
    .map((stop) => {
      const color = stop.color
      if (!color || typeof color !== 'object' || Array.isArray(color)) {
        return ''
      }

      const position = clamp(getNumber(stop.position), 0, 1)
      const cssColor = toCssColorFromColorRecord(color as NodeRecord, getPaintAlpha(fill))
      return `${cssColor} ${roundNumber(position * 100)}%`
    })
    .filter(Boolean)
}

function getLinearGradientAngle(fill: NodeRecord): number {
  const handles = getObjectArray(fill.gradientHandlePositions)
  if (handles.length < 2) {
    return 180
  }

  const from = handles[0]
  const to = handles[1]
  const dx = getNumber(to.x) - getNumber(from.x)
  const dy = getNumber(to.y) - getNumber(from.y)

  if (dx === 0 && dy === 0) {
    return 180
  }

  return normalizeAngle((Math.atan2(dy, dx) * 180) / Math.PI + 90)
}

function normalizeAngle(angle: number): number {
  const normalized = angle % 360
  return normalized < 0 ? normalized + 360 : normalized
}

function getGradientCenter(fill: NodeRecord): { x: number; y: number } {
  const handles = getObjectArray(fill.gradientHandlePositions)
  if (!handles.length) {
    return { x: 50, y: 50 }
  }

  return {
    x: roundNumber(clamp(getNumber(handles[0].x), 0, 1) * 100),
    y: roundNumber(clamp(getNumber(handles[0].y), 0, 1) * 100),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function resolveBackgroundLayer(fill: NodeRecord): BackgroundLayer | null {
  const fillType = getString(fill.type)

  if (fillType === 'SOLID') {
    const color = toCssColor(fill)
    if (!color) {
      return null
    }

    return {
      image: `linear-gradient(${color}, ${color})`,
      size: '100% 100%',
      position: 'center',
      repeat: 'no-repeat',
      blendMode: mapBlendMode(getString(fill.blendMode)) || 'normal',
      solidColor: color,
    }
  }

  if (fillType.startsWith('GRADIENT_')) {
    const image = resolveCssFill(fill, 'FRAME')
    if (!image) {
      return null
    }

    return {
      image,
      size: '100% 100%',
      position: 'center',
      repeat: 'no-repeat',
      blendMode: mapBlendMode(getString(fill.blendMode)) || 'normal',
    }
  }

  if (fillType === 'IMAGE') {
    return resolveImageBackgroundLayer(fill)
  }

  return null
}

function resolveImageBackgroundLayer(fill: NodeRecord): BackgroundLayer | null {
  const imageRef = getString(fill.imageRef)
  if (!imageRef) {
    return null
  }

  const scaleMode = getString(fill.scaleMode)
  const ratio = getNumber(fill.ratio)
  const mapped = mapImageScaleMode(scaleMode, ratio)

  return {
    image: `url("${escapeCssUrl(imageRef)}")`,
    size: mapped.size,
    position: mapped.position,
    repeat: mapped.repeat,
    blendMode: mapBlendMode(getString(fill.blendMode)) || 'normal',
  }
}

function mapImageScaleMode(scaleMode: string, ratio: number): { size: string; position: string; repeat: string } {
  switch (scaleMode) {
    case 'FIT':
      return { size: 'contain', position: 'center', repeat: 'no-repeat' }
    case 'STRETCH':
      return { size: '100% 100%', position: 'center', repeat: 'no-repeat' }
    case 'TILE':
      return {
        size: ratio > 0 ? `${roundNumber(ratio * 100)}% auto` : 'auto',
        position: 'top left',
        repeat: 'repeat',
      }
    case 'CROP':
    case 'FILL':
    default:
      return { size: 'cover', position: 'center', repeat: 'no-repeat' }
  }
}

function resolveCssBorderImage(fill: NodeRecord): string {
  const fillType = getString(fill.type)

  if (fillType === 'SOLID') {
    return ''
  }

  return resolveCssFill(fill, 'FRAME')
}

function toCssShadow(effect: NodeRecord): string {
  const color = effect.color
  if (!color || typeof color !== 'object' || Array.isArray(color)) {
    return ''
  }

  const offset = effect.offset
  const offsetX = offset && typeof offset === 'object' && !Array.isArray(offset) ? getNumber((offset as NodeRecord).x) : 0
  const offsetY = offset && typeof offset === 'object' && !Array.isArray(offset) ? getNumber((offset as NodeRecord).y) : 0
  const blur = getNumber(effect.radius)
  const spread = getNumber(effect.spread)
  const inset = getString(effect.type) === 'INNER_SHADOW' ? 'inset ' : ''

  return `${inset}${toPx(offsetX)} ${toPx(offsetY)} ${toPx(blur)} ${toPx(spread)} ${toCssColorFromColorRecord(color as NodeRecord)}`
}

function isPaintVisible(paint: NodeRecord): boolean {
  const explicitVisible = getOptionalBoolean(paint.visible)
  if (typeof explicitVisible === 'boolean') {
    return explicitVisible
  }

  const explicitIsVisible = getOptionalBoolean(paint.isVisible)
  if (typeof explicitIsVisible === 'boolean') {
    return explicitIsVisible
  }

  return true
}

function isEffectVisible(effect: NodeRecord): boolean {
  return isPaintVisible(effect)
}

function getVisiblePaints(value: unknown): NodeRecord[] {
  return getObjectArray(value).filter((paint) => isPaintVisible(paint))
}

function getPaintAlpha(paint: NodeRecord): number {
  return getOptionalNumber(paint.opacity) ?? getOptionalNumber(paint.alpha) ?? 1
}

function mapBlendMode(value: string): string {
  switch (value) {
    case 'DARKEN':
      return 'darken'
    case 'MULTIPLY':
      return 'multiply'
    case 'COLOR_BURN':
      return 'color-burn'
    case 'LIGHTEN':
      return 'lighten'
    case 'SCREEN':
      return 'screen'
    case 'COLOR_DODGE':
      return 'color-dodge'
    case 'OVERLAY':
      return 'overlay'
    case 'SOFT_LIGHT':
      return 'soft-light'
    case 'HARD_LIGHT':
      return 'hard-light'
    case 'DIFFERENCE':
      return 'difference'
    case 'EXCLUSION':
      return 'exclusion'
    case 'HUE':
      return 'hue'
    case 'SATURATION':
      return 'saturation'
    case 'COLOR':
      return 'color'
    case 'LUMINOSITY':
      return 'luminosity'
    case 'PLUS_DARKER':
      return 'plus-darker'
    case 'PLUS_LIGHTER':
      return 'plus-lighter'
    case 'NORMAL':
    case 'PASS_THROUGH':
    default:
      return 'normal'
  }
}

function mapTextDecoration(value: string): string {
  switch (value) {
    case 'UNDERLINE':
      return 'underline'
    case 'STRIKETHROUGH':
      return 'line-through'
    default:
      return ''
  }
}

function mapTextCase(value: string): string {
  switch (value) {
    case 'UPPER':
      return 'uppercase'
    case 'LOWER':
      return 'lowercase'
    case 'TITLE':
      return 'capitalize'
    default:
      return ''
  }
}

function normalizeStrokeAlign(value: string): string {
  return value === 'INSIDE' || value === 'OUTSIDE' ? value : 'CENTER'
}

function normalizeStrokeStyle(value: string, dashes: unknown[]): string {
  if (value === 'DASH' || (Array.isArray(dashes) && dashes.length > 0)) {
    return 'dashed'
  }

  return 'solid'
}

function escapeCssUrl(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '')
}

function normalizeChannel(value: number): number {
  if (value <= 1) {
    return Math.round(value * 255)
  }
  return Math.round(value)
}

function toHexChannel(value: number): string {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0').toUpperCase()
}

function getFontNameRecord(rawNode: NodeRecord): NodeRecord | null {
  const candidates = [
    getTextField(rawNode, 'localizedFontName'),
    getTextField(rawNode, 'fontName'),
  ]

  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      return candidate as NodeRecord
    }
  }

  return null
}

function normalizeFontFamilyName(value: string): string {
  if (!value) {
    return ''
  }

  const strippedSuffix = value.replace(/-(regular|normal|book|roman|medium|semibold|demibold|bold|extrabold|ultrabold|black|heavy|light|extralight|ultralight|thin|italic|oblique)$/i, '')
  const normalized = strippedSuffix
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return normalized
}

function getTextField(rawNode: NodeRecord, field: string): unknown {
  const direct = rawNode[field]
  if (direct !== undefined) {
    return direct
  }

  const textStyleField = getTextStyleField(rawNode, field)
  if (textStyleField !== undefined) {
    return textStyleField
  }

  const primarySegmentStyle = getPrimaryTextSegmentStyle(rawNode)
  if (primarySegmentStyle && field in primarySegmentStyle) {
    return primarySegmentStyle[field]
  }

  return undefined
}

function getTextStyleField(rawNode: NodeRecord, field: string): unknown {
  const textStyle = rawNode.textStyle
  if (!textStyle || typeof textStyle !== 'object' || Array.isArray(textStyle)) {
    return undefined
  }

  return (textStyle as NodeRecord)[field]
}

function getPrimaryTextSegmentStyle(rawNode: NodeRecord): NodeRecord | null {
  const textStyles = rawNode.textStyles
  if (!Array.isArray(textStyles) || !textStyles.length) {
    return null
  }

  const firstStyle = textStyles[0]
  if (!firstStyle || typeof firstStyle !== 'object' || Array.isArray(firstStyle)) {
    return null
  }

  const textStyle = (firstStyle as NodeRecord).textStyle
  if (!textStyle || typeof textStyle !== 'object' || Array.isArray(textStyle)) {
    return null
  }

  return textStyle as NodeRecord
}

function createClassName(name: string, context: BuildContext): string {
  const base = sanitizeClassName(name) || 'mastergo-node'
  const used = context.classNameCount[base] || 0
  context.classNameCount[base] = used + 1
  return used === 0 ? base : `${base}-${used + 1}`
}

function sanitizeClassName(value: string): string {
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

function toPascalCase(value: string): string {
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

function pushStyle(styles: StyleEntry[], prop: string, value: string) {
  if (!value) {
    return
  }

  const hasExisting = styles.some((style) => style.prop === prop)
  if (hasExisting) {
    return
  }

  styles.push({ prop, value })
}

function appendStyle(styles: StyleEntry[], prop: string, value: string, separator = ', ') {
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

function pushWarning(context: BuildContext, message: string) {
  if (!context.warnings.includes(message)) {
    context.warnings.push(message)
  }
}

function toPx(value: number): string {
  return `${roundNumber(value)}px`
}

function roundNumber(value: number): number {
  return Math.round(value * 100) / 100
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function getOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function getNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function getOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function getBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function getList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function getObjectArray(value: unknown): NodeRecord[] {
  return getList(value).filter((item) => typeof item === 'object' && item !== null) as NodeRecord[]
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeVueText(value: string): string {
  return escapeHtml(value)
    .replace(/\{\{/g, '&#123;&#123;')
    .replace(/\}\}/g, '&#125;&#125;')
}

function getErrorMessage(error: unknown): string {
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

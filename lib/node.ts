import type { NodeRecord, ExportableNode, RenderNode, StyleEntry, BuildContext, AssetExportOptions } from './types'
import { getString, getNumber, getBoolean, getList, getObjectArray, pushStyle, appendStyle, sanitizeClassName, roundNumber, getOptionalNumber } from './utils'
import { normalizeNodeType, normalizeLayoutMode, normalizeWrap, mapPrimaryAxisAlign, mapCounterAxisAlign, getVisiblePaints, normalizeStrokeStyle, pushFillStyles, pushBorderStyles, pushRadiusStyles, pushLineStyles, pushSizeStyles, pushPaddingStyles, pushTextStyles, pushEffectStyles, pushBlendStyles, pushRasterAssetStyles } from './css'

// 节点基础处理
export function isNodeVisible(rawNode: NodeRecord): boolean {
  return getBoolean(rawNode.visible, true)
}

export function getChildren(rawNode: NodeRecord): NodeRecord[] {
  return getObjectArray(rawNode.children)
}

export function getNodeText(rawNode: NodeRecord, type: string): string {
  if (type !== 'TEXT') {
    return ''
  }
  return getString(rawNode.characters)
}

export function pickTag(type: string, hasChildren: boolean): string {
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

export function createClassName(name: string, context: BuildContext): string {
  const base = sanitizeClassName(name) || 'mastergo-node'
  const used = context.classNameCount[base] || 0
  context.classNameCount[base] = used + 1
  return used === 0 ? base : `${base}-${used + 1}`
}

// 节点判断函数
export function isRedundantEmptyNode(node: RenderNode): boolean {
  if (node.tag === 'span' || node.text || node.rasterAssetDataUrl || node.children.length > 0) {
    return false
  }
  return node.styles.every((style) => isStructurallyNeutralStyle(style))
}

export function isNeutralWrapperNode(node: RenderNode): boolean {
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

export function getUnsupportedFillTypes(rawNode: NodeRecord): string[] {
  const unsupported = new Set<string>()
  const supportedFillTypes = new Set(['SOLID', 'IMAGE', 'GRADIENT_LINEAR', 'GRADIENT_RADIAL', 'GRADIENT_ANGULAR', 'GRADIENT_DIAMOND'])

  getObjectArray(rawNode.fills)
    .filter((fill) => isPaintVisible(fill))
    .map((fill) => getString(fill.type))
    .filter((fillType) => fillType && !supportedFillTypes.has(fillType))
    .forEach((fillType) => unsupported.add(fillType))

  return [...unsupported]
}

function isPaintVisible(paint: NodeRecord): boolean {
  const explicitVisible = paint.visible
  if (typeof explicitVisible === 'boolean') {
    return explicitVisible
  }
  const explicitIsVisible = paint.isVisible
  if (typeof explicitIsVisible === 'boolean') {
    return explicitIsVisible
  }
  return true
}

// 图片导出判断
export function isAssetHeavyNode(type: string): boolean {
  return ['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'LINE', 'ELLIPSE', 'POLYGON'].includes(type)
}

export function hasImageFill(rawNode: NodeRecord): boolean {
  return getVisiblePaints(rawNode.fills).some((fill) => getString(fill.type) === 'IMAGE')
}

export function hasAssetHeavyDescendant(rawNode: NodeRecord): boolean {
  return getChildren(rawNode).some((child) => {
    const childType = normalizeNodeType(getString(child.type))
    return isAssetHeavyNode(childType) || hasAssetHeavyDescendant(child)
  })
}

export function hasDecorativeVisualDescendant(rawNode: NodeRecord): boolean {
  return getChildren(rawNode).some((child) => isDecorativeVisualNode(child) || hasDecorativeVisualDescendant(child))
}

export function isDecorativeVisualNode(rawNode: NodeRecord): boolean {
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

export function hasTextDescendant(rawNode: NodeRecord): boolean {
  return getChildren(rawNode).some((child) => {
    const childType = normalizeNodeType(getString(child.type))
    return childType === 'TEXT' || hasTextDescendant(child)
  })
}

export function isSmallAssetContainer(rawNode: NodeRecord, type: string): boolean {
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

export function isSmallVisualNode(rawNode: NodeRecord, type: string): boolean {
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

export function shouldRasterizeNode(rawNode: NodeRecord, type: string, renderMode: string): boolean {
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

// 树遍历
export function walkTree(node: RenderNode, visitor: (node: RenderNode) => void) {
  visitor(node)
  node.children.forEach((child) => walkTree(child, visitor))
}

// 节点渲染树构建
export function normalizeRenderTree(node: RenderNode, isRoot = false): RenderNode {
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

// 样式 ID 处理
export function pushStyleIdFallbackStyles(styles: StyleEntry[], rawNode: NodeRecord, type: string, context: BuildContext) {
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

  const data = (codeString as NodeRecord).data
  if (!data) {
    return []
  }

  const sourceChunks =
    typeof data === 'string'
      ? [data]
      : Object.values(data as NodeRecord).filter((value): value is string => typeof value === 'string')

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

// 节点样式构建
export function buildNodeStyles(
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
  const zIndex = getOptionalNumber((rawNode as NodeRecord).zIndex)
  const layoutGrow = getNumber(rawNode.layoutGrow)
  const layoutAlign = getString(rawNode.layoutAlign)
  const itemSpacing = getNumber(rawNode.itemSpacing)
  const clipContent = getBoolean(rawNode.clipsContent)

  pushStyle(styles, 'box-sizing', 'border-box')

  if (parentLayoutMode === 'NONE') {
    pushStyle(styles, 'position', 'absolute')
    pushStyle(styles, 'left', `${roundNumber(x)}px`)
    pushStyle(styles, 'top', `${roundNumber(y)}px`)
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
    pushStyle(styles, 'gap', `${roundNumber(itemSpacing)}px`)

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

// 创建渲染节点
export async function createRenderNode(
  rawNode: ExportableNode,
  parentLayoutMode: string | null,
  context: BuildContext,
  resolveRasterAsset: (node: ExportableNode, type: string, name: string, context: BuildContext) => Promise<string>,
): Promise<RenderNode> {
  const type = normalizeNodeType(getString(rawNode.type))
  const name = getString(rawNode.name) || type.toLowerCase()
  const layoutMode = normalizeLayoutMode(getString(rawNode.layoutMode))
  const rasterAssetDataUrl = await resolveRasterAsset(rawNode, type, name, context)
  const children = rasterAssetDataUrl
    ? []
    : await Promise.all(
        getChildren(rawNode)
          .filter((child) => isNodeVisible(child))
          .map((child) => createRenderNode(child as ExportableNode, layoutMode, context, resolveRasterAsset)),
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

export function pushWarning(context: BuildContext, message: string) {
  if (!context.warnings.includes(message)) {
    context.warnings.push(message)
  }
}
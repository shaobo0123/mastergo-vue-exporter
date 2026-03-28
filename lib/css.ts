import type { NodeRecord, StyleEntry, BackgroundLayer } from './types'
import { getString, getNumber, getOptionalNumber, getOptionalBoolean, getList, getObjectArray, toPx, roundNumber, clamp, pushStyle, appendStyle } from './utils'

// 规范化函数
export function normalizeNodeType(value: string): string {
  return value ? value.toUpperCase() : 'NODE'
}

export function normalizeLayoutMode(value: string): string {
  return value ? value.toUpperCase() : 'NONE'
}

export function normalizeWrap(value: string): string {
  return value ? value.toUpperCase() : 'NO_WRAP'
}

export function normalizeStrokeAlign(value: string): string {
  return value === 'INSIDE' || value === 'OUTSIDE' ? value : 'CENTER'
}

export function normalizeStrokeStyle(value: string, dashes: unknown[]): string {
  if (value === 'DASH' || (Array.isArray(dashes) && dashes.length > 0)) {
    return 'dashed'
  }
  return 'solid'
}

// 映射函数
export function mapPrimaryAxisAlign(value: string): string {
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

export function mapCounterAxisAlign(value: string): string {
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

export function mapTextAlign(value: string): string {
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

export function mapTextDecoration(value: string): string {
  switch (value) {
    case 'UNDERLINE':
      return 'underline'
    case 'STRIKETHROUGH':
      return 'line-through'
    default:
      return ''
  }
}

export function mapTextCase(value: string): string {
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

export function mapBlendMode(value: string): string {
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

export function mapImageScaleMode(scaleMode: string, ratio: number): { size: string; position: string; repeat: string } {
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

// 字体处理
export function resolveFontWeight(rawNode: NodeRecord): string {
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

export function resolveFontFamily(rawNode: NodeRecord): string {
  const fontName = getFontNameRecord(rawNode)
  if (!fontName) {
    return ''
  }
  return normalizeFontFamilyName(getString(fontName.family))
}

export function resolveFontStyle(rawNode: NodeRecord): string {
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

export function resolveLineHeight(value: unknown, fontSize: number): string {
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

export function resolveLetterSpacing(value: unknown): string {
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

// 颜色处理
export function toCssColor(fill: NodeRecord): string {
  const color = fill.color
  if (!color || typeof color !== 'object' || Array.isArray(color)) {
    return ''
  }
  return toCssColorFromColorRecord(color as NodeRecord, getPaintAlpha(fill))
}

export function toCssColorFromColorRecord(colorRecord: NodeRecord, alphaMultiplier = 1): string {
  const red = normalizeChannel(getNumber(colorRecord.r))
  const green = normalizeChannel(getNumber(colorRecord.g))
  const blue = normalizeChannel(getNumber(colorRecord.b))
  const alpha = Math.min(1, Math.max(0, getNumber(colorRecord.a, 1) * alphaMultiplier))

  if (alpha === 1) {
    return `#${toHexChannel(red)}${toHexChannel(green)}${toHexChannel(blue)}`
  }
  return `rgba(${red}, ${green}, ${blue}, ${roundNumber(alpha)})`
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

// 渐变处理
export function resolveCssFill(fill: NodeRecord, type: string): string {
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

export function resolveCssBorderImage(fill: NodeRecord): string {
  const fillType = getString(fill.type)
  if (fillType === 'SOLID') {
    return ''
  }
  return resolveCssFill(fill, 'FRAME')
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

// 背景层处理
export function resolveBackgroundLayer(fill: NodeRecord): BackgroundLayer | null {
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
    image: `url("${escapeCssUrlForLayer(imageRef)}")`,
    size: mapped.size,
    position: mapped.position,
    repeat: mapped.repeat,
    blendMode: mapBlendMode(getString(fill.blendMode)) || 'normal',
  }
}

function escapeCssUrlForLayer(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '')
}

// 阴影处理
export function toCssShadow(effect: NodeRecord): string {
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

// Paint 可见性处理
export function isPaintVisible(paint: NodeRecord): boolean {
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

export function isEffectVisible(effect: NodeRecord): boolean {
  return isPaintVisible(effect)
}

export function getVisiblePaints(value: unknown): NodeRecord[] {
  return getObjectArray(value).filter((paint) => isPaintVisible(paint))
}

export function getPaintAlpha(paint: NodeRecord): number {
  return getOptionalNumber(paint.opacity) ?? getOptionalNumber(paint.alpha) ?? 1
}

// 样式生成函数
export function pushFillStyles(styles: StyleEntry[], rawNode: NodeRecord, type: string) {
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

export function pushNodeFillStyles(styles: StyleEntry[], fills: NodeRecord[]) {
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

export function pushTextFillStyles(styles: StyleEntry[], fills: NodeRecord[]) {
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

export function pushBackgroundLayerStyles(styles: StyleEntry[], layers: BackgroundLayer[]) {
  pushStyle(styles, 'background-image', layers.map((layer) => layer.image).join(', '))
  pushStyle(styles, 'background-size', layers.map((layer) => layer.size).join(', '))
  pushStyle(styles, 'background-position', layers.map((layer) => layer.position).join(', '))
  pushStyle(styles, 'background-repeat', layers.map((layer) => layer.repeat).join(', '))

  const blendModes = layers.map((layer) => layer.blendMode || 'normal')
  if (blendModes.some((blendMode) => blendMode !== 'normal')) {
    pushStyle(styles, 'background-blend-mode', blendModes.join(', '))
  }
}

export function pushBorderStyles(styles: StyleEntry[], rawNode: NodeRecord) {
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

export function pushRadiusStyles(styles: StyleEntry[], rawNode: NodeRecord) {
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

export function pushLineStyles(styles: StyleEntry[], rawNode: NodeRecord, width: number, height: number, rotation: number) {
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

export function pushSizeStyles(styles: StyleEntry[], width: number, height: number, type: string) {
  if (width > 0) {
    pushStyle(styles, 'width', toPx(width))
  }
  if (height > 0 && type !== 'TEXT') {
    pushStyle(styles, 'height', toPx(height))
  }
}

export function pushPaddingStyles(styles: StyleEntry[], rawNode: NodeRecord) {
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

export function pushTextStyles(styles: StyleEntry[], rawNode: NodeRecord) {
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

export function pushEffectStyles(styles: StyleEntry[], rawNode: NodeRecord) {
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

export function pushBlendStyles(styles: StyleEntry[], rawNode: NodeRecord) {
  const blendMode = mapBlendMode(getString(rawNode.blendMode))
  if (blendMode && blendMode !== 'normal') {
    pushStyle(styles, 'mix-blend-mode', blendMode)
  }
}

export function pushRasterAssetStyles(styles: StyleEntry[], rasterAssetDataUrl: string) {
  pushStyle(styles, 'background-image', `url("${escapeCssUrlForLayer(rasterAssetDataUrl)}")`)
  pushStyle(styles, 'background-size', '100% 100%')
  pushStyle(styles, 'background-position', 'center')
  pushStyle(styles, 'background-repeat', 'no-repeat')
}
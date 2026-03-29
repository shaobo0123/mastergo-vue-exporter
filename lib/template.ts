import type { ElementTemplateNode, RenderNode, RepeatTemplateGroup, RepeatTemplateNode, StyleEntry, StyleExtractionResult, SharedStyleBlock, StyleFormat, SnippetLanguage, TemplateNode } from './types'
import { escapeHtml, escapeVueText, escapeJsString } from './utils'
import { walkTree } from './node'

// 模板构建
export function buildTemplate(node: TemplateNode, depth: number, styleExtraction: StyleExtractionResult): string {
  if (node.kind === 'repeat') {
    return buildRepeatTemplate(node, depth, styleExtraction)
  }
  return buildElementTemplate(node, depth, styleExtraction)
}

function buildElementTemplate(node: ElementTemplateNode, depth: number, styleExtraction: StyleExtractionResult, extraAttrs = ''): string {
  const indent = '  '.repeat(depth)
  const classNames = styleExtraction.classNamesByNodeId[node.id] || []
  const classAttr = classNames.length ? ` class="${escapeHtml(classNames.join(' '))}"` : ''
  const styleAttr = node.styleBinding ? ` :style="${node.styleBinding}"` : ''
  const openTag = `${indent}<${node.tag}${classAttr}${styleAttr}${extraAttrs}>`
  const closeTag = `${indent}</${node.tag}>`
  const childLines = node.children.map((child) => buildTemplate(child, depth + 1, styleExtraction))
  const text = node.textBinding ? `{{ ${node.textBinding} }}` : escapeVueText(node.text)

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

function buildRepeatTemplate(node: RepeatTemplateNode, depth: number, styleExtraction: StyleExtractionResult): string {
  return buildElementTemplate(
    node.template,
    depth,
    styleExtraction,
    ` v-for="(${node.itemAlias}, index) in ${node.sourceName}" :key="index"`,
  )
}

// 样式表构建
export function buildStyleSheet(root: RenderNode, styleExtraction: StyleExtractionResult): string {
  const blocks: string[] = styleExtraction.sharedBlocks.map((block) => {
    const lines = block.styles.map((style) => `  ${style.prop}: ${style.value};`)
    return `.${block.className} {\n${lines.join('\n')}\n}`
  })

  const selectorGroups = new Map<string, { selectors: string[]; styles: StyleEntry[] }>()

  walkTree(root, (node) => {
    const nodeStyles = styleExtraction.nodeStylesByNodeId[node.id] || []
    if (!nodeStyles.length) {
      return
    }

    const signature = getStyleBlockSignature(nodeStyles)
    const selector = `.${node.className}`
    const group = selectorGroups.get(signature)

    if (group) {
      group.selectors.push(selector)
      return
    }

    selectorGroups.set(signature, {
      selectors: [selector],
      styles: nodeStyles,
    })
  })

  selectorGroups.forEach((group) => {
    const lines = group.styles.map((style) => `  ${style.prop}: ${style.value};`)
    blocks.push(`${group.selectors.join(', ')} {\n${lines.join('\n')}\n}`)
  })

  return blocks.join('\n\n')
}

// Vue SFC 构建
export function buildVueSfc(
  template: string,
  styleContent: string,
  styleFormat: StyleFormat,
  noteComment: string,
  framework: SnippetLanguage,
  componentName: string,
  repeatGroups: RepeatTemplateGroup[],
): string {
  const styleLangAttr = styleFormat === 'scss' ? ' lang="scss"' : ''
  const scriptBlock = buildComponentScriptBlock(componentName, framework, repeatGroups)
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

function buildComponentScriptBlock(componentName: string, framework: SnippetLanguage, repeatGroups: RepeatTemplateGroup[]): string {
  if (!repeatGroups.length && framework !== 'vue2') {
    return ''
  }

  const lines = [
    '<script>',
    'export default {',
    `  name: '${escapeJsString(componentName)}',`,
  ]

  if (repeatGroups.length) {
    lines.push('  data() {')
    lines.push('    return {')
    repeatGroups.forEach((group, index) => {
      const payload = JSON.stringify(group.items, null, 2)
        .split('\n')
        .map((line, lineIndex) => (lineIndex === 0 ? `      ${group.sourceName}: ${line}` : `      ${line}`))
      if (index === repeatGroups.length - 1) {
        const lastLineIndex = payload.length - 1
        payload[lastLineIndex] = `${payload[lastLineIndex]},`
      } else {
        const lastLineIndex = payload.length - 1
        payload[lastLineIndex] = `${payload[lastLineIndex]},`
      }
      lines.push(...payload)
    })
    lines.push('    }')
    lines.push('  }')
  } else {
    lines[lines.length - 1] = `  name: '${escapeJsString(componentName)}'`
  }

  lines.push('}')
  lines.push('</script>')
  return lines.join('\n')
}

export function buildWarningComment(warnings: string[]): string {
  if (!warnings.length) {
    return '<!-- Generated from MasterGo DevMode snippet plugin -->'
  }

  const lines = ['<!-- Generated from MasterGo DevMode snippet plugin', ...warnings.map((warning) => `  - ${warning}`), '-->']
  return lines.join('\n')
}

// 样式提取
const STRUCTURAL_SHARED_STYLE_PROP_ALLOWLIST = new Set([
  'position',
  'display',
  'flex',
  'flex-direction',
  'justify-content',
  'align-items',
  'align-self',
  'flex-wrap',
  'gap',
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'overflow',
  'background',
  'background-color',
  'background-size',
  'background-position',
  'background-repeat',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-radius',
  'box-shadow',
  'opacity',
  'font-size',
  'font-weight',
  'font-family',
  'font-style',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-decoration',
  'text-transform',
  'white-space',
  'color',
])

const NON_SHARED_STYLE_PROP_BLOCKLIST = new Set([
  'box-sizing',
  'left',
  'top',
  'right',
  'bottom',
  'z-index',
  'transform',
  'transform-origin',
])

export function buildStyleExtraction(root: RenderNode, mode: string): StyleExtractionResult {
  if (mode === 'off') {
    return createInlineStyleExtraction(root)
  }
  return extractSharedStyles(root)
}

function extractSharedStyles(root: RenderNode): StyleExtractionResult {
  const nodeStyleMap: Array<{
    node: RenderNode
    sharedCandidateStyles: StyleEntry[]
    ownStyles: StyleEntry[]
  }> = []

  walkTree(root, (node) => {
    const sharedCandidateStyles = node.styles.filter((style) => isExtractableSharedStyle(style))
    const ownStyles = node.styles.filter((style) => !isExtractableSharedStyle(style))
    nodeStyleMap.push({
      node,
      sharedCandidateStyles,
      ownStyles,
    })
  })

  const signatureCount: Record<string, number> = {}
  for (const { sharedCandidateStyles } of nodeStyleMap) {
    if (!shouldExtractSharedBlock(sharedCandidateStyles)) {
      continue
    }

    const signature = getStyleBlockSignature(sharedCandidateStyles)
    if (signature) {
      signatureCount[signature] = (signatureCount[signature] || 0) + 1
    }
  }

  const sharedClassBySignature: Record<string, string> = {}
  const sharedBlocks: SharedStyleBlock[] = []
  const classNamesByNodeId: Record<string, string[]> = {}
  const nodeStylesByNodeId: Record<string, StyleEntry[]> = {}

  for (const { node, sharedCandidateStyles, ownStyles } of nodeStyleMap) {
    const classNames: string[] = []

    const blockSignature = shouldExtractSharedBlock(sharedCandidateStyles)
      ? getStyleBlockSignature(sharedCandidateStyles)
      : ''

    const usesSharedBlock = blockSignature && (signatureCount[blockSignature] || 0) >= 2

    if (usesSharedBlock) {
      let sharedClassName = sharedClassBySignature[blockSignature]
      if (!sharedClassName) {
        sharedClassName = `layout-group-${sharedBlocks.length + 1}`
        sharedClassBySignature[blockSignature] = sharedClassName
        sharedBlocks.push({
          className: sharedClassName,
          styles: sharedCandidateStyles,
        })
      }
      classNames.push(sharedClassName)
    }

    const nodeSpecificStyles = usesSharedBlock ? ownStyles : node.styles

    if (nodeSpecificStyles.length) {
      classNames.push(node.className)
    }

    classNamesByNodeId[node.id] = classNames
    nodeStylesByNodeId[node.id] = nodeSpecificStyles
  }

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

function isExtractableSharedStyle(style: StyleEntry): boolean {
  if (NON_SHARED_STYLE_PROP_BLOCKLIST.has(style.prop)) {
    return false
  }

  return STRUCTURAL_SHARED_STYLE_PROP_ALLOWLIST.has(style.prop)
}

function getStyleSignature(style: StyleEntry): string {
  return `${style.prop}\u0000${style.value}`
}

function getStyleBlockSignature(styles: StyleEntry[]): string {
  return styles.map((style) => getStyleSignature(style)).join('\u0001')
}

function shouldExtractSharedBlock(styles: StyleEntry[]): boolean {
  return styles.length >= 2
}

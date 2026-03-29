import type { RenderNode, StyleEntry, StyleExtractionResult, SharedStyleBlock, StyleFormat, SnippetLanguage } from './types'
import { escapeHtml, escapeVueText, escapeJsString, toPascalCase } from './utils'
import { walkTree } from './node'

// 模板构建
export function buildTemplate(node: RenderNode, depth: number, styleExtraction: StyleExtractionResult): string {
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

export function buildWarningComment(warnings: string[]): string {
  if (!warnings.length) {
    return '<!-- Generated from MasterGo DevMode snippet plugin -->'
  }

  const lines = ['<!-- Generated from MasterGo DevMode snippet plugin', ...warnings.map((warning) => `  - ${warning}`), '-->']
  return lines.join('\n')
}

// 样式提取
export function buildStyleExtraction(root: RenderNode, mode: string): StyleExtractionResult {
  if (mode === 'off') {
    return createInlineStyleExtraction(root)
  }
  return extractSharedStyles(root, mode as Exclude<string, 'off'>)
}

function extractSharedStyles(root: RenderNode, mode: Exclude<string, 'off'>): StyleExtractionResult {
  const nodeStyleMap: Array<{
    node: RenderNode
    sharedCandidateStyles: StyleEntry[]
    ownStyles: StyleEntry[]
  }> = []

  walkTree(root, (node) => {
    const sharedCandidateStyles = node.styles.filter((style) => isExtractableSharedStyle(style, mode))
    const ownStyles = node.styles.filter((style) => !isExtractableSharedStyle(style, mode))
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
        sharedClassName = `${mode === 'layout' ? 'layout' : 'style'}-group-${sharedBlocks.length + 1}`
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

function isExtractableSharedStyle(style: StyleEntry, mode: Exclude<string, 'off'>): boolean {
  if (style.prop === 'box-sizing') {
    return false
  }

  if (mode === 'full') {
    return true
  }

  const LAYOUT_SHARED_STYLE_PROP_ALLOWLIST = new Set([
    'display',
    'flex-direction',
    'justify-content',
    'align-items',
    'flex-wrap',
    'align-self',
    'gap',
  ])

  return LAYOUT_SHARED_STYLE_PROP_ALLOWLIST.has(style.prop)
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

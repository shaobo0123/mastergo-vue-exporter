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
  // 一次遍历收集所有节点的样式信息
  const nodeStyleMap: Array<{ node: RenderNode; styles: StyleEntry[] }> = []

  walkTree(root, (node) => {
    nodeStyleMap.push({
      node,
      styles: node.styles,
    })
  })

  // 统计样式签名出现次数
  const signatureCount: Record<string, number> = {}
  for (const { styles } of nodeStyleMap) {
    for (const style of styles) {
      if (isExtractableSharedStyle(style, mode)) {
        const signature = getStyleSignature(style)
        signatureCount[signature] = (signatureCount[signature] || 0) + 1
      }
    }
  }

  // 根据统计结果提取共享样式
  const sharedClassBySignature: Record<string, string> = {}
  const sharedBlocks: SharedStyleBlock[] = []
  const classNamesByNodeId: Record<string, string[]> = {}
  const nodeStylesByNodeId: Record<string, StyleEntry[]> = {}

  for (const { node, styles } of nodeStyleMap) {
    const classNames: string[] = []
    const ownStyles: StyleEntry[] = []

    for (const style of styles) {
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
        continue
      }
      ownStyles.push(style)
    }

    if (ownStyles.length) {
      classNames.push(node.className)
    }

    classNamesByNodeId[node.id] = classNames
    nodeStylesByNodeId[node.id] = ownStyles
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
  if (mode === 'full') {
    return true
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

  return LAYOUT_SHARED_STYLE_PROP_ALLOWLIST.has(style.prop)
}

function getStyleSignature(style: StyleEntry): string {
  return `${style.prop}\u0000${style.value}`
}
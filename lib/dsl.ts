import type { ElementTemplateNode, RenderNode, RepeatTemplateGroup, RepeatTemplateNode, TemplateBuildResult, TemplateNode } from './types'
import { toPascalCase } from './utils'

const REPEAT_POSITION_STYLE_PROPS = new Set(['left', 'top', 'right', 'bottom', 'z-index', 'transform', 'transform-origin'])

export function buildTemplateDsl(root: RenderNode): TemplateBuildResult {
  const repeatGroups: RepeatTemplateGroup[] = []
  let repeatIndex = 0

  function buildElementNode(node: RenderNode, allowRepeatGroups: boolean): { renderNode: RenderNode; templateNode: ElementTemplateNode } {
    const nextRenderChildren: RenderNode[] = []
    const nextTemplateChildren: TemplateNode[] = []
    const children = node.children

    for (let index = 0; index < children.length; ) {
      const repeatRun = allowRepeatGroups ? resolveRepeatRun(children, index) : null

      if (repeatRun) {
        const groupName = createRepeatSourceName(repeatRun.nodes[0], ++repeatIndex)
        const representative = buildElementNode(stripStyles(repeatRun.nodes[0], repeatRun.dynamicStyleProps), false)
        applyTextBindings(representative.templateNode, repeatRun.bindings)

        if (repeatRun.dynamicStyleProps.length) {
          representative.templateNode.styleBinding = 'item.__style'
          repeatRun.items.forEach((item, itemIndex) => {
            item.__style = Object.fromEntries(
              repeatRun.dynamicStyleProps.map((prop) => [prop, getStyleValue(repeatRun.nodes[itemIndex].styles, prop)]),
            )
          })
        }

        repeatGroups.push({
          sourceName: groupName,
          itemAlias: 'item',
          items: repeatRun.items,
        })

        const repeatNode: RepeatTemplateNode = {
          kind: 'repeat',
          id: `${representative.templateNode.id}__repeat`,
          sourceName: groupName,
          itemAlias: 'item',
          template: representative.templateNode,
        }

        nextRenderChildren.push(representative.renderNode)
        nextTemplateChildren.push(repeatNode)
        index += repeatRun.nodes.length
        continue
      }

      const childResult = buildElementNode(children[index], allowRepeatGroups)
      nextRenderChildren.push(childResult.renderNode)
      nextTemplateChildren.push(childResult.templateNode)
      index += 1
    }

    return {
      renderNode: {
        ...node,
        children: nextRenderChildren,
      },
      templateNode: {
        kind: 'element',
        id: node.id,
        tag: node.tag,
        text: node.text,
        children: nextTemplateChildren,
      },
    }
  }

  const result = buildElementNode(root, true)
  return {
    renderRoot: result.renderNode,
    templateRoot: result.templateNode,
    repeatGroups,
  }
}

type RepeatRun = {
  nodes: RenderNode[]
  bindings: Record<string, string>
  items: Record<string, unknown>[]
  dynamicStyleProps: string[]
}

function resolveRepeatRun(siblings: RenderNode[], startIndex: number): RepeatRun | null {
  const first = siblings[startIndex]
  const signature = getRepeatSignature(first)
  const matchedNodes = [first]

  for (let index = startIndex + 1; index < siblings.length; index += 1) {
    if (getRepeatSignature(siblings[index]) !== signature) {
      break
    }
    matchedNodes.push(siblings[index])
  }

  if (matchedNodes.length < 3) {
    return null
  }

  const textLeaves = collectTextLeaves(first)
  if (!textLeaves.length) {
    return null
  }

  if (!isValuableRepeatCandidate(first, matchedNodes, textLeaves.length)) {
    return null
  }

  const bindings: Record<string, string> = {}
  const items = matchedNodes.map(() => ({} as Record<string, unknown>))
  const dynamicStyleProps = collectDynamicStyleProps(matchedNodes)
  let bindingCount = 0

  for (const leaf of textLeaves) {
    const values = matchedNodes.map((node) => getTextAtPath(node, leaf.path))
    if (values.some((value) => value === null)) {
      return null
    }

    const normalizedValues = values as string[]
    if (new Set(normalizedValues).size <= 1) {
      continue
    }

    bindingCount += 1
    const bindingKey = `field${bindingCount}`
    bindings[pathToKey(leaf.path)] = bindingKey

    normalizedValues.forEach((value, index) => {
      items[index][bindingKey] = value
    })
  }

  if (!bindingCount) {
    return null
  }

  return {
    nodes: matchedNodes,
    bindings,
    items,
    dynamicStyleProps,
  }
}

function isValuableRepeatCandidate(first: RenderNode, nodes: RenderNode[], textLeafCount: number): boolean {
  if (first.tag === 'span') {
    return false
  }

  if (!first.children.length) {
    return false
  }

  if (nodes.length >= 4) {
    return true
  }

  return textLeafCount >= 2 && hasMeaningfulContainerShape(first)
}

function hasMeaningfulContainerShape(node: RenderNode): boolean {
  const width = getStyleValue(node.styles, 'width')
  const height = getStyleValue(node.styles, 'height')
  const hasBackground = Boolean(getStyleValue(node.styles, 'background') || getStyleValue(node.styles, 'background-color'))
  const hasBorder = Boolean(
    getStyleValue(node.styles, 'border') ||
    getStyleValue(node.styles, 'border-top') ||
    getStyleValue(node.styles, 'border-right') ||
    getStyleValue(node.styles, 'border-bottom') ||
    getStyleValue(node.styles, 'border-left'),
  )

  return Boolean((width && height) || hasBackground || hasBorder)
}

function createRepeatSourceName(node: RenderNode, index: number): string {
  const base = toPascalCase(node.name || node.className || `RepeatGroup${index}`)
  const normalizedBase = base ? `${base.charAt(0).toLowerCase()}${base.slice(1)}` : 'repeatGroup'
  return `${normalizedBase}Items${index}`
}

function getRepeatSignature(node: RenderNode): string {
  const styleSignature = node.styles
    .filter((style) => !REPEAT_POSITION_STYLE_PROPS.has(style.prop))
    .map((style) => `${style.prop}:${style.value}`)
    .join(';')
  const childSignature = node.children.map((child) => getRepeatSignature(child)).join('|')
  const textMarker = node.text ? '__text__' : ''

  return [node.tag, styleSignature, textMarker, String(node.children.length), childSignature].join('::')
}

function collectTextLeaves(node: RenderNode, path: number[] = []): Array<{ path: number[]; text: string }> {
  const leaves: Array<{ path: number[]; text: string }> = []

  if (node.text) {
    leaves.push({ path, text: node.text })
  }

  node.children.forEach((child, index) => {
    leaves.push(...collectTextLeaves(child, [...path, index]))
  })

  return leaves
}

function getTextAtPath(node: RenderNode, path: number[]): string | null {
  let current: RenderNode | undefined = node
  for (const index of path) {
    current = current.children[index]
    if (!current) {
      return null
    }
  }
  return current.text || ''
}

function applyTextBindings(node: ElementTemplateNode, bindings: Record<string, string>, path: number[] = []) {
  const bindingKey = bindings[pathToKey(path)]
  if (bindingKey) {
    node.text = ''
    node.textBinding = `item.${bindingKey}`
  }

  node.children.forEach((child, index) => {
    if (child.kind !== 'element') {
      return
    }
    applyTextBindings(child, bindings, [...path, index])
  })
}

function pathToKey(path: number[]): string {
  return path.join('.')
}

function collectDynamicStyleProps(nodes: RenderNode[]): string[] {
  const styleProps = nodes[0]?.styles
    .filter((style) => REPEAT_POSITION_STYLE_PROPS.has(style.prop))
    .map((style) => style.prop) || []

  return styleProps.filter((prop) => {
    const values = nodes.map((node) => getStyleValue(node.styles, prop))
    return new Set(values).size > 1
  })
}

function getStyleValue(styles: RenderNode['styles'], prop: string): string {
  return styles.find((style) => style.prop === prop)?.value || ''
}

function stripStyles(node: RenderNode, styleProps: string[]): RenderNode {
  if (!styleProps.length) {
    return node
  }

  return {
    ...node,
    styles: node.styles.filter((style) => !styleProps.includes(style.prop)),
  }
}

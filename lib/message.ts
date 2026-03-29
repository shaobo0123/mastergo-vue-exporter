import { PluginMessage, UIMessage, sendMsgToUI } from '@messages/sender'
import type { GenerateEvent, SnippetBlock, BuildContext, GeneratorSettings } from './types'
import { SETTINGS_STORAGE_KEY, PROMPT_STORAGE_KEY, DEFAULT_GENERATOR_SETTINGS, DEFAULT_PROMPT_TEMPLATE, resolveGeneratorSettings, buildUiState, resolveStoredPrompt, getMessageRecord, buildOfficialCodegenSnippets, normalizeGeneratorSettings, normalizePromptContent } from './settings'
import { getErrorMessage, toPascalCase, getString } from './utils'
import { createRenderNode, normalizeRenderTree, pushWarning } from './node'
import { buildTemplateDsl } from './dsl'
import { buildTemplate, buildStyleSheet, buildVueSfc, buildWarningComment, buildStyleExtraction } from './template'
import { resolveAssetExportOptions, resolveRasterAssetDataUrl } from './export'

// UI 消息处理
export async function handleUiMessage(message: unknown): Promise<void> {
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

// Snippet 构建入口
export async function buildSnippets(data: GenerateEvent): Promise<SnippetBlock[]> {
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

  const assetExport = context.assetExport
  const resolveRasterAsset = async (node: unknown, type: string, name: string, ctx: BuildContext): Promise<string> => {
    return resolveRasterAssetDataUrl(node as any, type, name, assetExport, (msg) => pushWarning(ctx, msg))
  }

  const root = normalizeRenderTree(await createRenderNode(rawNode as any, null, context, resolveRasterAsset), true)
  const templateDsl = buildTemplateDsl(root)
  const styleExtraction = buildStyleExtraction(templateDsl.renderRoot, context.styleExtractionMode)
  const componentName = toPascalCase(templateDsl.renderRoot.name || 'MastergoLayout')
  const styleFormat = settings.styleFormat
  const template = buildTemplate(templateDsl.templateRoot, 1, styleExtraction)
  const styleContent = buildStyleSheet(templateDsl.renderRoot, styleExtraction)
  const noteComment = buildWarningComment(context.warnings)
  const vueSfc = buildVueSfc(template, styleContent, styleFormat, noteComment, settings.framework, componentName, templateDsl.repeatGroups)

  return [
    {
      language: 'html',
      title: `${componentName}.vue`,
      code: vueSfc,
    },
  ]
}

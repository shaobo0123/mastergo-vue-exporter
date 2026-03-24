<template>
  <main class="panel">
    <section class="hero">
      <div class="hero-top">
        <div>
          <p class="eyebrow">MasterGo Vue Exporter</p>
          <h1>Vue 导出设置</h1>
        </div>
        <button type="button" class="hide-btn" @click="hideSettings">收起</button>
      </div>
      <p class="desc">这里保存 Vue 导出参数，并支持直接编辑和保存提示词。</p>
    </section>

    <section v-if="settings" class="form-card">
      <div class="section-head">
        <h2>导出设置</h2>
        <p>调整参数后保存，Snippet 面板会读取这里的配置继续生成 Vue 代码。</p>
      </div>

      <label class="field">
        <span class="field-label">Vue 版本</span>
        <select v-model="settings.framework">
          <option value="vue3">Vue 3</option>
          <option value="vue2">Vue 2</option>
        </select>
      </label>

      <label class="switch-field">
        <span class="field-label">启用官方 Codegen</span>
        <button
          type="button"
          class="switch"
          :class="{ active: settings.useOfficialCodegen }"
          @click="settings.useOfficialCodegen = !settings.useOfficialCodegen"
        >
          <span>{{ settings.useOfficialCodegen ? '已开启' : '已关闭' }}</span>
        </button>
      </label>

      <p v-if="settings.useOfficialCodegen" class="hint">
        开启后优先使用官方 Codegen，下面的样式导出设置会被禁用。
      </p>

      <label class="field">
        <span class="field-label">样式格式</span>
        <select v-model="settings.styleFormat" :disabled="settings.useOfficialCodegen">
          <option value="css">CSS</option>
          <option value="scss">SCSS</option>
        </select>
      </label>

      <label class="field">
        <span class="field-label">样式提取</span>
        <select v-model="settings.styleExtractionMode" :disabled="settings.useOfficialCodegen">
          <option value="layout">仅提取布局类样式</option>
          <option value="full">完整提取重复样式</option>
          <option value="off">关闭</option>
        </select>
      </label>

      <label class="switch-field">
        <span class="field-label">导出图片资源</span>
        <button
          type="button"
          class="switch"
          :class="{ active: settings.exportImages }"
          :disabled="settings.useOfficialCodegen"
          @click="settings.exportImages = !settings.exportImages"
        >
          <span>{{ settings.exportImages ? '已开启' : '已关闭' }}</span>
        </button>
      </label>

      <label class="field">
        <span class="field-label">图片渲染方式</span>
        <select v-model="settings.assetRenderMode" :disabled="settings.useOfficialCodegen || !settings.exportImages">
          <option value="auto">自动</option>
          <option value="css">CSS</option>
          <option value="image">图片</option>
        </select>
      </label>

      <label class="field">
        <span class="field-label">图片格式</span>
        <select v-model="settings.imageFormat" :disabled="settings.useOfficialCodegen || !settings.exportImages">
          <option value="PNG">PNG</option>
          <option value="SVG">SVG</option>
          <option value="JPG">JPG</option>
          <option value="WEBP">WEBP</option>
        </select>
      </label>

      <label class="field">
        <span class="field-label">图片倍数</span>
        <select v-model="settings.imageScale" :disabled="settings.useOfficialCodegen || !settings.exportImages">
          <option value="1">1x</option>
          <option value="2">2x</option>
          <option value="3">3x</option>
          <option value="4">4x</option>
        </select>
      </label>

      <div class="actions">
        <button type="button" class="ghost" @click="resetSettings">恢复默认</button>
        <button type="button" class="primary" @click="saveSettings">保存设置</button>
      </div>

      <p class="status" :class="{ saved: statusTone === 'saved' }">{{ statusText }}</p>
    </section>

    <section class="form-card">
      <div class="section-head">
        <h2>提示词模块</h2>
        <p>下面内容默认来自项目中的 prompt.md，也可以在这里直接编辑并保存。</p>
      </div>

      <label class="field">
        <span class="field-label">Prompt 内容</span>
        <textarea
          v-model="promptContent"
          class="prompt-textarea mono"
          rows="14"
          spellcheck="false"
        />
      </label>

      <div class="actions">
        <button type="button" class="ghost" @click="resetPrompt">恢复默认提示词</button>
        <button type="button" class="primary" @click="savePrompt">保存提示词</button>
      </div>
    </section>
  </main>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { PluginMessage, UIMessage, sendMsgToPlugin } from '@messages/sender'
import promptTemplate from '../prompt.md?raw'

type SnippetLanguage = 'vue3' | 'vue2'
type StyleFormat = 'css' | 'scss'
type StyleExtractionMode = 'off' | 'layout' | 'full'
type AssetRenderMode = 'css' | 'auto' | 'image'
type ExportImageFormat = 'PNG' | 'JPG' | 'WEBP' | 'SVG'

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

const settings = ref<GeneratorSettings | null>(null)
const statusText = ref('正在读取设置...')
const statusTone = ref<'normal' | 'saved'>('normal')
const promptContent = ref(promptTemplate.trim())

function toPlainSettings(value: GeneratorSettings) {
  return {
    framework: value.framework,
    useOfficialCodegen: value.useOfficialCodegen,
    styleFormat: value.styleFormat,
    styleExtractionMode: value.styleExtractionMode,
    exportImages: value.exportImages,
    assetRenderMode: value.assetRenderMode,
    imageFormat: value.imageFormat,
    imageScale: value.imageScale,
  }
}

function requestSettings() {
  sendMsgToPlugin({
    type: UIMessage.GET_SETTINGS,
  })
}

function saveSettings() {
  if (!settings.value) {
    return
  }

  sendMsgToPlugin({
    type: UIMessage.SAVE_SETTINGS,
    data: toPlainSettings(settings.value),
  })
  statusText.value = '正在保存设置...'
  statusTone.value = 'normal'
}

function resetSettings() {
  sendMsgToPlugin({
    type: UIMessage.RESET_SETTINGS,
  })
  statusText.value = '正在恢复默认设置...'
  statusTone.value = 'normal'
}

function savePrompt() {
  sendMsgToPlugin({
    type: UIMessage.SAVE_PROMPT,
    data: promptContent.value,
  })
  statusText.value = '正在保存提示词...'
  statusTone.value = 'normal'
}

function resetPrompt() {
  sendMsgToPlugin({
    type: UIMessage.RESET_PROMPT,
  })
  statusText.value = '正在恢复默认提示词...'
  statusTone.value = 'normal'
}

function hideSettings() {
  sendMsgToPlugin({
    type: UIMessage.HIDE_SETTINGS,
  })
}

function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error
  }

  if (error && typeof error === 'object') {
    if ('message' in error && typeof error.message === 'string') {
      return error.message
    }

    if ('error' in error && typeof error.error === 'string') {
      return error.error
    }
  }

  return '未知错误'
}

async function handlePluginMessage(rawMessage: unknown) {
  const message = (rawMessage ?? {}) as { type?: string; data?: unknown }

  if (message.type === PluginMessage.SETTINGS || message.type === PluginMessage.SETTINGS_SAVED) {
    const raw = message.data as Record<string, unknown>
    settings.value = {
      framework: (raw.framework as SnippetLanguage) || 'vue3',
      useOfficialCodegen: Boolean(raw.useOfficialCodegen),
      styleFormat: (raw.styleFormat as StyleFormat) || 'css',
      styleExtractionMode: (raw.styleExtractionMode as StyleExtractionMode) || 'layout',
      exportImages: raw.exportImages !== false,
      assetRenderMode: (raw.assetRenderMode as AssetRenderMode) || 'auto',
      imageFormat: (raw.imageFormat as ExportImageFormat) || 'PNG',
      imageScale: String(raw.imageScale || '2'),
    }
    if (typeof raw.promptContent === 'string') {
      promptContent.value = raw.promptContent
    }
    statusText.value = message.type === PluginMessage.SETTINGS_SAVED ? '设置已保存。' : '设置已加载。'
    statusTone.value = message.type === PluginMessage.SETTINGS_SAVED ? 'saved' : 'normal'
    return
  }

  if (message.type === PluginMessage.PROMPT_SAVED) {
    const raw = message.data as Record<string, unknown>
    if (typeof raw.promptContent === 'string') {
      promptContent.value = raw.promptContent
    }
    statusText.value = '提示词已保存。'
    statusTone.value = 'saved'
    return
  }

  if (message.type === PluginMessage.ERROR) {
    statusText.value = `插件处理失败: ${getErrorMessage(message.data)}`
    statusTone.value = 'normal'
  }
}

function onWindowMessage(event: MessageEvent) {
  const message = event.data?.pluginMessage ?? event.data
  if (!message || typeof message !== 'object') {
    return
  }

  void handlePluginMessage(message)
}

onMounted(() => {
  window.addEventListener('message', onWindowMessage)
  requestSettings()
})

onBeforeUnmount(() => {
  window.removeEventListener('message', onWindowMessage)
})
</script>

<style scoped>
.panel {
  min-height: 100vh;
  padding: 20px;
  display: grid;
  gap: 16px;
  background:
    radial-gradient(circle at top right, rgba(33, 150, 243, 0.18), transparent 32%),
    linear-gradient(180deg, #f7fafc 0%, #eef3f8 100%);
  color: #18334d;
  font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
  box-sizing: border-box;
}

.hero {
  display: grid;
  gap: 10px;
}

.hero-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.eyebrow {
  margin: 0 0 6px;
  color: #2b6cb0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1,
h2 {
  margin: 0;
}

h1 {
  font-size: 24px;
  line-height: 1.2;
}

h2 {
  font-size: 18px;
}

.desc,
.section-head p,
.status {
  margin: 0;
  color: #4a657f;
  font-size: 13px;
  line-height: 1.6;
}

.form-card {
  display: grid;
  gap: 14px;
  padding: 16px;
  border: 1px solid rgba(24, 51, 77, 0.08);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 18px 40px rgba(24, 51, 77, 0.08);
}

.section-head {
  display: grid;
  gap: 4px;
}

.field,
.switch-field {
  display: grid;
  gap: 8px;
}

.field-label {
  font-size: 12px;
  font-weight: 700;
  color: #35516f;
}

select,
textarea,
.switch,
.hide-btn,
.primary,
.ghost {
  font: inherit;
}

select,
textarea {
  width: 100%;
  padding: 11px 12px;
  border: 1px solid rgba(53, 81, 111, 0.18);
  border-radius: 12px;
  background: #fff;
  color: #18334d;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  box-sizing: border-box;
}

select:focus,
textarea:focus {
  border-color: rgba(43, 108, 176, 0.6);
  box-shadow: 0 0 0 3px rgba(43, 108, 176, 0.14);
}

select:disabled,
textarea:disabled,
.switch:disabled,
.primary:disabled,
.ghost:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.switch {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 0 14px;
  border: none;
  border-radius: 12px;
  background: #d9e6f5;
  color: #35516f;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.switch.active {
  background: #2b6cb0;
  color: #fff;
}

.hint {
  margin: -4px 0 0;
  color: #7b5b00;
  font-size: 12px;
  line-height: 1.6;
}

.actions {
  display: flex;
  gap: 10px;
}

.primary,
.ghost,
.hide-btn {
  min-height: 42px;
  padding: 0 16px;
  border-radius: 12px;
  cursor: pointer;
  transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
}

.primary {
  border: none;
  background: linear-gradient(135deg, #2b6cb0, #3182ce);
  color: #fff;
  box-shadow: 0 10px 20px rgba(43, 108, 176, 0.2);
}

.ghost,
.hide-btn {
  border: 1px solid rgba(53, 81, 111, 0.16);
  background: rgba(255, 255, 255, 0.7);
  color: #35516f;
}

.primary:hover,
.ghost:hover,
.hide-btn:hover {
  transform: translateY(-1px);
}

.prompt-textarea {
  min-height: 260px;
  resize: vertical;
}

.mono {
  font-family: "Cascadia Code", "Consolas", monospace;
}

.status.saved {
  color: #1f7a4d;
}
</style>

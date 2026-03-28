import { PluginMessage, sendMsgToUI } from '@messages/sender'
import type { GenerateEvent, SnippetBlock } from './types'
import { handleUiMessage, buildSnippets } from './message'
import { getErrorMessage } from './utils'

declare const __html__: string

// 初始化 UI
mg.showUI(__html__, {
  width: 420,
  height: 780,
  visible: false,
})

// 注册 snippet 生成事件
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

// 注册 snippet action 事件
mg.snippetgen.on('action', (value: string) => {
  if (value === 'openSettings') {
    mg.ui.show()
    return
  }
  mg.notify(`Snippet action: ${value}`)
})

// 注册 UI 消息处理
mg.ui.onmessage = (message: unknown) => {
  void handleUiMessage(message).catch((error: unknown) => {
    const errorMessage = getErrorMessage(error)
    sendMsgToUI({
      type: PluginMessage.ERROR,
      data: {
        message: errorMessage,
      },
    })
    mg.notify(`设置处理失败: ${errorMessage}`, { type: 'error' })
  })
}
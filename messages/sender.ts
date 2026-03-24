export enum PluginMessage {
  SETTINGS = 'settings',
  SETTINGS_SAVED = 'settings-saved',
  PROMPT_SAVED = 'prompt-saved',
  ERROR = 'error',
}

export enum UIMessage {
  GET_SETTINGS = 'get-settings',
  SAVE_SETTINGS = 'save-settings',
  RESET_SETTINGS = 'reset-settings',
  SAVE_PROMPT = 'save-prompt',
  RESET_PROMPT = 'reset-prompt',
  HIDE_SETTINGS = 'hide-settings',
}

export type MessageType = {
  type: UIMessage | PluginMessage
  data?: any
}

/**
 * 向UI发送消息
 */
export const sendMsgToUI = (data: MessageType) => {
  mg.ui.postMessage(data, "*")
}


/**
 * 向插件发送消息
 */
export const sendMsgToPlugin = (data: MessageType) => {
  parent.postMessage({ pluginMessage: data }, "*")
}

// ===== scripts/services/ai.service.js =====
window.__biliExt = window.__biliExt || {}

class AIService {
  static get logger () { return window.__biliExt.LoggerService ? new window.__biliExt.LoggerService('AIService') : console }
  static get bridge () { return window.__biliExt.bridge }

  // 通过后台调用 AI API（绕过 CORS）
  static async chatCompletion (provider, model, messages, apiKey, customBaseUrl) {
    try {
      const result = await this.bridge.aiChat(provider, model, messages, apiKey, customBaseUrl)
      return result
    } catch (error) {
      this.logger.error('AI 对话失败:', error)
      throw error
    }
  }

  // 验证 API Key
  static async validateApiKey (provider, apiKey) {
    return await this.bridge.validateAiKey(provider, apiKey)
  }

  // 获取模型列表
  static async getModels (provider, apiKey) {
    return await this.bridge.getAiModels(provider, apiKey)
  }

  // 检测广告片段
  static async detectAds (subtitles, apiKey, provider, model, customBaseUrl) {
    try {
      const prompt = window.__biliExt.adDetectionPrompt || ''
      const subtitleText = subtitles.map(s => `[${this.#formatTime(s.from)}] ${s.content}`).join('\n')
      const messages = [
        { role: 'system', content: prompt },
        { role: 'user', content: `以下是一个视频的AI字幕内容，请分析并找出其中的广告片段：\n\n${subtitleText}` }
      ]
      const result = await this.chatCompletion(provider, model, messages, apiKey, customBaseUrl)
      const content = result.choices?.[0]?.message?.content || ''
      // 清理可能的 Markdown 包裹
      const cleaned = content.replace(/```json\s*/gi, '').replace(/```\s*$/g, '').trim()
      return JSON.parse(cleaned)
    } catch (error) {
      this.logger.error('广告检测失败:', error)
      return []
    }
  }

  static #formatTime (seconds) {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    return `${m}:${s.toString().padStart(2, '0')}`
  }
}

window.__biliExt.AIService = AIService

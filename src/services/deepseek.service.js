import { LoggerService } from './logger.service'
import { ConfigService } from './config.service'
import axios from 'axios'
export class DeepSeekService {
    static #instance
    #logger = new LoggerService('DeepSeekService')
    #initialized = false
    constructor () {
        if (DeepSeekService.#instance) {
            return DeepSeekService.#instance
        }
        DeepSeekService.#instance = this
    }
    async initialize () {
        if (this.#initialized) return
        try {
            await ConfigService.initialize()
            this.#initialized = true
        } catch (error) {
            this.#logger.error('DeepSeekService初始化失败', error)
            throw error
        }
    }
    async getApiKey () {
        await this.initialize()
        return ConfigService.getValue('ai_apikey')
    }
    async identifyAdvertisementTimestamps (subtitlesJson) {
        await this.initialize()
        const apiKey = await this.getApiKey()
        if (!apiKey) {
            this.#logger.error('DeepSeek API Key未配置')
            throw new Error('DeepSeek API Key未配置')
        }
        try {
            // 构建请求体
            const requestBody = {
                model: 'deepseek-chat',
                messages: [
                    {
                        role: 'system',
                        content: '你是一个广告识别专家，请分析传入的字幕内容，识别其中的广告段落。每个字幕条目包含start（开始时间）、end（结束时间）和content（内容）字段。请返回所有广告段落的开始和结束时间戳，格式为JSON数组，每个元素包含start和end字段。只返回广告段落，不要包含任何其他内容。'
                    },
                    {
                        role: 'user',
                        content: JSON.stringify(subtitlesJson)
                    }
                ],
                stream: false
            }
            // 调用DeepSeek API
            const response = await axios.post('https://api.deepseek.com/chat/completions', requestBody, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                }
            })
            const data = response.data
            const result = JSON.parse(data.choices[0].message.content)
            this.#logger.debug('广告识别结果', result)
            return result
        } catch (error) {
            this.#logger.error('字幕分析失败', error)
            throw error
        }
    }
    async identifyAdvertisementSegments (subtitlesJson) {
        await this.initialize()
        try {
            return await this.identifyAdvertisementTimestamps(subtitlesJson)
        } catch (error) {
            this.#logger.error('广告段落识别失败', error)
            return []
        }
    }
}
export const deepseekService = new DeepSeekService()
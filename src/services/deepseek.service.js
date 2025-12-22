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
        }
    }
    async getApiKey () {
        await this.initialize()
        return ConfigService.getValue('ai_apikey')
    }
    async identifyAdvertisementTimestamps (subtitlesJsonString) {
        await this.initialize()
        const apiKey = await this.getApiKey()
        if (!apiKey) {
            this.#logger.error('DeepSeek API Key未配置')
        }
        try {
            // 构建请求体
            const requestBody = {
                model: 'deepseek-chat',
                messages: [
                    {
                        role: 'system',
                        content: '你是一个广告识别专家，请分析传入的字幕内容，识别其中的广告段落。每个字幕条目包含start_timestamp（开始时间）、end_timestamp（结束时间）和content（内容）字段。请返回所有广告段落的开始和结束时间戳，格式为JSON数组，每个元素包含start和end字段。只返回广告段落，不要包含任何其他内容。'
                    },
                    {
                        role: 'user',
                        content: subtitlesJsonString
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
            // 处理HTTP错误码
            if (error.response) {
                const status = error.response.status
                let errorMessage = '字幕分析失败'
                switch (status) {
                    case 400:
                        errorMessage = 'DeepSeek API请求格式错误：请求体格式错误。解决方法：请根据错误信息提示修改请求体'
                        break
                    case 401:
                        errorMessage = 'DeepSeek API认证失败：API key错误，认证失败。解决方法：请检查您的API key是否正确，如没有API key，请先创建API key'
                        break
                    case 402:
                        errorMessage = 'DeepSeek API余额不足：账号余额不足。解决方法：请确认账户余额，并前往充值页面进行充值'
                        break
                    case 422:
                        errorMessage = 'DeepSeek API参数错误：请求体参数错误。解决方法：请根据错误信息提示修改相关参数'
                        break
                    case 429:
                        errorMessage = 'DeepSeek API请求速率达到上限：请求速率（TPM或RPM）达到上限。解决方法：请合理规划您的请求速率'
                        break
                    case 500:
                        errorMessage = 'DeepSeek API服务器故障：服务器内部故障。解决方法：请等待后重试。若问题一直存在，请联系我们解决'
                        break
                    case 503:
                        errorMessage = 'DeepSeek API服务器繁忙：服务器负载过高。解决方法：请稍后重试您的请求'
                        break
                    default:
                        errorMessage = `DeepSeek API请求失败，状态码：${status}`
                }
                this.#logger.error(errorMessage, error)
            } else {
                this.#logger.error('字幕分析失败', error)
            }
        }
    }
    async identifyAdvertisementSegments (subtitlesJsonString) {
        await this.initialize()
        try {
            return await this.identifyAdvertisementTimestamps(subtitlesJsonString)
        } catch (error) {
            this.#logger.error('广告段落识别失败', error)
            return []
        }
    }
}
export const deepseekService = new DeepSeekService()

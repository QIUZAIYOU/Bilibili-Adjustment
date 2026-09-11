import { LoggerService } from './logger.service'
import { ConfigService } from './config.service'
import { httpGet, httpPost } from '@/utils/http'
import { AD_DETECTION_PROMPT } from '@/shared/ad-detection-prompt'
// 当前进行中的 AI 请求控制器：供 UI「取消识别」使用（P1-4.6）
let currentRequestController = null
/** 取消进行中的 AI 识别请求（若存在） */
export const cancelAIRequest = () => {
    if (!currentRequestController) return false
    currentRequestController.abort()
    currentRequestController = null
    return true
}
// ========== 提供商配置（均为 OpenAI 兼容协议） ==========
const PROVIDER_CONFIGS = {
    siliconflow: {
        name: '硅基流动',
        baseURL: 'https://api.siliconflow.cn/v1',
        defaultModel: 'deepseek-ai/DeepSeek-V3',
        docsUrl: 'https://siliconflow.cn',
        pricingUrl: 'https://siliconflow.cn/pricing'
    },
    deepseek: {
        name: 'DeepSeek 官方',
        baseURL: 'https://api.deepseek.com/v1',
        defaultModel: 'deepseek-chat',
        docsUrl: 'https://platform.deepseek.com',
        pricingUrl: 'https://platform.deepseek.com/api-docs/pricing'
    },
    kimi: {
        name: 'Kimi（月之暗面）',
        baseURL: 'https://api.moonshot.cn/v1',
        defaultModel: 'moonshot-v1-8k',
        docsUrl: 'https://platform.moonshot.cn',
        pricingUrl: 'https://platform.moonshot.cn/docs/pricing'
    },
    zhipu: {
        name: '智谱 AI',
        baseURL: 'https://open.bigmodel.cn/api/paas/v4',
        defaultModel: 'glm-4-flash',
        docsUrl: 'https://open.bigmodel.cn',
        pricingUrl: 'https://open.bigmodel.cn/pricing'
    },
    openai: {
        name: 'OpenAI',
        baseURL: 'https://api.openai.com/v1',
        defaultModel: 'gpt-4o-mini',
        docsUrl: 'https://platform.openai.com',
        pricingUrl: 'https://openai.com/api/pricing'
    },
    custom: {
        name: '自定义',
        baseURL: '',
        defaultModel: '',
        docsUrl: '',
        pricingUrl: ''
    }
}
// 本地缓存的模型列表
let cachedModels = null
let cachedModelsKey = ''
let lastFetchTime = 0
const CACHE_DURATION = 5 * 60 * 1000
// 广告识别输出的 token 上限（P1-4.6）：结果为 JSON 数组，限长可减少超长生成与超时/截断
const MAX_RESPONSE_TOKENS = 2048
// ========== API Key 验证 ==========
/**
 * 验证 API Key 是否有效
 * @param {string} apiKey - API Key
 * @param {string} provider - 提供商标识
 * @param {string} baseURL - 自定义 baseURL（仅自定义提供商使用）
 * @returns {Promise<{valid: boolean, message: string}>}
 */
export async function validateApiKey (apiKey, provider = 'siliconflow', baseURL = '') {
    const config = PROVIDER_CONFIGS[provider] || PROVIDER_CONFIGS.siliconflow
    const effectiveBaseURL = (provider === 'custom' && baseURL ? baseURL : config.baseURL).replace(/\/$/, '')
    if (!apiKey) {
        return { valid: false, message: 'API Key 未配置' }
    }
    try {
        await httpGet(
            `${effectiveBaseURL}/models`,
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                },
                timeout: 10000
            }
        )
        return { valid: true, message: 'API Key 有效' }
    } catch (error) {
        if (error.response?.status === 401) {
            return { valid: false, message: 'API Key 无效或已过期' }
        }
        if (error.response?.status === 403) {
            return { valid: false, message: 'API Key 权限不足' }
        }
        if (error.code === 'ECONNABORTED') {
            return { valid: false, message: '请求超时，请检查网络连接' }
        }
        return { valid: false, message: `验证失败: ${error.message}` }
    }
}
// ========== 模型列表获取 ==========
/**
 * 从 API 获取可用模型列表
 * @param {string} apiKey - API Key
 * @param {string} provider - 提供商标识
 * @param {string} baseURL - 自定义 baseURL（仅自定义提供商使用）
 * @returns {Promise<Array>} 模型列表
 */
export async function fetchModels (apiKey, provider = 'siliconflow', baseURL = '') {
    const logger = new LoggerService('AIService', { notify: false }) // 接口/网络瞬时失败：只进控制台，不弹通知条
    const config = PROVIDER_CONFIGS[provider] || PROVIDER_CONFIGS.siliconflow
    const effectiveBaseURL = (provider === 'custom' && baseURL ? baseURL : config.baseURL).replace(/\/$/, '')
    const cacheKey = `${provider}|${effectiveBaseURL}`
    try {
        if (cachedModels && cachedModelsKey === cacheKey && Date.now() - lastFetchTime < CACHE_DURATION) {
            logger.debug('使用缓存的模型列表')
            return cachedModels
        }
        if (!apiKey) {
            logger.warn('API Key 未配置，无法获取模型列表')
            return getFallbackModels(provider)
        }
        const response = await httpGet(
            `${effectiveBaseURL}/models`,
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                },
                timeout: 10000,
                retries: 1
            }
        )
        if (response.data && Array.isArray(response.data.data)) {
            const chatModels = response.data.data.filter(model => {
                const id = model.id || ''
                return !id.includes('embedding') &&
                       !id.includes('image') &&
                       !id.includes('video') &&
                       !id.includes('audio') &&
                       !id.includes('tts') &&
                       !id.includes('rerank')
            })
            cachedModels = chatModels.map(model => ({
                id: model.id,
                label: formatModelLabel(model.id),
                object: model.object,
                ownedBy: model.owned_by || ''
            }))
            cachedModelsKey = cacheKey
            lastFetchTime = Date.now()
            logger.info(`成功获取 ${cachedModels.length} 个模型`)
            return cachedModels
        }
        return getFallbackModels(provider)
    } catch (error) {
        if (error.response?.status === 401) {
            logger.error('API Key 无效或已过期，请检查 API Key 是否正确')
            const authError = new Error('API Key 无效，请检查设置中的 API Key')
            authError.code = 'AUTH_FAILED'
            authError.status = 401
            throw authError
        }
        if (error.response?.status === 403) {
            logger.error('API Key 权限不足，无法访问模型列表')
            const authError = new Error('API Key 权限不足')
            authError.code = 'FORBIDDEN'
            authError.status = 403
            throw authError
        }
        if (error.code === 'ECONNABORTED') {
            logger.error('请求超时，请检查网络连接')
        } else if (error.response) {
            logger.error(`服务器错误: ${error.response.status}`, error.response.data)
        } else {
            logger.error('获取模型列表失败', error.message)
        }
        return getFallbackModels(provider)
    }
}
function formatModelLabel (modelId) {
    const parts = modelId.split('/')
    const name = parts[parts.length - 1]
    const labelMap = {
        'DeepSeek-V3': 'DeepSeek V3',
        'DeepSeek-R1': 'DeepSeek R1',
        'DeepSeek-V2.5': 'DeepSeek V2.5',
        'DeepSeek-Coder-V2-Instruct': 'DeepSeek Coder V2',
        'Qwen2.5-72B-Instruct': 'Qwen 2.5 72B',
        'Qwen2.5-32B-Instruct': 'Qwen 2.5 32B',
        'Qwen2.5-14B-Instruct': 'Qwen 2.5 14B',
        'Qwen2.5-7B-Instruct': 'Qwen 2.5 7B',
        'Qwen2.5-Coder-7B-Instruct': 'Qwen 2.5 Coder 7B',
        'Qwen2.5-Coder-32B-Instruct': 'Qwen 2.5 Coder 32B',
        'Qwen3.5': 'Qwen 3.5',
        'Kimi-K2.5': 'Kimi K2.5',
        'Kimi-K2.6': 'Kimi K2.6',
        'GLM-5.1': 'GLM 5.1',
        'deepseek-chat': 'DeepSeek Chat',
        'deepseek-reasoner': 'DeepSeek Reasoner',
        'moonshot-v1-8k': 'Moonshot v1 8K',
        'moonshot-v1-32k': 'Moonshot v1 32K',
        'moonshot-v1-128k': 'Moonshot v1 128K',
        'glm-4-flash': 'GLM-4 Flash',
        'glm-4-air': 'GLM-4 Air',
        'glm-4-plus': 'GLM-4 Plus',
        'glm-4.5': 'GLM 4.5',
        'gpt-4o-mini': 'GPT-4o mini',
        'gpt-4o': 'GPT-4o',
        'gpt-4.1': 'GPT-4.1',
        'gpt-4.1-mini': 'GPT-4.1 mini',
        'gpt-4.1-nano': 'GPT-4.1 nano',
        'Llama-3.3-70B-Instruct': 'Llama 3.3 70B',
        'Llama-3.2-3B-Instruct': 'Llama 3.2 3B'
    }
    return labelMap[name] || name
}
const FALLBACK_MODELS = {
    siliconflow: [
        { id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3' },
        { id: 'deepseek-ai/DeepSeek-R1', label: 'DeepSeek R1' },
        { id: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen 2.5 72B' },
        { id: 'Qwen/Qwen2.5-32B-Instruct', label: 'Qwen 2.5 32B' },
        { id: 'Qwen/Qwen2.5-14B-Instruct', label: 'Qwen 2.5 14B' },
        { id: 'Qwen/Qwen2.5-7B-Instruct', label: 'Qwen 2.5 7B' },
        { id: 'THUDM/GLM-5.1', label: 'GLM 5.1' }
    ],
    custom: []
}
function getFallbackModels (provider = 'siliconflow') {
    if (provider in FALLBACK_MODELS) return FALLBACK_MODELS[provider]
    // 预设提供商：返回各自默认模型
    const config = PROVIDER_CONFIGS[provider]
    if (!config) return FALLBACK_MODELS.siliconflow
    return [{ id: config.defaultModel, label: formatModelLabel(config.defaultModel) }]
}
export function clearModelCache () {
    cachedModels = null
    cachedModelsKey = ''
    lastFetchTime = 0
}
// ========== AI 服务基类 ==========
export class AIService {
    static #instance = null
    #logger = new LoggerService('AIService', { notify: false }) // 接口/网络瞬时失败：只进控制台，不弹通知条
    #initialized = false
    constructor () {
        if (AIService.#instance) {
            return AIService.#instance
        }
        AIService.#instance = this
    }
    static getInstance () {
        if (!this.#instance) {
            this.#instance = new AIService()
        }
        return this.#instance
    }
    async initialize () {
        if (this.#initialized) return
        try {
            await ConfigService.initialize()
            this.#initialized = true
        } catch (error) {
            this.#logger.error('AIService初始化失败', error)
        }
    }
    async getModel () {
        await this.initialize()
        const useCustomModel = await ConfigService.getValue('use_custom_model')
        if (useCustomModel) {
            const customModelId = await ConfigService.getValue('custom_model_id')
            if (customModelId) {
                return customModelId
            }
        }
        const provider = await this.getProvider()
        return (await ConfigService.getValue('ai_model')) ||
               PROVIDER_CONFIGS[provider]?.defaultModel ||
               PROVIDER_CONFIGS.siliconflow.defaultModel
    }
    async getApiKey () {
        await this.initialize()
        const useCustomModel = await ConfigService.getValue('use_custom_model')
        if (useCustomModel) {
            return ConfigService.getValue('custom_model_api_key') || ConfigService.getValue('ai_apikey')
        }
        return ConfigService.getValue('ai_apikey')
    }
    async getProvider () {
        await this.initialize()
        const useCustomModel = await ConfigService.getValue('use_custom_model')
        if (useCustomModel) {
            return 'custom'
        }
        return ConfigService.getValue('ai_provider') || 'siliconflow'
    }
    async getCustomBaseURL () {
        await this.initialize()
        const useCustomModel = await ConfigService.getValue('use_custom_model')
        if (useCustomModel) {
            return ConfigService.getValue('custom_model_api_url') || ConfigService.getValue('custom_base_url') || ''
        }
        return ConfigService.getValue('custom_base_url') || ''
    }
    async identifyAdvertisementTimestamps () {
        throw new Error('子类必须实现identifyAdvertisementTimestamps方法')
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
// ========== OpenAI 格式适配器 ==========
class OpenAIAdapter {
    #baseURL = ''
    constructor (baseURL) {
        this.#baseURL = baseURL.replace(/\/$/, '')
    }
    async chat (apiKey, model, messages, useCustomModel = false) {
        const requestBody = {
            model,
            messages,
            stream: false,
            // P1-4.6：收紧生成参数 —— 期望输出为 JSON 数组，限制长度并降低随机性以减少截断/格式漂移
            temperature: 0.1,
            max_tokens: MAX_RESPONSE_TOKENS
        }
        // 自定义模型时，根据模型ID判断是否添加 DeepSeek 特定参数
        if (useCustomModel && model.includes('deepseek')) {
            requestBody.thinking = { type: 'enabled' }
            requestBody.reasoning_effort = 'high'
        }
        // 记录当前请求控制器：UI 可通过 cancelAIRequest() 取消进行中的识别
        const controller = new AbortController()
        currentRequestController = controller
        try {
            const response = await httpPost(
                `${this.#baseURL}/chat/completions`,
                requestBody,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    // 广告字幕可能很长，模型生成耗时高：放宽到 120s，降低偶发超时
                    timeout: 120000,
                    signal: controller.signal
                }
            )
            return response.data.choices[0].message.content
        } finally {
            if (currentRequestController === controller) currentRequestController = null
        }
    }
    handleError (status) {
        const messages = {
            400: '请求格式错误：请求体格式错误。解决方法：请根据错误信息提示修改请求体',
            401: '认证失败：API key错误，认证失败。解决方法：请检查您的API key是否正确',
            402: '余额不足：账号余额不足。解决方法：请确认账户余额，并前往充值页面进行充值',
            403: '权限不足：当前API key没有权限访问该模型',
            404: '模型不存在：请求的模型不可用或已下架',
            422: '参数错误：请求体参数错误。解决方法：请根据错误信息提示修改相关参数',
            429: '请求速率达到上限：请求速率（TPM或RPM）达到上限。解决方法：请合理规划您的请求速率',
            500: '服务器故障：服务器内部故障。解决方法：请等待后重试',
            503: '服务器繁忙：服务器负载过高。解决方法：请稍后重试您的请求'
        }
        return messages[status] || `API请求失败，状态码：${status}`
    }
}
// ========== 统一的 AI 服务实现 ==========
export class UnifiedAIService extends AIService {
    #logger = new LoggerService('UnifiedAIService', { notify: false }) // 接口/网络瞬时失败：只进控制台，不弹通知条
    #adapter = null
    #adapterKey = ''
    async #getAdapter () {
        const provider = await this.getProvider()
        const customBaseURL = await this.getCustomBaseURL()
        const baseURL = provider === 'custom' && customBaseURL
            ? customBaseURL
            : PROVIDER_CONFIGS[provider]?.baseURL || PROVIDER_CONFIGS.siliconflow.baseURL
        const adapterKey = `${provider}|${baseURL}`
        if (!this.#adapter || this.#adapterKey !== adapterKey) {
            this.#adapter = new OpenAIAdapter(baseURL)
            this.#adapterKey = adapterKey
        }
        return this.#adapter
    }
    async identifyAdvertisementTimestamps (subtitlesJsonString) {
        await this.initialize()
        const apiKey = await this.getApiKey()
        if (!apiKey) {
            this.#logger.error('API Key未配置')
            return []
        }
        const model = await this.getModel()
        if (!model) {
            this.#logger.error('模型未配置')
            return []
        }
        const useCustomModel = await ConfigService.getValue('use_custom_model')
        try {
            const adapter = await this.#getAdapter()
            const messages = [
                { role: 'system', content: AD_DETECTION_PROMPT },
                { role: 'user', content: subtitlesJsonString }
            ]
            let content
            try {
                content = await adapter.chat(apiKey, model, messages, useCustomModel)
            } catch (error) {
                // 用户主动取消（P1-4.6）：不重试、不报错
                if (error.code === 'ERR_CANCELED') {
                    this.#logger.info('广告识别已取消（用户中断）')
                    return []
                }
                // 网络/超时类失败自动重试一次，降低偶发超时导致的识别失败
                const retriable = !error.response || error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK' || String((error && error.message) || '').includes('timeout')
                if (!retriable) throw error
                this.#logger.warn('广告识别请求失败，自动重试一次：' + ((error && error.message) || error.code || 'unknown'))
                content = await adapter.chat(apiKey, model, messages, useCustomModel)
            }
            // 检查响应是否为空
            if (!content || !content.trim()) {
                this.#logger.error('AI响应内容为空')
                return []
            }
            // 兼容 Markdown 代码块和空数组响应，再提取 JSON 数组。
            const normalizedContent = String(content || '')
                .replace(/^```(?:json)?\s*/i, '')
                .replace(/\s*```$/i, '')
                .trim()
            // 检查规范化后的内容是否为空
            if (!normalizedContent) {
                this.#logger.error('AI响应内容为空')
                return []
            }
            const match = normalizedContent.match(/\[[\s\S]*\]/)
            const jsonStr = match ? match[0] : normalizedContent
            // 检查JSON字符串是否为空
            if (!jsonStr || !jsonStr.trim()) {
                this.#logger.error('AI响应中未找到有效JSON')
                return []
            }
            try {
                const result = JSON.parse(jsonStr)
                if (!Array.isArray(result)) {
                    this.#logger.error('AI响应格式错误，预期数组格式')
                    return []
                }
                this.#logger.debug('广告识别结果', result)
                return result
            } catch {
                this.#logger.error('AI响应JSON解析失败（内容摘要：' + String(jsonStr).slice(0, 200) + '）')
                this.#logger.debug('AI响应原始内容（前 500 字符）', String(content).slice(0, 500))
                return []
            }
        } catch (error) {
            if (error.code === 'ERR_CANCELED') {
                this.#logger.info('广告识别已取消（用户中断）')
                return []
            }
            if (error.response) {
                const adapter = await this.#getAdapter()
                const errorMessage = adapter.handleError(error.response.status)
                this.#logger.error(errorMessage, error)
            } else {
                // 网络/超时类失败（已自动重试仍失败）：降噪为一次 warn，避免频繁刷错误堆栈
                this.#logger.warn('字幕分析失败（已重试）：' + ((error && error.message) || error.code || error))
            }
            return []
        }
    }
}
// ========== 工厂方法 ==========
export const createAIService = async () => {
    await ConfigService.initialize()
    return new UnifiedAIService()
}
// ========== 导出默认实例 ==========
export let aiService
export let aiServicePromise = null
export const initializeAIService = async () => {
    if (!aiServicePromise) {
        aiServicePromise = createAIService()
    }
    aiService = await aiServicePromise
    return aiService
}

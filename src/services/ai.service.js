import { LoggerService } from './logger.service'
import { ConfigService } from './config.service'
import axios from 'axios'

// ========== 提供商配置 ==========
const PROVIDER_CONFIGS = {
    siliconflow: {
        name: '硅基流动',
        baseURL: 'https://api.siliconflow.cn/v1',
        defaultModel: 'deepseek-ai/DeepSeek-V3',
        docsUrl: 'https://siliconflow.cn',
        pricingUrl: 'https://siliconflow.cn/pricing'
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
let lastFetchTime = 0
const CACHE_DURATION = 5 * 60 * 1000

// ========== API Key 验证 ==========
/**
 * 验证 API Key 是否有效
 * @param {string} apiKey - API Key
 * @param {string} provider - 提供商标识
 * @param {string} baseURL - 自定义 baseURL（仅自定义提供商使用）
 * @returns {Promise<{valid: boolean, message: string}>}
 */
export async function validateApiKey (apiKey, provider = 'siliconflow', baseURL = '') {
    const logger = new LoggerService('AIService')
    const config = PROVIDER_CONFIGS[provider] || PROVIDER_CONFIGS.siliconflow
    const effectiveBaseURL = provider === 'custom' && baseURL ? baseURL : config.baseURL

    if (!apiKey) {
        return { valid: false, message: 'API Key 未配置' }
    }

    try {
        await axios.get(
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
    const logger = new LoggerService('AIService')
    const config = PROVIDER_CONFIGS[provider] || PROVIDER_CONFIGS.siliconflow
    const effectiveBaseURL = provider === 'custom' && baseURL ? baseURL : config.baseURL

    try {
        if (cachedModels && Date.now() - lastFetchTime < CACHE_DURATION) {
            logger.debug('使用缓存的模型列表')
            return cachedModels
        }
        if (!apiKey) {
            logger.warn('API Key 未配置，无法获取模型列表')
            return getFallbackModels(provider)
        }
        const response = await axios.get(
            `${effectiveBaseURL}/models`,
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                },
                timeout: 10000
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
        'Llama-3.3-70B-Instruct': 'Llama 3.3 70B',
        'Llama-3.2-3B-Instruct': 'Llama 3.2 3B'
    }
    return labelMap[name] || name
}

function getFallbackModels (provider = 'siliconflow') {
    if (provider === 'custom') {
        return []
    }
    return [
        { id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3' },
        { id: 'deepseek-ai/DeepSeek-R1', label: 'DeepSeek R1' },
        { id: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen 2.5 72B' },
        { id: 'Qwen/Qwen2.5-32B-Instruct', label: 'Qwen 2.5 32B' },
        { id: 'Qwen/Qwen2.5-14B-Instruct', label: 'Qwen 2.5 14B' },
        { id: 'Qwen/Qwen2.5-7B-Instruct', label: 'Qwen 2.5 7B' },
        { id: 'THUDM/GLM-5.1', label: 'GLM 5.1' }
    ]
}

export function clearModelCache () {
    cachedModels = null
    lastFetchTime = 0
}

// ========== AI 服务基类 ==========
export class AIService {
    static #instance = null
    #logger = new LoggerService('AIService')
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
        return ConfigService.getValue('ai_model') || PROVIDER_CONFIGS.siliconflow.defaultModel
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
    async identifyAdvertisementTimestamps (_subtitlesJsonString) {
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

// ========== 系统提示词 ==========
const SYSTEM_PROMPT = `你是一个极其专业的视频广告识别专家，专门分析YouTube、抖音、B站、TikTok等平台视频的字幕内容，以最高精度识别其中的广告段落（包括硬广、软广、口播植入、赞助披露、中插广告、片尾推广等）。

给定一个包含多个字幕条目的列表，每个条目有三个字段：
- start_timestamp：字幕开始时间（单位：秒，浮点数或整数）
- end_timestamp：字幕结束时间（单位：秒，浮点数或整数）
- content：字幕文本内容

你的任务是：
1. **首先评估整个视频的整体主题**：仔细阅读所有字幕，判断视频是否以介绍单一产品、服务、项目或创作者自身内容为核心（例如：产品评测、开箱演示、教程制作、项目展示、创作者自荐等）。如果整个视频内容围绕该主题展开，且无插入与主题无关的第三方商业推广，则整个视频不应被视为广告。即使出现产品描述、推荐词汇，也视为主题叙事的自然部分，不判定为广告。
- 示例：一个视频全程介绍创作者设计的"零件盒"，包括设计过程、组装、配色和上传平台鼓励制作，这属于创作者自身内容介绍，不是广告。
- 反例：视频主题是游戏实况，但中途插入无关的"本视频由XX品牌赞助，点击链接购买XX产品"，则该插入部分为广告。

2. 逐条仔细阅读所有字幕内容，结合上下文判断哪些连续的字幕条目属于广告段落。只有在确认视频整体主题后，再匹配广告特征。

3. 广告的典型特征包括但不限于（**必须伴随独立的推广意图，且脱离视频核心主题叙事**）：
- 明确提到"赞助""合作""广告""推广""本视频由XX赞助""感谢XX支持""品牌方""植入""这款产品""链接在描述区""优惠码""限时折扣""马上购买"等词汇，**且这些词汇指向第三方品牌或服务，而非视频主题的核心产品**。
- 主播直接向观众推荐产品、服务、App、课程或其他品牌，并伴随购买引导、促销信息或行动呼吁（如点击链接、使用代码），**且该推荐独立于视频主线**。
- 出现品牌名称并伴随正面评价、功能介绍、使用演示、价格说明等明确的推广意图，**且内容独立于视频主题叙事、具有第三方销售导向**。
- 出现"赞助商环节""广告时间""插播一条广告""软广时间"等自披露语句。
- 突然切换到与视频主体内容无关的第三方产品或服务介绍，且具有推广性质。
- **出现表示即将进入广告环节的过渡语句，如"在开始之前"、"插播一条"、"接下来是广告时间"、"不过在这之前"等，即使后续字幕才具体介绍产品。但如果该过渡是引入视频核心主题（如介绍自有产品），则不视为广告**。

4. **重要强调**：如果品牌提及或活动描述是视频核心叙事的自然组成部分（如产品设计视频中描述适配的打印材料品牌，且无直接引导购买或促销），则不视为广告。反之，如果内容包含明确的第三方销售意图、促销信息或与主题无关的推广，则判定为广告。优先假设内容为非广告，除非有明确证据。

5. 广告段落必须是连续的字幕条目。广告开始于第一条显示广告意图（包括引入广告的过渡语句）的字幕的start_timestamp，结束于最后一条仍属于同一广告内容的字幕的end_timestamp。

6. 如果同一视频中存在多个独立广告段落，请分别识别。

7. 只在有明确证据显示独立推广意图时才判定为广告，避免误判正常内容讨论为广告。当内容与视频主题高度融合、无直接促销时，应谨慎判断，优先视为视频内容的一部分。**如果整个视频无任何独立广告，则返回空数组[]**。

8. 输出必须严格为一个JSON数组，数组中每个元素为一个对象，仅包含"start"和"end"两个字段，数值保持原字幕时间戳的精度（保留小数）。如果没有检测到任何广告，则返回空数组[]。

输出示例（有广告）：
[{"start": 125.4, "end": 189.6}, {"start": 720.0, "end": 765.2}]

输出示例（无广告）：
[]
请直接输出JSON结果，不要输出任何解释、文字或额外内容。`

// ========== OpenAI 格式适配器 ==========
class OpenAIAdapter {
    #logger = new LoggerService('OpenAIAdapter')
    #baseURL = ''
    constructor (baseURL) {
        this.#baseURL = baseURL
    }
    async chat (apiKey, model, messages, useCustomModel = false) {
        const requestBody = {
            model,
            messages,
            stream: false
        }
        // 自定义模型时，根据模型ID判断是否添加 DeepSeek 特定参数
        if (useCustomModel && model.includes('deepseek')) {
            requestBody.thinking = { type: 'enabled' }
            requestBody.reasoning_effort = 'high'
        }
        const response = await axios.post(
            `${this.#baseURL}/chat/completions`,
            requestBody,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                timeout: 60000
            }
        )
        return response.data.choices[0].message.content
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
    #logger = new LoggerService('UnifiedAIService')
    #adapter = null
    async #getAdapter () {
        if (this.#adapter) return this.#adapter
        const provider = await this.getProvider()
        const customBaseURL = await this.getCustomBaseURL()
        const baseURL = provider === 'custom' && customBaseURL
            ? customBaseURL
            : PROVIDER_CONFIGS[provider]?.baseURL || PROVIDER_CONFIGS.siliconflow.baseURL
        this.#adapter = new OpenAIAdapter(baseURL)
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
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: subtitlesJsonString }
            ]
            const content = await adapter.chat(apiKey, model, messages, useCustomModel)
            try {
                const result = JSON.parse(content)
                if (!Array.isArray(result)) {
                    this.#logger.error('AI响应格式错误，预期数组格式')
                    return []
                }
                this.#logger.debug('广告识别结果', result)
                return result
            } catch (error) {
                this.#logger.error('AI响应JSON解析失败', error)
                return []
            }
        } catch (error) {
            if (error.response) {
                const adapter = await this.#getAdapter()
                const errorMessage = adapter.handleError(error.response.status)
                this.#logger.error(errorMessage, error)
            } else {
                this.#logger.error('字幕分析失败', error)
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

import { LoggerService } from './logger.service'
import { ConfigService } from './config.service'
import { httpGet, httpPost } from '@/utils/http'
import { resolveAdDetectionPrompt } from '@/services/prompt.service'
import { AI_PROVIDER_CONFIGS as PROVIDER_CONFIGS } from '@/shared/ai-providers'
import { parseJsonArrayLoose } from '@/utils/ai-json'
import {
    initialResponseTokens,
    retryResponseTokens,
    shouldRetryEmptyResponse,
    isTruncatedByLength,
    describeChatResult
} from '@/utils/ai-response'
import type { ChatResult } from '@/utils/ai-response'
import type { HttpError } from '@/utils/http'
import { withRetryBudget, isRetryableRequestError } from '@/utils/retry-policy'
/** 拉取模型列表的重试预算（设置面板即时操作，别让下拉框一直转） */
const MODEL_LIST_RETRY_BUDGET_MS = 30 * 1000
/** AI 识别请求的重试预算（后台识别，网络抖动时多试几次；每次调用本身可能耗时数十秒） */
const AI_CHAT_RETRY_BUDGET_MS = 90 * 1000
/** 模型列表条目 */
export interface AIModelOption {
    id: string
    label: string
    object?: unknown
    ownedBy?: string
}
// 当前进行中的 AI 请求控制器：供 UI「取消识别」使用（P1-4.6）
let currentRequestController: AbortController | null = null
/** 取消进行中的 AI 识别请求（若存在） */
export const cancelAIRequest = (): boolean => {
    if (!currentRequestController) return false
    currentRequestController.abort()
    currentRequestController = null
    return true
}
// 提供商配置（含端点与默认模型）见 src/shared/ai-providers.ts：
// 它既作为内置兜底，也作为热更覆盖的白名单（远端只能改已存在 provider 的 baseURL/defaultModel）
// 本地缓存的模型列表
let cachedModels: AIModelOption[] | null = null
let cachedModelsKey = ''
let lastFetchTime = 0
const CACHE_DURATION = 5 * 60 * 1000
// 广告识别输出的 token 上限与空响应判定见 src/utils/ai-response.ts
// （3.31.0 起这里是写死的 2048：思考型模型把推理算进同一预算 → content 为空，故改为按是否思考型给预算）
// ========== API Key 验证 ==========
/**
 * 验证 API Key 是否有效
 * @param {string} apiKey - API Key
 * @param {string} provider - 提供商标识
 * @param {string} baseURL - 自定义 baseURL（仅自定义提供商使用）
 * @returns {Promise<{valid: boolean, message: string}>}
 */
export async function validateApiKey (apiKey: string, provider = 'siliconflow', baseURL = ''): Promise<{ valid: boolean; message: string }> {
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
        const httpErr = error as Partial<HttpError>
        if (httpErr.response?.status === 401) {
            return { valid: false, message: 'API Key 无效或已过期' }
        }
        if (httpErr.response?.status === 403) {
            return { valid: false, message: 'API Key 权限不足' }
        }
        if (httpErr.code === 'ECONNABORTED') {
            return { valid: false, message: '请求超时，请检查网络连接' }
        }
        return { valid: false, message: `验证失败: ${error instanceof Error ? error.message : String(error)}` }
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
export async function fetchModels (apiKey: string, provider = 'siliconflow', baseURL = '', retryOptions: { retryBudgetMs?: number, retryDelay?: number } = {}): Promise<AIModelOption[]> {
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
                // 拉模型列表是设置面板里的即时操作：按预算重试（30 秒）而不是"只试 2 次"，
                // 网络抖动时能自愈，同时又不会让下拉框一直转（测试可传更小预算）
                retryBudgetMs: retryOptions.retryBudgetMs ?? MODEL_LIST_RETRY_BUDGET_MS,
                retryDelay: retryOptions.retryDelay
            }
        )
        const payload = response.data as { data?: Array<{ id?: string; object?: unknown; owned_by?: string }> } | null
        if (payload && Array.isArray(payload.data)) {
            const chatModels = payload.data.filter(model => {
                const id = model.id || ''
                return !id.includes('embedding') &&
                       !id.includes('image') &&
                       !id.includes('video') &&
                       !id.includes('audio') &&
                       !id.includes('tts') &&
                       !id.includes('rerank')
            })
            cachedModels = chatModels.map(model => {
                // 官方 /models 返回的 id 必有值；缺失时与原实现一样会走 formatModelLabel 的容错分支
                const id = model.id as string
                return {
                    id,
                    label: formatModelLabel(id),
                    object: model.object,
                    ownedBy: model.owned_by || ''
                }
            })
            cachedModelsKey = cacheKey
            lastFetchTime = Date.now()
            logger.info(`成功获取 ${cachedModels.length} 个模型`)
            return cachedModels
        }
        return getFallbackModels(provider)
    } catch (error) {
        const httpErr = error as Partial<HttpError>
        if (httpErr.response?.status === 401) {
            logger.error('API Key 无效或已过期，请检查 API Key 是否正确')
            const authError = new Error('API Key 无效，请检查设置中的 API Key') as Error & { code?: string; status?: number }
            authError.code = 'AUTH_FAILED'
            authError.status = 401
            throw authError
        }
        if (httpErr.response?.status === 403) {
            logger.error('API Key 权限不足，无法访问模型列表')
            const authError = new Error('API Key 权限不足') as Error & { code?: string; status?: number }
            authError.code = 'FORBIDDEN'
            authError.status = 403
            throw authError
        }
        if (httpErr.code === 'ECONNABORTED') {
            logger.error('请求超时，请检查网络连接')
        } else if (httpErr.response) {
            logger.error(`服务器错误: ${httpErr.response.status}`, httpErr.response.data)
        } else {
            logger.error('获取模型列表失败', error instanceof Error ? error.message : String(error))
        }
        return getFallbackModels(provider)
    }
}
function formatModelLabel (modelId: string): string {
    const parts = modelId.split('/')
    const name = parts[parts.length - 1]
    const labelMap: Record<string, string> = {
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
const FALLBACK_MODELS: Record<string, AIModelOption[]> = {
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
function getFallbackModels (provider = 'siliconflow'): AIModelOption[] {
    if (provider in FALLBACK_MODELS) return FALLBACK_MODELS[provider]
    // 预设提供商：返回各自默认模型
    const config = PROVIDER_CONFIGS[provider]
    if (!config) return FALLBACK_MODELS.siliconflow
    return [{ id: config.defaultModel, label: formatModelLabel(config.defaultModel) }]
}
export function clearModelCache (): void {
    cachedModels = null
    cachedModelsKey = ''
    lastFetchTime = 0
}
// ========== AI 服务基类 ==========
export class AIService {
    static #instance: AIService | null = null
    #logger = new LoggerService('AIService', { notify: false }) // 接口/网络瞬时失败：只进控制台，不弹通知条
    #initialized = false
    constructor () {
        if (AIService.#instance) {
            return AIService.#instance
        }
        AIService.#instance = this
    }
    static getInstance (): AIService {
        if (!this.#instance) {
            this.#instance = new AIService()
        }
        return this.#instance
    }
    async initialize (): Promise<void> {
        if (this.#initialized) return
        try {
            await ConfigService.initialize()
            this.#initialized = true
        } catch (error) {
            this.#logger.error('AIService初始化失败', error)
        }
    }
    async getModel (): Promise<string> {
        await this.initialize()
        const useCustomModel = await ConfigService.getValue('use_custom_model')
        if (useCustomModel) {
            const customModelId = await ConfigService.getValue('custom_model_id')
            if (customModelId) {
                return customModelId as string
            }
        }
        const provider = await this.getProvider()
        return ((await ConfigService.getValue('ai_model')) ||
               PROVIDER_CONFIGS[provider]?.defaultModel ||
               PROVIDER_CONFIGS.siliconflow.defaultModel) as string
    }
    async getApiKey (): Promise<string | null> {
        await this.initialize()
        const useCustomModel = await ConfigService.getValue('use_custom_model')
        if (useCustomModel) {
            // 注：原实现 `a || b` 对两个 Promise 恒取前者（Promise 恒为真值），显式 await 后行为一致
            return (await ConfigService.getValue('custom_model_api_key')) as string | null
        }
        return (await ConfigService.getValue('ai_apikey')) as string | null
    }
    async getProvider (): Promise<string> {
        await this.initialize()
        const useCustomModel = await ConfigService.getValue('use_custom_model')
        if (useCustomModel) {
            return 'custom'
        }
        return ((await ConfigService.getValue('ai_provider')) || 'siliconflow') as string
    }
    async getCustomBaseURL (): Promise<string> {
        await this.initialize()
        const useCustomModel = await ConfigService.getValue('use_custom_model')
        if (useCustomModel) {
            // 同 getApiKey：原实现取第一个 Promise 的值（既有行为）
            return (await ConfigService.getValue('custom_model_api_url')) as string
        }
        return ((await ConfigService.getValue('custom_base_url')) || '') as string
    }
    async identifyAdvertisementTimestamps (_subtitlesJsonString?: string): Promise<unknown[]> {
        throw new Error('子类必须实现identifyAdvertisementTimestamps方法')
    }
    async identifyAdvertisementSegments (subtitlesJsonString: string): Promise<unknown[]> {
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
    constructor (baseURL: string) {
        this.#baseURL = baseURL.replace(/\/$/, '')
    }
    /** 单条对话消息；返回内容与截断/推理诊断（「内容为空」时靠诊断定位根因） */
    async chat (apiKey: string, model: string, messages: Array<{ role: string; content: string }>, options: { thinking: boolean; maxTokens: number }): Promise<ChatResult> {
        const requestBody: {
            model: string
            messages: Array<{ role: string; content: string }>
            stream: boolean
            temperature: number
            max_tokens: number
            thinking?: { type: string }
            reasoning_effort?: string
        } = {
            model,
            messages,
            stream: false,
            // P1-4.6：收紧生成参数 —— 期望输出为 JSON 数组，限制长度并降低随机性以减少截断/格式漂移
            temperature: 0.1,
            max_tokens: options.maxTokens
        }
        // 思考型模型（自定义 deepseek）：推理与答案共用输出预算，调用方已据此放大预算
        if (options.thinking) {
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
            // 接口正常返回时结构固定；缺字段时与原实现一样在此处抛出（由上层重试/报错处理）
            const payload = response.data as {
                choices?: Array<{ message?: { content?: unknown; reasoning_content?: unknown }; finish_reason?: unknown }>
                usage?: Record<string, unknown>
            }
            const choice = payload.choices?.[0]
            const content = typeof choice?.message?.content === 'string' ? choice.message.content : ''
            const reasoningContent = typeof choice?.message?.reasoning_content === 'string' ? choice.message.reasoning_content : ''
            const toNumber = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
            // 推理 token 各家用名不同：SiliconFlow/DeepSeek 常见 completion_tokens_details.reasoning_tokens
            const details = (payload.usage?.completion_tokens_details ?? {}) as Record<string, unknown>
            return {
                content,
                finishReason: typeof choice?.finish_reason === 'string' ? choice.finish_reason : '',
                usage: payload.usage
                    ? {
                        prompt: toNumber(payload.usage.prompt_tokens),
                        completion: toNumber(payload.usage.completion_tokens),
                        reasoning: toNumber(details.reasoning_tokens ?? payload.usage.reasoning_tokens)
                    }
                    : null,
                reasoningChars: reasoningContent.length
            }
        } finally {
            if (currentRequestController === controller) currentRequestController = null
        }
    }
    handleError (status: number): string {
        const messages: Record<number, string> = {
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
    #adapter: OpenAIAdapter | null = null
    #adapterKey = ''
    async #getAdapter (): Promise<OpenAIAdapter> {
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
    async identifyAdvertisementTimestamps (subtitlesJsonString: string): Promise<Array<Record<string, unknown>>> {
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
        // 思考型模型：自定义提供商 + deepseek 系模型才注入 thinking/reasoning_effort（保持既有口径）
        const thinking = Boolean(useCustomModel && model.includes('deepseek'))
        try {
            const adapter = await this.#getAdapter()
            // 提示词优先取远程文件（改词无需用户更新脚本），拉不到则回退本地缓存/内置版本
            const { prompt: systemPrompt } = await resolveAdDetectionPrompt()
            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: subtitlesJsonString }
            ]
            const request = (maxTokens: number): Promise<ChatResult> => {
                const attempt = (): Promise<ChatResult> => adapter.chat(apiKey, model, messages, { thinking, maxTokens })
                // 网络/超时类失败按预算重试（原本只重试 1 次，网络差时容易整段识别失败）；
                // 用户主动取消与确定性失败（鉴权/参数错误）立即抛出，不浪费额度
                return withRetryBudget(attempt, {
                    budgetMs: AI_CHAT_RETRY_BUDGET_MS,
                    intervalMs: 1000,
                    shouldRetry: error => {
                        const httpErr = error as Partial<HttpError>
                        if (httpErr.code === 'ERR_CANCELED') return false
                        if (isRetryableRequestError(error)) return true
                        // 部分网关把超时表达成普通 Error（message 含 timeout），一并视为可重试
                        return String((error as { message?: string }).message || '').includes('timeout')
                    },
                    onRetry: ({ attempts, delayMs, error }) => {
                        this.#logger.warn(`广告识别请求失败，${delayMs}ms 后重试（第 ${attempts} 次重试）：` + ((error as { message?: string }).message || (error as Partial<HttpError>).code || 'unknown'))
                    },
                    onGiveUp: ({ attempts, error }) => {
                        this.#logger.warn(`广告识别请求重试已达时间预算（共重试 ${attempts} 次）：` + ((error as { message?: string }).message || (error as Partial<HttpError>).code || 'unknown'))
                    }
                })
            }
            let result = await request(initialResponseTokens(thinking))
            // 空响应且像是被输出预算吃满（截断 / 推理占满）：用更大预算重试一次再判失败
            if (!result.content.trim() && shouldRetryEmptyResponse(result)) {
                this.#logger.warn('AI响应为空（' + describeChatResult(result) + '），以更大输出预算重试一次')
                result = await request(retryResponseTokens(thinking))
            }
            let content = result.content
            // 检查响应是否为空
            if (!content || !content.trim()) {
                this.#logger.error('AI响应内容为空（' + describeChatResult(result) + '）')
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
            // 渐进式解析：原样 → 括号配平 → 格式修复 → 截断补全（见 parseJsonArrayLoose）
            let outcome = parseJsonArrayLoose(normalizedContent)
            let parsed = outcome.parsed
            let lastError = outcome.error
            // 解析不出来且本次是被 max_tokens 截断的：用更大预算重试一次（截断补全只是兜底，不该是常态）
            if (!parsed && isTruncatedByLength(result)) {
                this.#logger.warn('AI响应被输出上限截断（' + describeChatResult(result) + '），以更大输出预算重试一次')
                result = await request(retryResponseTokens(thinking))
                content = result.content
                if (content && content.trim()) {
                    outcome = parseJsonArrayLoose(String(content).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim())
                    parsed = outcome.parsed
                    lastError = outcome.error
                }
            }
            if (parsed) {
                this.#logger.debug('广告识别结果', parsed)
                return parsed
            }
            // 彻底失败时打印**完整**内容与真实报错位置，否则只截 200 字符根本看不出问题
            this.#logger.error(
                'AI响应JSON解析失败：' + ((lastError && lastError.message) || '未知错误'),
                '| ' + describeChatResult(result),
                '| 内容长度 ' + normalizedContent.length,
                '| 原始内容：', normalizedContent
            )
            return []
        } catch (error) {
            const httpErr = error as Partial<HttpError>
            if (httpErr.code === 'ERR_CANCELED') {
                this.#logger.info('广告识别已取消（用户中断）')
                return []
            }
            if (httpErr.response) {
                const adapter = await this.#getAdapter()
                const errorMessage = adapter.handleError(httpErr.response.status)
                this.#logger.error(errorMessage, error)
            } else {
                // 网络/超时类失败（已自动重试仍失败）：降噪为一次 warn，避免频繁刷错误堆栈
                this.#logger.warn('字幕分析失败（已重试）：' + ((error as { message?: string }).message || httpErr.code || error))
            }
            return []
        }
    }
}
// ========== 工厂方法 ==========
export const createAIService = async (): Promise<UnifiedAIService> => {
    await ConfigService.initialize()
    return new UnifiedAIService()
}
// ========== 导出默认实例 ==========
export let aiService: UnifiedAIService | undefined
export let aiServicePromise: Promise<UnifiedAIService> | null = null
export const initializeAIService = async (): Promise<UnifiedAIService> => {
    if (!aiServicePromise) {
        aiServicePromise = createAIService()
    }
    aiService = await aiServicePromise
    return aiService
}

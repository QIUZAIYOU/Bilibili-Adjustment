/**
 * AI 补全的「输出预算与空响应判定」（纯函数，零依赖 → 便于单测）
 *
 * 背景（2026-09-17 定位的真实故障）：3.31.0 的「性能优化」给请求加了 `max_tokens: 2048`
 * （此前**没有**这个上限，交给提供方默认值）。而思考型模型（自定义 deepseek 时会注入
 * `thinking: enabled` + `reasoning_effort: high`）把推理与答案算**同一个输出预算**：
 * 推理一超 2048，接口就返回 `finish_reason: "length"` 且 `message.content` 为空，
 * 于是既报「AI响应内容为空」，也必然识别不出任何广告段。
 *
 * 处理口径：
 * 1) 首答预算：思考型给足（推理+答案），普通模型保持原有 2048（不改变既有成本/延迟特征）；
 * 2) 只有「空响应且像被推理/截断吃满」或「被 length 截断导致解析失败」才重试一次，
 *    且重试预算更大 —— 即只在本来就会失败的路径上多花一次调用。
 */
/** 单次补全的结果（含截断/推理诊断信息，「内容为空」时靠它定位根因） */
export interface ChatResult {
    content: string
    /** 结束原因：`stop`（正常）/ `length`（被 max_tokens 截断）/ 其它 */
    finishReason: string
    /** token 用量（提供方可能不返回） */
    usage: { prompt: number; completion: number; reasoning: number } | null
    /** 推理内容字符数（思考型模型把预算耗在推理上时，content 会是空的） */
    reasoningChars: number
}
/** 普通模型的输出预算（与 3.31.0 起的既有行为一致） */
export const BASE_RESPONSE_TOKENS = 2048
/** 思考型模型的输出预算：推理与答案共用，必须给足，否则 content 为空 */
export const THINKING_RESPONSE_TOKENS = 8192
/** 重试时的输出预算（仅在首答已被截断/为空时使用） */
export const RETRY_RESPONSE_TOKENS = 16384
/** 首答输出预算 */
export const initialResponseTokens = (thinking: boolean): number =>
    thinking ? THINKING_RESPONSE_TOKENS : BASE_RESPONSE_TOKENS
/** 重试输出预算（比首答更大） */
export const retryResponseTokens = (thinking: boolean): number =>
    thinking ? RETRY_RESPONSE_TOKENS : BASE_RESPONSE_TOKENS * 2
/** 响应是否被输出预算截断 */
export const isTruncatedByLength = (result: ChatResult): boolean => result.finishReason === 'length'
/**
 * 空响应是否值得用更大预算重试：被 length 截断、或本次产生了推理内容（预算被推理吃掉）时才有救；
 * 提供方真的返回空（既没截断也没推理）时重试无意义，直接报错并打印诊断。
 */
export const shouldRetryEmptyResponse = (result: ChatResult): boolean =>
    isTruncatedByLength(result) || result.reasoningChars > 0
/** 把结果压成一行诊断信息（日志/通知里直接用，避免「内容为空」却不知道原因） */
export const describeChatResult = (result: ChatResult): string => {
    const usage = result.usage
        ? `用量 in ${result.usage.prompt} / out ${result.usage.completion}` +
          (result.usage.reasoning ? `（其中推理 ${result.usage.reasoning}）` : '')
        : '用量未返回'
    return `finish_reason=${result.finishReason || '未知'}、推理内容 ${result.reasoningChars} 字、${usage}`
}

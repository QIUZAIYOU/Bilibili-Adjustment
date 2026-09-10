/**
 * 轻量 HTTP 封装（P1-4.5 / P1-4.6）
 *
 * 替代 axios：统一超时（AbortController）、429/5xx 退避重试、错误形状归一。
 * 返回值与错误形状刻意与 axios 对齐（`response.data` / `error.response.status` / `error.code`），
 * 以便调用点无需改动即可从 axios 平滑切换。
 */
const DEFAULT_TIMEOUT = 30000
const DEFAULT_RETRY_DELAY = 800
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const buildError = (message, extra = {}) => {
    const error = new Error(message)
    Object.assign(error, extra)
    return error
}
/**
 * 发起请求
 * @param {string} url
 * @param {object} [options]
 * @param {string} [options.method] HTTP 方法，默认 GET
 * @param {object} [options.headers] 请求头
 * @param {string|object|null} [options.body] 请求体（对象会自动 JSON 化）
 * @param {number} [options.timeout] 超时（ms，默认 30s）
 * @param {number} [options.retries] 429/5xx 与网络错误的重试次数（默认 0）
 * @param {number} [options.retryDelay] 重试间隔（ms）
 * @param {AbortSignal} [options.signal] 外部取消信号
 * @param {'json'|'text'} [options.responseType] 响应解析方式，默认 json
 * @param {boolean} [options.withCredentials] 是否携带站点 Cookie（对齐 axios 同名选项）
 * @param {RequestCredentials} [options.credentials] 直接指定 fetch credentials
 * @returns {Promise<{data:any,status:number,headers:Headers}>}
 */
export const httpRequest = async (url, options = {}) => {
    const {
        method = 'GET',
        headers = {},
        body = null,
        timeout = DEFAULT_TIMEOUT,
        retries: retriesOption = 0,
        retryDelay = DEFAULT_RETRY_DELAY,
        signal = null,
        responseType = 'json',
        withCredentials = false,
        credentials = null
    } = options
    let retriesLeft = retriesOption
    const payload = body !== null && typeof body === 'object' ? JSON.stringify(body) : body
    const effectiveCredentials = credentials || (withCredentials ? 'include' : 'same-origin')
    for (;;) {
        const controller = new AbortController()
        const onExternalAbort = () => controller.abort()
        if (signal) {
            if (signal.aborted) controller.abort()
            else signal.addEventListener('abort', onExternalAbort, { once: true })
        }
        let timedOut = false
        const timer = setTimeout(() => {
            timedOut = true
            controller.abort()
        }, timeout)
        try {
            const response = await fetch(url, { method, headers, body: payload, signal: controller.signal, credentials: effectiveCredentials })
            const raw = await response.text()
            let data = raw
            if (responseType === 'json' && raw) {
                try {
                    data = JSON.parse(raw)
                } catch {
                    data = raw
                }
            } else if (responseType === 'json') {
                data = null
            }
            if (!response.ok) {
                const retriable = response.status === 429 || response.status >= 500
                if (retriable && retriesLeft > 0) {
                    retriesLeft--
                    await sleep(retryDelay)
                    continue
                }
                throw buildError(`请求失败: ${response.status}`, {
                    response: { status: response.status, data },
                    code: retriable ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST'
                })
            }
            return { data, status: response.status, headers: response.headers }
        } catch (error) {
            if (error.response) throw error
            if (signal?.aborted) {
                // 外部主动取消：不重试，直接抛出（供 UI 取消场景识别）
                throw buildError('请求已取消', { code: 'ERR_CANCELED' })
            }
            const isTimeout = timedOut && controller.signal.aborted
            if (retriesLeft > 0) {
                retriesLeft--
                await sleep(retryDelay)
                continue
            }
            throw buildError(isTimeout ? `请求超时（${timeout}ms）` : (error.message || '网络请求失败'), {
                code: isTimeout ? 'ECONNABORTED' : 'ERR_NETWORK'
            })
        } finally {
            clearTimeout(timer)
            signal?.removeEventListener?.('abort', onExternalAbort)
        }
    }
}
export const httpGet = (url, options = {}) => httpRequest(url, { ...options, method: 'GET' })
export const httpPost = (url, body, options = {}) => httpRequest(url, { ...options, method: 'POST', body })

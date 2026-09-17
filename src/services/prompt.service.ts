/**
 * 提示词解析服务：**远程文件优先 → 本地缓存 → 内置提示词**（三级兜底）
 *
 * 为什么要这样：
 * - 提示词是「配置」而非「代码」，改一次不该让所有用户更新脚本（产物里仍带内置版本用于兜底）；
 * - 远程文件与脚本产物同目录、同为 `.js` 扩展名，因而命中服务器既有的 `*.bilibili.com` CORS 白名单
 *   （内容其实是 JSON，按文本读取后自解析；扩展名只为借 CORS 规则，见 src/shared/remote-prompt.ts）；
 * - 识别流程对「提示词来自哪里」不敏感，但**排查时必须有据可查**，所以每次识别都会 debug 打印来源与哈希。
 *
 * 失败即降级，绝不抛错：拉取超时/404/CORS 失败/内容不完整时一律回退，保证识别始终可用。
 */
import { LoggerService } from '@/services/logger.service'
import { AD_DETECTION_PROMPT } from '@/shared/ad-detection-prompt'
import { parsePromptPayload, parseCachedPrompt, describePromptSource } from '@/shared/remote-prompt'
import type { PromptSource, RemotePromptPayload } from '@/shared/remote-prompt'
const logger = new LoggerService('PromptService', { notify: false })
/** 远程提示词文件（与 meta.js 同级的热更目录；扩展名 .js 以命中服务器的 CORS 规则） */
export const REMOTE_PROMPT_URL = 'https://www.asifadeaway.com/UserScripts/bilibili/hot-config/ad-detection-prompt.js'
/** 兼容路径：3.35.4 用户读的是旧位置，迁移期保留一份副本（下个大版本可移除） */
const LEGACY_PROMPT_URL = 'https://www.asifadeaway.com/UserScripts/bilibili/ad-detection-prompt.js'
/** 拉取超时：识别本身要几十秒，这里只等 3s，拉不到就用兜底，不拖慢识别 */
const FETCH_TIMEOUT_MS = 3000
const CACHE_KEY = 'adj-ad-prompt-v1'
/** 本次会话已解析出的提示词（同一会话只拉一次；提示词热更后刷新页面即生效） */
let sessionPrompt: { prompt: string, source: PromptSource, meta: RemotePromptPayload | null } | null = null
/** 读取本地缓存（仅当远程不可用时使用） */
const readCache = (): RemotePromptPayload | null => {
    try {
        const raw = localStorage.getItem(CACHE_KEY)
        const cached = raw ? parseCachedPrompt(raw) : null
        if (!cached) return null
        return cached
    } catch {
        return null
    }
}
/** 写入本地缓存（供下次远程失败时兜底） */
const writeCache = (payload: RemotePromptPayload): void => {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ ...payload, fetchedAt: Date.now() }))
    } catch { /* 隐私模式等场景写不进去：忽略，不影响本次使用 */ }
}
/** 拉取远程提示词（失败返回 null，绝不抛错） */
const fetchRemote = async (): Promise<RemotePromptPayload | null> => {
    for (const url of [REMOTE_PROMPT_URL, LEGACY_PROMPT_URL]) {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
        try {
            const response = await fetch(url, { signal: controller.signal, credentials: 'omit' })
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            const payload = parsePromptPayload(await response.text())
            if (!payload) throw new Error('远程提示词内容不完整或格式非法')
            if (url !== REMOTE_PROMPT_URL) logger.debug('提示词来自旧路径（迁移期兼容），新目录：' + REMOTE_PROMPT_URL)
            return payload
        } catch (error) {
            logger.debug(`远程提示词不可用（${url.includes('hot-config') ? 'hot-config' : '旧路径'}）：` + (error instanceof Error ? error.message : String(error)))
        } finally {
            clearTimeout(timer)
        }
    }
    return null
}
/**
 * 解析出本次识别应使用的系统提示词
 * @returns {Promise<{prompt: string, source: PromptSource}>} 一定返回可用提示词（最差为内置）
 */
export const resolveAdDetectionPrompt = async (): Promise<{ prompt: string, source: PromptSource }> => {
    if (sessionPrompt) return sessionPrompt
    const remote = await fetchRemote()
    if (remote) {
        writeCache(remote)
        sessionPrompt = { prompt: remote.prompt, source: 'remote', meta: remote }
    } else {
        const cached = readCache()
        sessionPrompt = cached
            ? { prompt: cached.prompt, source: 'cache', meta: cached }
            : { prompt: AD_DETECTION_PROMPT, source: 'embedded', meta: null }
    }
    logger.debug('广告识别提示词 ' + describePromptSource(sessionPrompt.source, sessionPrompt.meta, sessionPrompt.prompt.length))
    return { prompt: sessionPrompt.prompt, source: sessionPrompt.source }
}
/** 仅测试用：清空会话内缓存，让下次解析重新走网络/缓存分支 */
export const resetPromptCacheForTest = (): void => {
    sessionPrompt = null
}

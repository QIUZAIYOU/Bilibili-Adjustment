import { LoggerService } from '@/services/logger.service'
import { ConfigService } from '@/services/config.service'
import { eventBus } from '@/core/event-bus'
import { EVENT_NAMES } from '@/shared/constants'
import { openAdjustmentDialog } from '@/components/popover-dialog'
import { mountUpdateNoticePanel } from '@/ui/update'
import { parseUpdateItems } from '@/utils/update-items'
import type { UpdateItem } from '@/utils/update-items'
const logger = new LoggerService('UpdateService', { notify: false }) // 接口/网络瞬时失败：只进控制台，不弹通知条
export class UpdateService {
    static #cacheKey = 'latestScriptCache'
    static #proxyStatusKey = 'proxyStatus'
    static #updateCheckExecuted = false
    // 检查更新是否已经执行过
    static isUpdateCheckExecuted (): boolean {
        return this.#updateCheckExecuted
    }
    // 标记更新检查已执行
    static markUpdateCheckExecuted (): void {
        this.#updateCheckExecuted = true
    }
    // 智能代理选择
    #getProxyList (): string[] {
        const defaultProxies = [
            'https://qian.npkn.net/cors/?url=',
            'https://cors.aiideai-hq.workers.dev/?destination=',
            'https://api.allorigins.win/raw?url=',
            'https://cors.eu.org/',
            'https://cros2.aiideai-hq.workers.dev/?'
        ]
        // 尝试获取代理状态
        try {
            const proxyStatus = localStorage.getItem(UpdateService.#proxyStatusKey)
            if (proxyStatus) {
                const status: Record<string, { success: number; total: number; successRate: number }> = JSON.parse(proxyStatus)
                // 按成功率排序代理
                const sortedProxies = [...defaultProxies].sort((a, b) => {
                    const successRateA = status[a]?.successRate || 0
                    const successRateB = status[b]?.successRate || 0
                    return successRateB - successRateA
                })
                logger.debug('使用智能排序的代理列表:', sortedProxies)
                return sortedProxies
            }
        } catch (error) {
            logger.warn('获取代理状态失败，使用默认代理列表:', (error instanceof Error ? error.message : String(error)))
        }
        // 随机排序代理列表，避免总是从第一个开始
        return [...defaultProxies].sort(() => Math.random() - 0.5)
    }
    // 更新代理状态
    #updateProxyStatus (proxy: string, success: boolean): void {
        try {
            const proxyStatus = localStorage.getItem(UpdateService.#proxyStatusKey)
            const status: Record<string, { success: number; total: number; successRate: number }> = proxyStatus ? JSON.parse(proxyStatus) : {}
            if (!status[proxy]) {
                status[proxy] = { success: 0, total: 0, successRate: 0 }
            }
            status[proxy].total++
            if (success) {
                status[proxy].success++
            }
            status[proxy].successRate = status[proxy].success / status[proxy].total
            localStorage.setItem(UpdateService.#proxyStatusKey, JSON.stringify(status))
        } catch (error) {
            logger.warn('更新代理状态失败:', (error instanceof Error ? error.message : String(error)))
        }
    }
    // 带超时的fetch函数
    #fetchWithTimeout (url: string, options: RequestInit = {}, timeout = 30000): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), timeout)
            fetch(url, {
                ...options,
                signal: controller.signal
            })
                .then(response => {
                    clearTimeout(timeoutId)
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`)
                    }
                    return response.text()
                })
                .then(data => resolve(data))
                .catch(error => {
                    clearTimeout(timeoutId)
                    reject(error)
                })
        })
    }
    // 尝试通过代理获取脚本
    async #tryFetch (proxy: string, targetURL: string, retries = 2): Promise<string | undefined> {
        for (let i = 0; i < retries; i++) {
            try {
                const fullUrl = `${proxy}${targetURL}`
                logger.debug(`尝试通过代理 ${proxy} 获取脚本 (尝试 ${i + 1}/${retries})`)
                logger.debug(`完整请求URL: ${fullUrl}`)
                const data = await this.#fetchWithTimeout(fullUrl, {
                    headers: { 'X-Requested-With': 'XMLHttpRequest' }
                }, 30000)
                if (data && typeof data === 'string' && data.trim()) {
                    logger.debug(`代理 ${proxy} 请求成功`)
                    this.#updateProxyStatus(proxy, true)
                    return data
                } else {
                    throw new Error('返回的数据无效')
                }
            } catch (error) {
                const errorMsg = error instanceof Error && error.name === 'AbortError' ? '请求超时' : (error instanceof Error ? error.message : String(error))
                logger.warn(`代理 ${proxy}${targetURL} 请求失败 (${i + 1}/${retries}):`, errorMsg)
                if (i === retries - 1) {
                    this.#updateProxyStatus(proxy, false)
                    throw new Error(`代理请求失败: ${errorMsg}`)
                }
                // 指数退避
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)))
            }
        }
    }
    // 验证缓存
    #validateCache (cacheDuration: number): string | null {
        try {
            const cachedContent = localStorage.getItem(UpdateService.#cacheKey)
            if (!cachedContent) return null
            const parsed = JSON.parse(cachedContent)
            if (!parsed || typeof parsed !== 'object' || !parsed.data || !parsed.time) {
                localStorage.removeItem(UpdateService.#cacheKey) // 清除无效缓存
                return null
            }
            if (Date.now() - parsed.time < cacheDuration) {
                logger.info('使用缓存的脚本数据')
                return parsed.data
            }
            return null
        } catch (error) {
            logger.warn('缓存验证失败，清除无效缓存:', (error instanceof Error ? error.message : String(error)))
            localStorage.removeItem(UpdateService.#cacheKey)
            return null
        }
    }
    // 直连源列表（服务器配置 CORS 头后无需代理即可访问）
    #getDirectSources (): string[] {
        return [
            'https://www.asifadeaway.com/UserScripts/bilibili/bilibili-adjustment.meta.js'
        ]
    }
    // 并行请求多个 URL，返回第一个有效数据
    async #fetchFirstAvailable (urls: string[], timeout = 10000): Promise<string> {
        const results = await Promise.allSettled(urls.map(url => this.#fetchWithTimeout(url, {}, timeout)))
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value && typeof result.value === 'string' && result.value.trim()) {
                return result.value
            }
        }
        throw new Error('所有直连源均不可用')
    }
    // 从 GitHub 获取最新版本信息（raw.githubusercontent.com 无 API 匿名限流且自带 CORS，替代易 403 的 api.github.com）
    async #fetchGitHubPackageInfo (): Promise<{ version: string; updates: string }> {
        const url = 'https://raw.githubusercontent.com/QIUZAIYOU/Bilibili-Adjustment/main/package.json'
        const data = await this.#fetchWithTimeout(url, {}, 10000)
        if (!data) throw new Error('GitHub 获取 package.json 返回空数据')
        const pkg: { version?: string; updates?: string } = JSON.parse(data)
        if (!pkg.version) throw new Error('package.json 缺少版本号')
        return { version: pkg.version, updates: pkg.updates || '' }
    }
    // 保存脚本缓存
    #saveScriptCache (data: string): void {
        localStorage.setItem(UpdateService.#cacheKey, JSON.stringify({ data, time: Date.now() }))
    }
    // 获取最新脚本内容
    async fetchLatestScript (): Promise<string | null | undefined> {
        // 获取用户配置的更新检查频率
        let cacheDuration = 24 * 60 * 60 * 1000 // 默认24小时
        try {
            const updateCheckFrequency = await ConfigService.getValue('update_check_frequency')
            if (updateCheckFrequency && typeof updateCheckFrequency === 'number') {
                cacheDuration = updateCheckFrequency * 60 * 60 * 1000
            }
        } catch (error) {
            logger.warn('获取更新检查频率失败，使用默认值:', (error instanceof Error ? error.message : String(error)))
        }
        // 验证缓存
        const cachedData = this.#validateCache(cacheDuration)
        if (cachedData) {
            return cachedData
        }
        // 1. 直连自有域名（若服务器已配置 CORS 头则直接成功）
        try {
            const directData = await this.#fetchFirstAvailable(this.#getDirectSources())
            this.#saveScriptCache(directData)
            logger.info('直连获取最新脚本成功')
            return directData
        } catch (error) {
            logger.warn('直连获取最新脚本失败，改用 CORS 代理:', (error instanceof Error ? error.message : String(error)))
        }
        // 2. 公共 CORS 代理并行兜底（任一成功即返回，替代串行等待）
        const CORSProxyList = this.#getProxyList()
        const targetURL = encodeURIComponent('https://www.asifadeaway.com/UserScripts/bilibili/bilibili-adjustment.meta.js')
        const proxyResults = await Promise.allSettled(CORSProxyList.map(proxy => this.#tryFetch(proxy, targetURL, 1)))
        for (const result of proxyResults) {
            if (result.status === 'fulfilled' && result.value && typeof result.value === 'string' && result.value.trim()) {
                this.#saveScriptCache(result.value)
                logger.info('通过 CORS 代理获取最新脚本成功')
                return result.value
            }
        }
        // 3. 所有源失败，尝试使用缓存（即使过期）作为后备
        const expiredCache = localStorage.getItem(UpdateService.#cacheKey)
        if (expiredCache) {
            try {
                const parsed: { data?: string } | null = JSON.parse(expiredCache)
                if (parsed && parsed.data) {
                    logger.warn('所有更新源请求失败，使用过期缓存数据')
                    return parsed.data
                }
            } catch {
                // 忽略过期缓存解析错误
            }
        }
        throw new Error('所有更新源均不可用，且无可用缓存')
    }
    // 从脚本内容中提取版本号
    extractVersionFromScript (scriptContent: string): string | null {
        const versionMatch = scriptContent.match(/\/\/\s*@version\s*([\d.-]+)/)
        if (versionMatch && versionMatch[1]) {
            return versionMatch[1]
        }
        return null
    }
    // 从脚本内容中提取更新内容
    // 优先从脚本头部的 @updates 标签提取，其次从更新日志注释块提取
    extractChangelogFromScript (scriptContent: string): string {
        if (!scriptContent || typeof scriptContent !== 'string') {
            return ''
        }
        // 1. 尝试从 @updates 标签提取（脚本头部元数据）
        const updatesMatch = scriptContent.match(/\/\/\s*@updates\s+(.+)/)
        if (updatesMatch && updatesMatch[1]) {
            return updatesMatch[1].trim()
        }
        // 2. 尝试从 @update 标签提取（多行）
        const updateMatch = scriptContent.match(/\/\/\s*@update\s*([\s\S]*?)(?:\/\/\s*@|$)/)
        if (updateMatch && updateMatch[1]) {
            return updateMatch[1].trim()
        }
        // 3. 尝试从 @changelog 标签提取
        const changelogMatch = scriptContent.match(/\/\/\s*@changelog\s*([\s\S]*?)(?:\/\/\s*@|$)/)
        if (changelogMatch && changelogMatch[1]) {
            return changelogMatch[1].trim()
        }
        // 4. 尝试从注释块中提取更新日志
        const commentBlockMatch = scriptContent.match(/\/\*[\s\S]*?(?:更新日志|changelog)[\s\S]*?\*\//i)
        if (commentBlockMatch) {
            return commentBlockMatch[0]
                .replace(/\/\*|\*\//g, '')
                .replace(/(?:更新日志|changelog)/i, '')
                .trim()
        }
        return ''
    }
    // 比较版本号
    // 返回 true 表示 latest > current（有新版本）
    compareVersions (current: string, latest: string): boolean {
        const parseVersion = (version: string): { coreParts: number[]; preParts: Array<number | string> } => {
            const [core, pre] = version.split('-')
            const coreParts = core.split('.').map(part => parseInt(part, 10) || 0)
            const preParts = pre ? pre.split('.').map(part => {
                const num = parseInt(part, 10)
                return isNaN(num) ? part.toLowerCase() : num
            }) : []
            return { coreParts, preParts }
        }
        const curr = parseVersion(current)
        const last = parseVersion(latest)
        // 比较核心版本号
        for (let i = 0; i < Math.max(curr.coreParts.length, last.coreParts.length); i++) {
            const currPart = curr.coreParts[i] || 0
            const lastPart = last.coreParts[i] || 0
            if (lastPart > currPart) return true
            if (lastPart < currPart) return false
        }
        // 核心版本号相同，比较预发布版本
        // 没有预发布版本的版本比有预发布版本的版本更新
        if (curr.preParts.length && !last.preParts.length) return false
        if (!curr.preParts.length && last.preParts.length) return true
        // 比较预发布版本部分
        for (let i = 0; i < Math.max(curr.preParts.length, last.preParts.length); i++) {
            const currPart = curr.preParts[i] || 0
            const lastPart = last.preParts[i] || 0
            if (typeof currPart !== typeof lastPart) {
                // 数字比字符串小
                return typeof lastPart === 'number' ? false : true
            }
            // 同类型才会走到这里（不同类型已在上方返回），断言后比较与原实现的 JS 比较语义一致
            if ((lastPart as number) > (currPart as number)) return true
            if ((lastPart as number) < (currPart as number)) return false
        }
        return false
    }
    /**
     * 显示更新弹窗。内容区改由 Vue 面板（UpdateNoticePanel.vue）渲染并经懒加载挂载，
     * 弹窗外壳/标题/按钮/a11y 仍由 openAdjustmentDialog 提供，class 契约保持不变，
     * 故 src/shared/styles/index.js 中的更新弹窗样式无需改动。
     */
    #showUpdatePopover (currentVersion: string, latestVersion: string, updateItems: UpdateItem[], options: { isLatest?: boolean } = {}): void {
        // isLatest：手动检查「已是最新版本」时的反馈弹窗（不展示更新列表，也不需要「更新」按钮）
        const isLatest = options.isLatest === true
        openAdjustmentDialog({
            key: 'update-notice',
            title: isLatest ? '哔哩哔哩调整 · 已是最新版本' : '哔哩哔哩调整 · 有新版本',
            subtitle: isLatest ? '（当前已是最新版本，无需更新）' : '（点击更新按钮安装最新版）',
            className: 'update-dialog',
            content: (body: HTMLElement) => {
                const holder = document.createElement('div')
                body.appendChild(holder)
                let handle: Awaited<ReturnType<typeof mountUpdateNoticePanel>> | null = null
                let disposed = false
                // 面板懒加载：加载完成后挂载；若期间弹窗已关闭则立即卸载，避免实例泄漏
                mountUpdateNoticePanel(holder, { currentVersion, latestVersion, items: updateItems, isLatest })
                    .then(created => {
                        if (disposed) created.unmount()
                        else handle = created
                    })
                    .catch(error => {
                        logger.error('更新提示｜面板加载失败', error)
                    })
                return () => {
                    disposed = true
                    if (handle) {
                        handle.unmount()
                        handle = null
                    }
                    holder.remove()
                }
            },
            actions: isLatest
                ? [{ text: '关闭', type: 'info', onClick: (d: { close: () => void }) => d.close() }]
                : [
                    { text: '关闭', type: 'info', onClick: (d: { close: () => void }) => d.close() },
                    {
                        text: '更新',
                        type: 'primary',
                        onClick: (d: { close: () => void }) => {
                            window.open('//www.asifadeaway.com/UserScripts/bilibili/bilibili-adjustment.user.js', '_blank')
                            d.close()
                        }
                    }
                ]
        })
    }
    // 获取最新版本信息：GitHub 优先，失败回退脚本内容提取
    async #fetchLatestVersionInfo (): Promise<{ latestVersion: string; latestUpdates: string }> {
        try {
            const pkgInfo = await this.#fetchGitHubPackageInfo()
            logger.debug('通过 GitHub API 获取最新版本信息:', pkgInfo.version)
            return { latestVersion: pkgInfo.version, latestUpdates: pkgInfo.updates }
        } catch (error) {
            logger.warn('GitHub 获取最新版本信息失败，改用脚本内容提取:', (error instanceof Error ? error.message : String(error)))
        }
        const scriptContent = await this.fetchLatestScript()
        if (!scriptContent) throw new Error('未获取到最新脚本内容')
        const latestVersion = this.extractVersionFromScript(scriptContent)
        if (!latestVersion) throw new Error('从最新脚本中提取版本号失败')
        return { latestVersion, latestUpdates: this.extractChangelogFromScript(scriptContent) }
    }
    // 手动检查更新（点击设置弹窗版本号触发）：绕过防重复标记与跳过更新设置，结果由返回值提供
    async checkForUpdatesManually (currentVersion: string, localUpdates?: string): Promise<{ type: 'latest' | 'update' | 'error'; latestVersion?: string }> {
        try {
            const { latestVersion, latestUpdates } = await this.#fetchLatestVersionInfo()
            if (!this.compareVersions(currentVersion, latestVersion)) {
                logger.info(`检查更新丨当前 v${currentVersion} 已是最新版本（远程 v${latestVersion}）`)
                // 已是最新：清掉版本号处的「有新版本」提示（用户可能早已手动更新过）
                this.#setPendingUpdateVersion('')
                // 手动检查同样弹出反馈弹窗（与「发现新版本」的反馈保持一致）
                this.#showUpdatePopover(currentVersion, latestVersion, [], { isLatest: true })
                return { type: 'latest', latestVersion }
            }
            logger.info(`检查更新丨发现新版本 v${latestVersion}（当前 v${currentVersion}）`)
            // 用户已看到该版本详情，但未必立即更新：保留版本号处提示，方便稍后处理
            this.#setPendingUpdateVersion(latestVersion)
            const updateItems = parseUpdateItems(latestUpdates || localUpdates)
            this.#showUpdatePopover(currentVersion, latestVersion, updateItems)
            return { type: 'update', latestVersion }
        } catch (error) {
            logger.error('手动检查更新失败:', (error instanceof Error ? error.message : String(error)))
            return { type: 'error' }
        }
    }
    // 检查更新
    async checkForUpdates (currentVersion: string, localUpdates?: string): Promise<void> {
        // 每次页面会话只检查一次（避免 SPA 导航重复触发代理请求）
        if (UpdateService.#updateCheckExecuted) {
            logger.debug('更新检查已执行过，跳过')
            return
        }
        UpdateService.#updateCheckExecuted = true
        try {
            const { latestVersion, latestUpdates } = await this.#fetchLatestVersionInfo()
            if (!this.compareVersions(currentVersion, latestVersion)) {
                logger.debug(`检查更新丨当前 v${currentVersion} 已是最新版本（远程 v${latestVersion}）`)
                this.#setPendingUpdateVersion('')
                return
            }
            logger.info(`检查更新丨发现新版本 v${latestVersion}（当前 v${currentVersion}）`)
            // 无论哪种模式都把「有新版本」暴露给设置面板：手动模式唯一的提示途径就是版本号处
            this.#setPendingUpdateVersion(latestVersion)
            if (await this.#getUpdateMode() === 'manual') {
                logger.info(`更新方式为「手动」：v${latestVersion} 仅在设置面板版本号处提示，不弹窗`)
                return
            }
            // 自动模式：同一新版本只弹一次。版本号处会一直提示，所以不会漏提醒（issue #27）
            if (UpdateService.#getLastNotifiedVersion() === latestVersion) {
                logger.debug(`新版本 v${latestVersion} 已弹窗提示过，仅保留版本号处提示`)
                return
            }
            UpdateService.#setLastNotifiedVersion(latestVersion)
            this.#showUpdatePopover(currentVersion, latestVersion, parseUpdateItems(latestUpdates || localUpdates))
        } catch (error) {
            // 自动检查失败静默处理：用户没有主动请求，不该被打扰（需要手动反馈时用户会点版本号）
            logger.warn('检查更新失败（已忽略，不影响使用）:', (error instanceof Error ? error.message : String(error)))
        }
    }
    /** 更新方式：manual = 不弹窗、只在版本号处提示；其余（含历史脏值）一律按 auto */
    async #getUpdateMode (): Promise<'auto' | 'manual'> {
        try {
            return await ConfigService.getValue('update_mode') === 'manual' ? 'manual' : 'auto'
        } catch (error) {
            logger.warn('读取更新方式失败，按「自动」处理:', (error instanceof Error ? error.message : String(error)))
            return 'auto'
        }
    }
    /** 已发现但用户尚未更新到的版本（空串 = 无）；设置面板据此在版本号处常驻提示 */
    static #pendingUpdateVersion = ''
    getPendingUpdateVersion (): string {
        return UpdateService.#pendingUpdateVersion
    }
    #setPendingUpdateVersion (version: string): void {
        if (UpdateService.#pendingUpdateVersion === version) return
        UpdateService.#pendingUpdateVersion = version
        eventBus.emit(EVENT_NAMES.UPDATE_AVAILABLE, { version })
    }
    /** 上次已弹窗提示过的新版本号（localStorage，跨会话持久）：同一版本不重复弹窗 */
    static #lastNotifiedVersionKey = 'bili-adjustment-last-notified-version'
    static #lastNotifiedVersion: string | null = null
    static #getLastNotifiedVersion (): string {
        if (UpdateService.#lastNotifiedVersion === null) {
            try {
                UpdateService.#lastNotifiedVersion = localStorage.getItem(UpdateService.#lastNotifiedVersionKey) || ''
            } catch {
                UpdateService.#lastNotifiedVersion = ''
            }
        }
        return UpdateService.#lastNotifiedVersion
    }
    static #setLastNotifiedVersion (version: string): void {
        UpdateService.#lastNotifiedVersion = version
        try {
            localStorage.setItem(UpdateService.#lastNotifiedVersionKey, version)
        } catch { /* localStorage 不可用时仅本次会话内生效 */ }
    }
}
export const updateService = new UpdateService()

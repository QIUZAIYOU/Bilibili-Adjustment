import { LoggerService } from '@/services/logger.service'
import { ConfigService } from '@/services/config.service'
import { eventBus } from '@/core/event-bus'
import { EVENT_NAMES } from '@/shared/constants'
import { BUILD_SHA } from '@/shared/build-info'
import { openAdjustmentDialog } from '@/components/popover-dialog'
import { mountUpdateNoticePanel } from '@/ui/update'
import { parseUpdateItems } from '@/utils/update-items'
import { isFeatureLevelUpdate, isSameVersionRebuild, parseScriptMetaInfo, parsePackageInfo, parseGiteeContentsInfo } from '@/utils/update-policy'
import type { UpdateItem } from '@/utils/update-items'
const logger = new LoggerService('UpdateService', { notify: false }) // 接口/网络瞬时失败：只进控制台，不弹通知条
/**
 * 更新检查源（**不再使用任何 CORS 代理**，全部直连）。
 *
 * 三个源都经过真实浏览器实测（页面内 fetch）：
 * - 自有服务器 meta.js：CORS 头写死 `https://www.bilibili.com`，故只在 www 域可用；一份文件含
 *   version + updates + `@build-sha`（**唯一能提供构建标识的源**，同版本覆盖发布检测靠它）；
 * - GitHub raw package.json：`Access-Control-Allow-Origin: *`，任何域可用，但国内可能不可达；
 * - Gitee API contents：`Access-Control-Allow-Origin: *` 且国内可达，作为 GitHub 的兜底。
 *   注意必须走 API 而**不是** Gitee raw —— raw 既不返回 ACAO（浏览器读不到），也以 text/plain 返回
 *   .js（`<script>` 标签同样被 MIME 检查拦下）；公开仓库读 API 无需 token，
 *   个人 token 绝不能进用户脚本（脚本是明文分发的）。
 */
const META_JS_URL = 'https://www.asifadeaway.com/UserScripts/bilibili/bilibili-adjustment.meta.js'
const GITHUB_PACKAGE_URL = 'https://raw.githubusercontent.com/QIUZAIYOU/Bilibili-Adjustment/main/package.json'
const GITEE_CONTENTS_URL = 'https://gitee.com/api/v5/repos/aiideai/Bilibili-Adjustment/contents/package.json'
export class UpdateService {
    static #updateCheckExecuted = false
    // 检查更新是否已经执行过
    static isUpdateCheckExecuted (): boolean {
        return this.#updateCheckExecuted
    }
    // 标记更新检查已执行
    static markUpdateCheckExecuted (): void {
        this.#updateCheckExecuted = true
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
    /** ① 自有服务器 meta.js：version + updates + 构建标识（唯一提供 sha 的源） */
    async #fetchScriptMeta (): Promise<{ version: string; updates: string; sha: string }> {
        const text = await this.#fetchWithTimeout(META_JS_URL, {}, 10000)
        const info = parseScriptMetaInfo(text)
        if (!info) throw new Error('meta.js 内容无法解析出版本号')
        logger.debug('自有服务器 meta.js 解析成功:', info.version)
        return { version: info.version, updates: info.updates, sha: info.sha }
    }
    /** ② GitHub raw package.json（CORS `*`，国内可能不可达） */
    async #fetchGitHubPackageInfo (): Promise<{ version: string; updates: string }> {
        const text = await this.#fetchWithTimeout(GITHUB_PACKAGE_URL, {}, 10000)
        const info = parsePackageInfo(text)
        if (!info) throw new Error('GitHub package.json 内容无法解析')
        return info
    }
    /** ③ Gitee API contents（CORS `*` 且国内可达）：作为 GitHub 不可达时的兜底 */
    async #fetchGiteePackageInfo (): Promise<{ version: string; updates: string }> {
        const text = await this.#fetchWithTimeout(GITEE_CONTENTS_URL, {}, 10000)
        const info = parseGiteeContentsInfo(text)
        if (!info) throw new Error('Gitee API 内容无法解析')
        return info
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
    #showUpdatePopover (currentVersion: string, latestVersion: string, updateItems: UpdateItem[], options: { isLatest?: boolean; rebuilt?: boolean } = {}): void {
        // isLatest：手动检查「已是最新版本」时的反馈弹窗（不展示更新列表，也不需要「更新」按钮）
        const isLatest = options.isLatest === true
        // rebuilt：版本号未变、但线上内容已更新（同版本覆盖发布）——只能重新安装，没有更新日志
        const rebuilt = options.rebuilt === true
        openAdjustmentDialog({
            key: 'update-notice',
            title: rebuilt ? '哔哩哔哩调整 · 内容已更新' : (isLatest ? '哔哩哔哩调整 · 已是最新版本' : '哔哩哔哩调整 · 有新版本'),
            subtitle: rebuilt ? '（版本号未变但服务器内容已更新，点击重新安装）' : (isLatest ? '（当前已是最新版本，无需更新）' : '（点击更新按钮安装最新版）'),
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
                        text: rebuilt ? '重新安装' : '更新',
                        type: 'primary',
                        onClick: (d: { close: () => void }) => {
                            window.open('//www.asifadeaway.com/UserScripts/bilibili/bilibili-adjustment.user.js', '_blank')
                            d.close()
                        }
                    }
                ]
        })
    }
    /**
     * 获取最新版本信息：按 ① 自有 meta.js → ② GitHub raw → ③ Gitee API 顺序取第一个可用源。
     *
     * 顺序而非并行：① 是权威源且唯一带构建标识，正常情况一次请求就够；只有它不可用时才走镜像，
     * 避免每次会话都去打第三方（顺带把第三方限流风险降到最低）。镜像没有构建标识 → latestSha 为空，
     * 「同版本覆盖发布」检测自然跳过（该信号只在权威源可用时有意义）。
     * @returns {Promise<{latestVersion: string, latestUpdates: string, latestSha: string}>}
     */
    async #fetchLatestVersionInfo (): Promise<{ latestVersion: string; latestUpdates: string; latestSha: string }> {
        try {
            const meta = await this.#fetchScriptMeta()
            return { latestVersion: meta.version, latestUpdates: meta.updates, latestSha: meta.sha }
        } catch (error) {
            logger.warn('自有服务器 meta.js 获取失败，改用 GitHub:', (error instanceof Error ? error.message : String(error)))
        }
        try {
            const pkgInfo = await this.#fetchGitHubPackageInfo()
            logger.debug('通过 GitHub raw 获取最新版本信息:', pkgInfo.version)
            return { latestVersion: pkgInfo.version, latestUpdates: pkgInfo.updates, latestSha: '' }
        } catch (error) {
            logger.warn('GitHub 获取最新版本信息失败，改用 Gitee:', (error instanceof Error ? error.message : String(error)))
        }
        const giteeInfo = await this.#fetchGiteePackageInfo()
        logger.debug('通过 Gitee API 获取最新版本信息:', giteeInfo.version)
        return { latestVersion: giteeInfo.version, latestUpdates: giteeInfo.updates, latestSha: '' }
    }
    /** 同版本覆盖发布检测：本地构建标识与线上发布标识不一致 → 需要提示用户重新安装 */
    #detectSameVersionRebuild (remoteSha: string): boolean {
        return isSameVersionRebuild(BUILD_SHA, remoteSha)
    }
    // 手动检查更新（点击设置弹窗版本号触发）：绕过防重复标记与跳过更新设置，结果由返回值提供
    async checkForUpdatesManually (currentVersion: string, localUpdates?: string): Promise<{ type: 'latest' | 'update' | 'rebuilt' | 'error'; latestVersion?: string }> {
        try {
            const { latestVersion, latestUpdates, latestSha } = await this.#fetchLatestVersionInfo()
            if (!this.compareVersions(currentVersion, latestVersion)) {
                // 版本号相同但线上构建标识不同：服务器文件被「同版本覆盖发布」过（如应急修复）
                if (this.#detectSameVersionRebuild(latestSha)) {
                    logger.info(`检查更新丨v${currentVersion} 线上内容已更新（本地 ${BUILD_SHA} → 线上 ${latestSha}）`)
                    this.#setPendingRebuild({ version: currentVersion, sha: latestSha })
                    this.#showUpdatePopover(currentVersion, latestVersion, [], { rebuilt: true })
                    return { type: 'rebuilt', latestVersion }
                }
                logger.info(`检查更新丨当前 v${currentVersion} 已是最新版本（远程 v${latestVersion}）`)
                // 已是最新：清掉版本号处的提示（用户可能早已手动更新过）
                this.#setPendingUpdateVersion('')
                this.#setPendingRebuild(null)
                // 手动检查同样弹出反馈弹窗（与「发现新版本」的反馈保持一致）
                this.#showUpdatePopover(currentVersion, latestVersion, [], { isLatest: true })
                return { type: 'latest', latestVersion }
            }
            logger.info(`检查更新丨发现新版本 v${latestVersion}（当前 v${currentVersion}）`)
            // 用户已看到该版本详情，但未必立即更新：保留版本号处提示，方便稍后处理
            this.#setPendingRebuild(null)
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
            const { latestVersion, latestUpdates, latestSha } = await this.#fetchLatestVersionInfo()
            if (!this.compareVersions(currentVersion, latestVersion)) {
                // 版本号没变，但线上构建标识变了 = 服务器文件被「同版本覆盖发布」过。
                // 此时版本号比对恒为「已是最新」，只能靠构建标识让用户知道要重新安装。
                if (this.#detectSameVersionRebuild(latestSha)) {
                    logger.info(`检查更新丨v${currentVersion} 线上内容已更新（本地 ${BUILD_SHA} → 线上 ${latestSha}），仅提示不弹窗`)
                    this.#setPendingRebuild({ version: currentVersion, sha: latestSha })
                    return
                }
                logger.debug(`检查更新丨当前 v${currentVersion} 已是最新版本（远程 v${latestVersion}）`)
                this.#setPendingUpdateVersion('')
                this.#setPendingRebuild(null)
                return
            }
            // 版本号变了：清掉「同版本内容已更新」状态（已被真正的版本更新取代）
            this.#setPendingRebuild(null)
            logger.info(`检查更新丨发现新版本 v${latestVersion}（当前 v${currentVersion}）`)
            // 无论哪种模式都把「有新版本」暴露给设置面板：手动模式唯一的提示途径就是版本号处
            this.#setPendingUpdateVersion(latestVersion)
            const mode = await this.#getUpdateMode()
            if (mode === 'manual') {
                logger.info(`更新方式为「手动」：v${latestVersion} 仅在设置面板版本号处提示，不弹窗`)
                return
            }
            // 补丁级（Y 位）更新不弹窗：小修复不该反复打断用户，只在版本号处常驻提示
            if (!isFeatureLevelUpdate(currentVersion, latestVersion)) {
                logger.info(`v${latestVersion} 属补丁级更新，仅在版本号处提示，不弹窗`)
                return
            }
            // 自动模式：同一「更新方式 + 版本」只弹一次。去重键带上方式，用户在设置里把
            // 更新方式切到「自动」后，同一版本会重新弹一次（符合"选了自动就该看到弹窗"的直觉）。
            // 版本号处始终提示，所以不会漏提醒（issue #27）。
            const notifyKey = mode + ':' + latestVersion
            if (UpdateService.#getLastNotifiedVersion() === notifyKey) {
                logger.debug(`新版本 v${latestVersion} 已弹窗提示过，仅保留版本号处提示`)
                return
            }
            // 必须在弹窗真正显示之后才记录：否则弹窗构造失败也会被标记为「已提示」，
            // 导致之后永远不再弹窗（只剩版本号处提示）。
            try {
                this.#showUpdatePopover(currentVersion, latestVersion, parseUpdateItems(latestUpdates || localUpdates))
                UpdateService.#setLastNotifiedVersion(notifyKey)
            } catch (error) {
                logger.error('显示更新弹窗失败，本次不记录已提示:', (error instanceof Error ? error.message : String(error)))
            }
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
    /**
     * 同版本覆盖发布（版本号没变、线上内容变了）：设置面板据此在版本号处提示「内容已更新」。
     * 与 #pendingUpdateVersion 互斥展示，两者都为真时以「有新版本」优先。
     */
    static #pendingRebuild: { version: string; sha: string } | null = null
    getPendingRebuild (): { version: string; sha: string } | null {
        return UpdateService.#pendingRebuild
    }
    #setPendingRebuild (next: { version: string; sha: string } | null): void {
        const current = UpdateService.#pendingRebuild
        const same = (current === null && next === null) || (current !== null && next !== null && current.version === next.version && current.sha === next.sha)
        if (same) return
        UpdateService.#pendingRebuild = next
        eventBus.emit(EVENT_NAMES.UPDATE_AVAILABLE, { version: next?.version ?? '' })
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

import { LoggerService } from '@/services/logger.service'
import { ConfigService } from '@/services/config.service'
import { createElementAndInsert } from '@/utils/common'
import { getTemplates } from '@/shared/templates'

const logger = new LoggerService('UpdateService')

export class UpdateService {
    static #cacheKey = 'latestScriptCache'
    static #proxyStatusKey = 'proxyStatus'
    static #updateCheckExecuted = false
    
    // 检查更新是否已经执行过
    static isUpdateCheckExecuted() {
        return this.#updateCheckExecuted
    }
    
    // 标记更新检查已执行
    static markUpdateCheckExecuted() {
        this.#updateCheckExecuted = true
    }
    
    // 智能代理选择
    #getProxyList() {
        const defaultProxies = [
            'https://qian.npkn.net/cors/?url=',
            'https://cors.aiideai-hq.workers.dev/?destination=',
            'https://api.allorigins.win/raw?url=',
            'https://api.codetabs.com/v1/proxy?quest=',
            'https://thingproxy.freeboard.io/fetch/',
            'https://cros2.aiideai-hq.workers.dev/?'
        ]
        
        // 尝试获取代理状态
        try {
            const proxyStatus = localStorage.getItem(UpdateService.#proxyStatusKey)
            if (proxyStatus) {
                const status = JSON.parse(proxyStatus)
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
            logger.warn('获取代理状态失败，使用默认代理列表:', error.message)
        }
        
        // 随机排序代理列表，避免总是从第一个开始
        return [...defaultProxies].sort(() => Math.random() - 0.5)
    }
    
    // 更新代理状态
    #updateProxyStatus(proxy, success) {
        try {
            const proxyStatus = localStorage.getItem(UpdateService.#proxyStatusKey)
            const status = proxyStatus ? JSON.parse(proxyStatus) : {}
            
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
            logger.warn('更新代理状态失败:', error.message)
        }
    }
    
    // 带超时的fetch函数
    #fetchWithTimeout(url, options = {}, timeout = 30000) {
        return new Promise((resolve, reject) => {
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
    async #tryFetch(proxy, targetURL, retries = 2) {
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
                const errorMsg = error.name === 'AbortError' ? '请求超时' : error.message
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
    #validateCache(cacheDuration) {
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
            logger.warn('缓存验证失败，清除无效缓存:', error.message)
            localStorage.removeItem(UpdateService.#cacheKey)
            return null
        }
    }
    
    // 获取最新脚本
    async fetchLatestScript() {
        // 获取用户配置的更新检查频率
        let cacheDuration = 24 * 60 * 60 * 1000 // 默认24小时
        try {
            const updateCheckFrequency = await ConfigService.getValue('update_check_frequency')
            if (updateCheckFrequency && typeof updateCheckFrequency === 'number') {
                cacheDuration = updateCheckFrequency * 60 * 60 * 1000
            }
        } catch (error) {
            logger.warn('获取更新检查频率失败，使用默认值:', error.message)
        }
        
        // 验证缓存
        const cachedData = this.#validateCache(cacheDuration)
        if (cachedData) {
            return cachedData
        }
        
        const CORSProxyList = this.#getProxyList()
        const targetURL = encodeURIComponent('https://www.asifadeaway.com/UserScripts/bilibili/bilibili-adjustment.meta.js')
        
        // 尝试通过代理获取脚本
        for (const proxy of CORSProxyList) {
            try {
                const data = await this.#tryFetch(proxy, targetURL)
                // 验证获取的数据是否有效
                if (data && typeof data === 'string' && data.trim()) {
                    // 保存到缓存
                    localStorage.setItem(UpdateService.#cacheKey, JSON.stringify({
                        data,
                        time: Date.now()
                    }))
                    return data
                }
            } catch (error) {
                logger.warn(`代理 ${proxy}${targetURL} 处理失败 丨`, error.message)
                // 继续尝试下一个代理
            }
        }
        
        // 如果所有代理都失败，尝试使用缓存（即使过期）作为后备
        const expiredCache = localStorage.getItem(UpdateService.#cacheKey)
        if (expiredCache) {
            try {
                const parsed = JSON.parse(expiredCache)
                if (parsed && parsed.data) {
                    logger.warn('所有代理请求失败，使用过期缓存数据')
                    return parsed.data
                }
            } catch {
                // 忽略过期缓存解析错误
            }
        }
        
        throw new Error('所有CORS代理均不可用，且无可用缓存')
    }
    
    // 从脚本内容中提取版本号
    extractVersionFromScript(scriptContent) {
        const versionMatch = scriptContent.match(/\/\/\s*@version\s*([\d.-]+)/)
        if (versionMatch && versionMatch[1]) {
            return versionMatch[1]
        }
        return null
    }
    
    // 从脚本内容中提取更新内容
    extractChangelogFromScript(scriptContent) {
        // 尝试从 @update 或 @changelog 标签中提取更新内容
        const updateMatch = scriptContent.match(/\/\/\s*@update\s*([\s\S]*?)(?:\/\/\s*@|$)/)
        if (updateMatch && updateMatch[1]) {
            return updateMatch[1].trim()
        }
        const changelogMatch = scriptContent.match(/\/\/\s*@changelog\s*([\s\S]*?)(?:\/\/\s*@|$)/)
        if (changelogMatch && changelogMatch[1]) {
            return changelogMatch[1].trim()
        }
        // 尝试从注释块中提取更新内容
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
    compareVersions(current, latest) {
        const parseVersion = version => {
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
            if (lastPart > currPart) return true
            if (lastPart < currPart) return false
        }
        return false
    }
    
    // 生成更新内容列表
    generateUpdateList(changelog) {
        if (!changelog) return ''
        // 如果是字符串，尝试解析为列表
        if (typeof changelog === 'string') {
            // 按分号分割
            const items = changelog
                .split(';')
                .map(item => item.trim())
                .filter(item => item)
            return `
                <ol class="adjustment-update-contents">
                    ${items.map(item => `<li>${item}</li>`).join('')}
                </ol>
            `.replace(/\n\s+/g, '').trim()
        }
        // 如果是数组，直接生成列表
        if (Array.isArray(changelog)) {
            return `
                <ol class="adjustment-update-contents">
                    ${changelog.map(item => `<li>${item}</li>`).join('')}
                </ol>
            `.replace(/\n\s+/g, '').trim()
        }
        return ''
    }
    
    // 显示更新弹窗
    #showUpdatePopover(currentVersion, latestVersion, updateContentsHtml) {
        const updatePopover = createElementAndInsert(getTemplates.replace('update', {
            current: currentVersion,
            latest: latestVersion,
            contents: updateContentsHtml
        }), document.body, 'append')
        updatePopover.showPopover()
        const updateButton = updatePopover.querySelector('.adjustment-button-update')
        const closeButton = updatePopover.querySelector('.adjustment-button-close')
        updateButton.addEventListener('click', () => {
            updatePopover.hidePopover()
            window.open('//www.asifadeaway.com/UserScripts/bilibili/bilibili-adjustment.user.js', '_blank')
        })
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                updatePopover.hidePopover()
            })
        }
        // 30秒后自动关闭弹窗
        setTimeout(() => {
            updatePopover.hidePopover()
        }, 30000)
    }
    
    // 检查更新
    async checkForUpdates(currentVersion, localUpdates) {
        // 检查是否需要跳过更新检查
        try {
            const skipUpdateCheck = await ConfigService.getValue('skip_update_check')
            if (skipUpdateCheck) {
                logger.info('用户已设置跳过更新检查')
                return
            }
        } catch (error) {
            logger.warn('获取跳过更新检查设置失败，继续检查更新:', error.message)
        }
        
        logger.info('检查更新')
        try {
            const scriptContent = await this.fetchLatestScript()
            if (!scriptContent) {
                logger.warn('未获取到最新脚本内容')
                return
            }
            const latestVersion = this.extractVersionFromScript(scriptContent)
            if (!latestVersion) {
                logger.error('从最新脚本中提取版本号失败')
                return
            }
            logger.info(`当前版本: ${currentVersion}, 最新版本: ${latestVersion}`)
            if (this.compareVersions(currentVersion, latestVersion)) {
                // 提取最新脚本中的更新内容
                const latestUpdates = this.extractChangelogFromScript(scriptContent)
                // 如果无法从远程脚本提取更新内容，则使用本地更新内容作为后备
                const updateContentsHtml = this.generateUpdateList(latestUpdates || localUpdates)
                
                // 检查是否启用自动更新
                let autoUpdateEnabled = false
                try {
                    autoUpdateEnabled = await ConfigService.getValue('auto_update')
                } catch (error) {
                    logger.warn('获取自动更新设置失败，使用默认值:', error.message)
                }
                
                if (autoUpdateEnabled) {
                    logger.info('自动更新已启用，开始自动更新')
                    try {
                        // 自动下载并更新脚本
                        const updateUrl = 'https://www.asifadeaway.com/UserScripts/bilibili/bilibili-adjustment.user.js'
                        const response = await fetch(updateUrl)
                        if (response.ok) {
                            logger.info('脚本下载成功，准备更新')
                            // 这里可以添加自动更新的逻辑，例如通过Tampermonkey API
                            // 由于浏览器安全限制，自动更新可能需要用户交互
                            // 因此这里我们仍然显示更新弹窗，但默认选择自动更新
                            const updatePopover = createElementAndInsert(getTemplates.replace('update', {
                                current: currentVersion,
                                latest: latestVersion,
                                contents: updateContentsHtml
                            }), document.body, 'append')
                            updatePopover.showPopover()
                            const updateButton = updatePopover.querySelector('.adjustment-button-update')
                            const closeButton = updatePopover.querySelector('.adjustment-button-close')
                            
                            // 移除自动点击逻辑，要求用户手动确认
                            logger.info('自动更新已启用，等待用户确认')
                            
                            updateButton.addEventListener('click', () => {
                                updatePopover.hidePopover()
                                window.open(updateUrl, '_blank')
                            })
                            if (closeButton) {
                                closeButton.addEventListener('click', () => {
                                    updatePopover.hidePopover()
                                })
                            }
                        } else {
                            throw new Error(`下载脚本失败: ${response.status}`)
                        }
                    } catch (error) {
                        logger.error('自动更新失败，显示手动更新弹窗:', error.message)
                        // 自动更新失败，显示手动更新弹窗
                        this.#showUpdatePopover(currentVersion, latestVersion, updateContentsHtml)
                    }
                } else {
                    // 显示手动更新弹窗
                    this.#showUpdatePopover(currentVersion, latestVersion, updateContentsHtml)
                }
            }
        } catch (error) {
            logger.error('检查更新失败:', error.message)
            // 检查更新失败时，不显示错误信息，避免打扰用户
        }
    }
}

export const updateService = new UpdateService()

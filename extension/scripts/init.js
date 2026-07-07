// ===== scripts/init.js =====
// 应用初始化入口
;(async function () {
  'use strict'

  console.log('[BiliAdjust][Init] === init.js 开始执行 ===')

  const logger = new (window.__biliExt.LoggerService)('Init')
  const common = window.__biliExt.common
  const ConfigService = window.__biliExt.ConfigService
  const config = ConfigService
  const eventBus = window.__biliExt.eventBus
  const moduleSystem = window.__biliExt.moduleSystem
  const modules = window.__biliExt.modules

  console.log('[BiliAdjust][Init] modules keys:', modules ? Object.keys(modules) : 'undefined')
  console.log('[BiliAdjust][Init] moduleSystem 可用:', !!moduleSystem)

  // 模块缓存
  const moduleCache = new Map()
  let currentModuleType = null

  // 防抖页面类型检测
  const debouncedDetectPageType = (() => {
    let timer = null
    let leading = false

    return async function () {
      return new Promise((resolve) => {
        const invoke = async () => {
          const newType = common.detectivePageType()
          console.log('[BiliAdjust][Init] 页面类型: ' + newType)

          if (newType === currentModuleType) {
            console.log('[BiliAdjust][Init] 页面类型未变化')
            resolve(false)
            return
          }

          currentModuleType = newType
          const moduleMap = {
            'video': 'video', 'home': 'home', 'dynamic': 'dynamic',
          }

          const moduleName = moduleMap[newType]
          if (moduleName) {
            let mod = moduleCache.get(moduleName)
            if (!mod) {
              mod = modules[moduleName]
              if (mod) {
                moduleCache.set(moduleName, mod)
                console.log('[BiliAdjust][Init] 模块已缓存: ' + moduleName)
              }
            }
            if (mod) {
              moduleSystem.register(mod)
              console.log('[BiliAdjust][Init] 模块已注册: ' + mod.name)
            } else {
              console.log('[BiliAdjust][Init] 模块未找到: ' + moduleName)
            }
          }
          resolve(true)
        }

        if (!leading) { leading = true; invoke().then(resolve) }
        else { clearTimeout(timer); timer = setTimeout(() => invoke().then(resolve), 300) }
      })
    }
  })()

  // 应用初始化
  const initializeApp = async () => {
    try {
      console.log('[BiliAdjust][Init] initializeApp 开始')
      console.log('[BiliAdjust][Init] 正在初始化 ConfigService...')
      await ConfigService.initializeDefaults()
      console.log('[BiliAdjust][Init] ConfigService 初始化完成')

      window.__biliExt.LoggerService.updateLogLevelsFromConfig({
        log_level_info: await config.getValue('log_level_info'),
        log_level_error: await config.getValue('log_level_error'),
        log_level_warn: await config.getValue('log_level_warn'),
        log_level_debug: await config.getValue('log_level_debug'),
      })

      common.insertStyleToDocument({
        'BilibiliAdjustmentStyle': window.__biliExt.stylesV2?.BilibiliAdjustment || ''
      })

      console.log('[BiliAdjust][Init] 检测页面类型...')
      await debouncedDetectPageType()
      console.log('[BiliAdjust][Init] 页面类型: ' + currentModuleType)
      if (currentModuleType === 'other') { console.log('[BiliAdjust][Init] 页面类型为 other，跳过'); return }
      if (!currentModuleType) { console.log('[BiliAdjust][Init] 页面类型为空，跳过'); return }

      console.log('[BiliAdjust][Init] 正在初始化 ' + moduleSystem.registeredModules.length + ' 个模块...')
      await moduleSystem.init()
      console.log('[BiliAdjust][Init] 模块系统初始化完成')

      eventBus.emit('app:ready')

      // 监听 URL 变化
      let lastUrl = location.href
      common.monitorHrefChange(async () => {
        const cur = location.href; if (cur === lastUrl) return; lastUrl = cur
        console.log('[BiliAdjust][Init] URL 变化: ' + cur)
        moduleSystem.clearModules(); currentModuleType = null
        await debouncedDetectPageType()
        if (currentModuleType === 'other' || !currentModuleType) return
        await moduleSystem.init()
        eventBus.emit('app:ready')
      })

      // 检查更新
      try {
        const autoCheck = await config.getValue('auto_check_update')
        if (autoCheck) {
          await window.__biliExt.UpdateService.checkForUpdates('3.13.3')
        }
      } catch (e) { logger.error('更新检查失败', e) }

      console.log('[BiliAdjust][Init] ✅ 应用初始化完成')
    } catch (error) {
      console.error('[BiliAdjust][Init] ❌ 应用初始化失败:', error)
    }
  }

  console.log('[BiliAdjust][Init] 调用 initializeApp()...')
  initializeApp()
})()

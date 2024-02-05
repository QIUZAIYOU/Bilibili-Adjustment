// ==UserScript==
// @name              哔哩哔哩（bilibili.com）播放页调整 - 纯原生JS版
// @copyright         QIAN
// @license           GPL-3.0 License
// @namespace         https://github.com/QIUZAIYOU/Bilibili-VideoPage-Adjustment-Further/blob/main/BilibiliVideoPageAdjustment-FURTHER.js
// @version           0.1
// @description       1.自动定位到播放器（进入播放页，可自动定位到播放器，可设置偏移量及是否在点击主播放器时定位）；2.可设置是否自动选择最高画质；3.可设置播放器默认模式；
// @author            QIAN
// @match             *://*.bilibili.com/video/*
// @match             *://*.bilibili.com/bangumi/play/*
// @match             *://*.bilibili.com/list/*
// @require           https://cdn.jsdelivr.net/npm/localforage@1.10.0/dist/localforage.min.js
// @require           https://cdn.jsdelivr.net/npm/axios@1.6.5/dist/axios.min.js
// @require           https://scriptcat.org/lib/513/2.0.0/ElementGetter.js#sha256=KbLWud5OMbbXZHRoU/GLVgvIgeosObRYkDEbE/YanRU=
// @grant             GM_setValue
// @grant             GM_getValue
// @grant             GM_addStyle
// @grant             GM_registerMenuCommand
// @grant             window.onurlchange
// @supportURL        https://github.com/QIUZAIYOU/Bilibili-VideoPage-Adjustment-Further
// @homepageURL       https://github.com/QIUZAIYOU/Bilibili-VideoPage-Adjustment-Further
// @icon              https://www.bilibili.com/favicon.ico?v=1
// ==/UserScript==
(function() {
    'use strict';
    let vars = {
        currentUrl: document.URL,
        theMainFunctionRunningCount: 0,
        thePrepFunctionRunningCount: 0,
        autoSelectScreenModeRunningCount: 0,
        autoCancelMuteRunningCount: 0,
        webfullUnlockRunningCount: 0,
        autoSelectVideoHighestQualityRunningCount: 0,
        insertGoToCommentsButtonCount: 0,
        insertSetSkipTimeNodesButtonCount: 0,
        insertSkipTimeNodesSwitchButtonCount: 0,
        functionExecutionsCount: 0,
        checkScreenModeSwitchSuccessDepths: 0,
        autoLocationToPlayerRetryDepths: 0,
    }
    let arrays = {
        intervalIds: [],
        skipNodesRecords: []
    }
    const selector = {
        header: '#biliMainHeader',
        player: '#bilibili-player',
        playerContainer: '#bilibili-player .bpx-player-container',
        playerControler: '#bilibili-player .bpx-player-ctrl-btn',
        volumeButton: '.bpx-player-ctrl-volume-icon',
        mutedButton: '.bpx-player-ctrl-muted-icon',
        video: '#bilibili-player video',
        videoBwp: 'bwp-video',
        videoTitleArea: '#viewbox_report',
        videoFloatNav: '.fixed-sidenav-storage',
        videoComment: '#comment',
        videoTime: '.video-time,.video-seek',
        bangumiComment: '#comment_module',
        bangumiFloatNav: '[class*="navTools_floatNavExp"] [class*="navTools_navMenu"]',
        bangumiMainContainer: '.main-container',
        qualitySwitchButtons: '.bpx-player-ctrl-quality-menu-item',
        screenModeWideEnterButton: '.bpx-player-ctrl-wide-enter',
        screenModeWebEnterButton: '.bpx-player-ctrl-web-enter',
        danmukuBox: '#danmukuBox',
    }
    const utils = {
        /**
         * 初始化所有数据
         */
        initValue() {
            const value = [{
                name: 'is_vip',
                value: true,
            }, {
                name: 'player_type',
                value: 'video',
            }, {
                name: 'offset_top',
                value: 5,
            }, {
                name: 'player_offset_top',
                value: 168,
            }, {
                name: 'auto_locate',
                value: true,
            }, {
                name: 'get_offest_method',
                value: 'function',
            }, {
                name: 'auto_locate_video',
                value: true,
            }, {
                name: 'auto_locate_bangumi',
                value: true,
            }, {
                name: 'click_player_auto_locate',
                value: true,
            }, {
                name: 'current_screen_mode',
                value: 'normal',
            }, {
                name: 'selected_screen_mode',
                value: 'wide',
            }, {
                name: 'auto_select_video_highest_quality',
                value: true,
            }, {
                name: 'contain_quality_4k',
                value: false,
            }, {
                name: 'contain_quality_8k',
                value: false,
            }, {
                name: 'webfull_unlock',
                value: false,
            }, {
                name: 'auto_reload',
                value: false,
            }, {
                name: 'auto_skip',
                value: false,
            }]
            value.forEach(v => {
                if (utils.getValue(v.name) === undefined) {
                    utils.setValue(v.name, v.value)
                }
            })
        },
        /**
         * 获取自定义数据
         * @param {String} 数据名称
         * @returns 数据数值
         */
        getValue(name) {
            return GM_getValue(name)
        },
        /**
         * 写入自定义数据
         * @param {String} 数据名称
         * @param {*} 数据数值
         */
        setValue(name, value) {
            GM_setValue(name, value)
        },
        /**
         * 休眠
         * @param {Number} 时长
         * @returns
         */
        sleep(times) {
            return new Promise(resolve => setTimeout(resolve, times))
        },
        /**
         * 向文档插入自定义样式
         * @param {String} id 样式表id
         * @param {String} css 样式内容
         */
        insertStyleToDocument(css) {
            GM_addStyle(css)
        },
        /**
         * 自定义日志打印
         * @description
         * - info->信息；warn->警告
         * - error->错误；debug->调试
         */
        logger: {
            info(content) {
                console.info('%c播放页调整', 'color:white;background:#006aff;padding:2px;border-radius:2px', content);
            },
            warn(content) {
                console.warn('%c播放页调整', 'color:white;background:#ff6d00;padding:2px;border-radius:2px', content);
            },
            error(content) {
                console.error('%c播放页调整', 'color:white;background:#f33;padding:2px;border-radius:2px', content);
            },
            debug(content) {
                console.info('%c播放页调整(调试)', 'color:white;background:#cc00ff;padding:2px;border-radius:2px', content);
            },
        },
        // /**
        //  * 检查元素是否存在
        //  * @param {String} selector 元素选择器
        //  * @param {Number} maxAttempts 最大尝试次数
        //  * @param {Number} delay 检查时间间隔
        //  */
        // checkElementExistence(selector, maxAttempts, delay) {
        //   return new Promise(resolve => {
        //     let attempts = 0
        //     const timer = setInterval(() => {
        //       attempts++
        //       const $element = document.querySelector(selector)
        //       if ($element) {
        //         clearInterval(timer)
        //         resolve(true)
        //       } else if (attempts === maxAttempts) {
        //         clearInterval(timer)
        //         resolve(false)
        //       }
        //     }, delay)
        //     arrays.intervalIds.push(timer)
        //   })
        // },
        /**
         * 检查当前文档是否被激活
         */
        checkDocumentIsHidden() {
            const visibilityChangeEventNames = ['visibilitychange', 'mozvisibilitychange', 'webkitvisibilitychange', 'msvisibilitychange']
            const documentHiddenPropertyName = visibilityChangeEventNames.find(name => name in document) || 'onfocusin' in document || 'onpageshow' in window ? 'hidden' : null
            if (documentHiddenPropertyName !== null) {
                const isHidden = () => document[documentHiddenPropertyName]
                const onChange = () => isHidden()
                // 添加各种事件监听器
                visibilityChangeEventNames.forEach(eventName => document.addEventListener(eventName, onChange))
                window.addEventListener('focus', onChange)
                window.addEventListener('blur', onChange)
                window.addEventListener('pageshow', onChange)
                window.addEventListener('pagehide', onChange)
                document.onfocusin = document.onfocusout = onChange
                return isHidden()
            }
            // 如果无法判断是否隐藏，则返回undefined
            return undefined
        },
        /**
         * 监听当前URL变化并执行函数
         */
        whenWindowUrlChange() {
            if (window.onurlchange === null) {
                // 支持该功能
                window.addEventListener('urlchange', () => {
                    modules.locationToPlayer()
                })
            }
        },
        /**
         * 刷新当前页面
         */
        reloadCurrentTab() {
            if (vals.auto_reload) location.reload()
        },
        /**
         * 滚动文档至目标位置
         * @param {Number} 滚动距离
         */
        documentScrollTo(offset) {
            document.documentElement.scrollTop = offset
        },
        /**
         * 获取指定 meta 标签的属性值
         * @param {*} attribute 属性名称
         * @returns 属性值
         */
        getMetaContent(attribute) {
            const meta = document.querySelector(`meta[${attribute}]`)
            if (meta) {
                return meta.getAttribute('content')
            } else {
                return null
            }
        },
        /**
         * 获取Body 元素高度
         * @returns Body 元素高度
         */
        getBodyHeight() {
            const bodyHeight = document.body.clientHeight || 0
            const docHeight = document.documentElement.clientHeight || 0
            return bodyHeight < docHeight ? bodyHeight : docHeight
        },
        /**
         * 确保页面销毁时清除所有定时器
         */
        clearAllTimersWhenCloseTab() {
            window.addEventListener('beforeunload', () => {
                for (let id of arrays.intervalIds) {
                    clearInterval(id)
                }
                arrays.intervalIds = []
            })
        },
        /**
         * 获取目标元素至文档距离
         * @param {String} 目标元素
         * @returns 顶部和左侧距离
         */
        getElementOffsetToDocument(element) {
            let rect, win
            if (!element.getClientRects().length) {
                return {
                    top: 0,
                    left: 0
                }
            }
            rect = element.getBoundingClientRect()
            win = element.ownerDocument.defaultView
            return {
                top: rect.top + win.pageYOffset,
                left: rect.left + win.pageXOffset
            }
        },
        /**
         * 创建并插入元素至目标元素
         * @param {String} Html 字符串
         * @param {Element} 目标元素
         * @param {String} 插入方法（before/after/prepend/append）
         * @returns 被创建的元素
         */
        createElementAndInsert(HtmlString, target, method) {
            const element = elmGetter.create(HtmlString, target)
            target[method](element)
            return element
        },
        /**
         * 按顺序依次执行函数数组中的函数
         * @param {Array} functions
         * @description
         * - 只有当前一个函数执行完毕时才会继续执行下一个函数
         */
        async executeFunctionsSequentially(functions) {
            if (functions.length > 0) {
                const currentFunction = functions.shift()
                await currentFunction().then(result => {
                    // console.log(currentFunction.name, message)
                    if (result) {
                        const {
                            message,
                            callback
                        } = result
                        if (message) utils.logger.info(message)
                        if (callback && typeof callback === 'function') callback()
                    }
                    utils.executeFunctionsSequentially(functions)
                }).catch(error => {
                    utils.logger.error(error)
                    utils.reloadCurrentTab()
                })
            }
        }
    }
    const vals = {
        is_vip: utils.getValue('is_vip'),
        player_type: utils.getValue('player_type'),
        offset_top: Math.trunc(utils.getValue('offset_top')),
        auto_locate: utils.getValue('auto_locate'),
        get_offest_method: utils.getValue('get_offest_method'),
        auto_locate_video: utils.getValue('auto_locate_video'),
        auto_locate_bangumi: utils.getValue('auto_locate_bangumi'),
        click_player_auto_locate: utils.getValue('click_player_auto_locate'),
        player_offset_top: Math.trunc(utils.getValue('player_offset_top')),
        current_screen_mode: utils.getValue('current_screen_mode'),
        selected_screen_mode: utils.getValue('selected_screen_mode'),
        auto_select_video_highest_quality: utils.getValue('auto_select_video_highest_quality'),
        contain_quality_4k: utils.getValue('contain_quality_4k'),
        contain_quality_8k: utils.getValue('contain_quality_8k'),
        webfull_unlock: utils.getValue('webfull_unlock'),
        auto_reload: utils.getValue('auto_reload'),
        auto_skip: utils.getValue('auto_skip')
    }
    const styles = `.back-to-top-wrap .locate{visibility:hidden}.back-to-top-wrap:has(.visible) .locate{visibility:visible}`
    const modules = {
        /**
         * 获取当前视频类型(video/bangumi)
         * 如果都没匹配上则弹窗报错
         * @returns 当前视频类型
         */
        getCurrentPlayerType() {
            const playerType = (vars.currentUrl.includes('www.bilibili.com/video') || vars.currentUrl.includes('www.bilibili.com/list/')) ? 'video' : vars.currentUrl.includes('www.bilibili.com/bangumi') ? 'bangumi' : false
            if (!playerType) {
                utils.logger.debug('视频类型丨未匹配')
                alert('未匹配到当前视频类型，请反馈当前地址栏链接。')
            }
            utils.setValue('player_type', playerType)
            return playerType
        },
        /**
         * 判断用户是否登录
         */
        isLogin() {
            return Boolean(document.cookie.replace(new RegExp(String.raw`(?:(?:^|.*;\s*)bili_jct\s*=\s*([^;]*).*$)|^.*$`), '$1') || null)
        },
        /**
         * 检查视频元素是否存在
         * @description
         * - 若存在返回成功消息
         * - 若不存在则抛出异常
         */
        async checkVideoExistence() {
            const video = await elmGetter.get(selector.video)
            if (video) return {
                message: '播放器｜已找到'
            }
            else throw new Error('播放器｜未找到')
        },
        /**
         * 检查视频是否可以播放
         */
        async checkVideoCanPlayThrough() {
            // const BwpVideoPlayerExists = await utils.checkElementExistence(selector.videoBwp, 10, 10)
            // if (BwpVideoPlayerExists) {
            //   return new Promise(resolve => {
            //     resolve(true)
            //   })
            // }
            return new Promise((resolve, reject) => {
                let attempts = 100
                let message
                const timer = setInterval(() => {
                    const $video = document.querySelector(selector.video)
                    const videoReadyState = $video.readyState
                    if (videoReadyState === 4) {
                        message = '视频资源｜可以播放'
                        resolve({
                            message
                        })
                        clearInterval(timer)
                    } else if (attempts <= 0) {
                        message = '视频资源｜加载失败'
                        reject({
                            message
                        })
                        clearInterval(timer)
                    }
                    attempts--
                }, 100)
                arrays.intervalIds.push(timer)
            })
        },
        /**
         * 监听屏幕模式变化(normal/wide/web/full)
         */
        async observerPlayerDataScreenChanges() {
            const $playerContainer = await elmGetter.get(selector.playerContainer, 100)
            const observer = new MutationObserver(mutations => {
                const playerDataScreen = $playerContainer.getAttribute('data-screen')
                utils.setValue('current_screen_mode', playerDataScreen)
            }).observe($playerContainer, {
                attributes: true,
                attributeFilter: ['data-screen'],
            })
        },
        /**
         * 获取当前屏幕模式
         * @param {Number} 延时
         * @returns
         */
        async getCurrentScreenMode(delay = 0) {
            // if (vals.player_type === 'bangumi') await utils.sleep(1000)
            const $playerContainer = await elmGetter.get(selector.playerContainer, delay)
            // utils.logger.debug($playerContainer)
            return $playerContainer.getAttribute('data-screen')
        },
        /**
         * 递归检查屏幕模式是否切换成功
         * @param {*} expectScreenMode 期望的屏幕模式
         * @description
         * - 未成功自动重试
         * - 递归超过 10 次则返回失败
         */
        async checkScreenModeSwitchSuccess(expectScreenMode) {
            vars.checkScreenModeSwitchSuccessDepths++
            const enterBtnMap = {
                wide: async () => {
                    return await elmGetter.get(selector.screenModeWideEnterButton)
                },
                web: async () => {
                    return await elmGetter.get(selector.screenModeWebEnterButton)
                },
            }
            if (enterBtnMap[expectScreenMode]) {
                const enterBtn = await enterBtnMap[expectScreenMode]()
                enterBtn.click()
                const currentScreenMode = await modules.getCurrentScreenMode(300)
                const equal = expectScreenMode === currentScreenMode
                // utils.logger.debug(`${expectScreenMode} ${currentScreenMode}`)
                const success = vals.player_type === 'video' ? expectScreenMode === 'wide' ? equal && +getComputedStyle(document.querySelector(selector.danmukuBox))['margin-top'].slice(0, -2) > 0 : equal : equal
                if (success) return success
                else {
                    if (vars.checkScreenModeSwitchSuccessDepths === 10) return false
                    await utils.sleep(300)
                    return modules.checkScreenModeSwitchSuccess(expectScreenMode)
                }
            }
        },
        /**
         * 执行自动切换屏幕模式
         * @description
         * - 功能未开启，不执行切换函数，直接返回成功
         * - 功能开启，但当前屏幕已为宽屏或网页全屏，则直接返回成功
         * - 功能开启，执行切换函数
         */
        async autoSelectScreenMode() {
            if (vars.autoSelectScreenModeRunningCount += 1) {
                if (vals.selected_screen_mode === 'close') return {
                    message: '屏幕模式｜功能已关闭'
                }
                const currentScreenMode = await modules.getCurrentScreenMode()
                const screenModeMap = ['wide', 'web']
                if (screenModeMap.includes(currentScreenMode)) return {
                    message: `屏幕模式｜当前已是 ${currentScreenMode.toUpperCase()} 模式`
                }
                if (screenModeMap.includes(vals.selected_screen_mode)) {
                    const result = await modules.checkScreenModeSwitchSuccess(vals.selected_screen_mode)
                    if (result) return {
                        message: `屏幕模式｜${vals.selected_screen_mode.toUpperCase()}｜切换成功`
                    }
                    else throw new Error(`屏幕模式｜${vals.selected_screen_mode.toUpperCase()}｜切换失败`)
                }
            }
        },
        // 文档滚动至播放器
        async locationToPlayer() {
            const getOffestMethod = vals.get_offest_method
            const $video = await elmGetter.get(selector.video)
            let videoOffsetTop
            if (getOffestMethod === 'elements') {
                const $header = await elmGetter.get(selector.header, 100)
                const placeholderElement = await elmGetter.get(selector.videoTitleArea, 100) || await elmGetter.get(selector.bangumiMainContainer, 100)
                const headerHeight = $header.getBoundingClientRect().height
                const placeholderElementHeight = placeholderElement.getBoundingClientRect().height
                videoOffsetTop = vals.player_type === 'video' ? headerHeight + placeholderElementHeight : headerHeight + +getComputedStyle(placeholderElement)['margin-top'].slice(0, -2)
            }
            if (getOffestMethod === 'function') {
                videoOffsetTop = utils.getElementOffsetToDocument($video).top
            }
            // utils.logger.debug(videoOffsetTop)
            utils.setValue('player_offset_top', videoOffsetTop)
            utils.documentScrollTo(videoOffsetTop - vals.offset_top)
        },
        /**
         * 自动定位至播放器并检查是否成功
         * @description
         * - 未定位成功自动重试，递归超过 10 次则返回失败
         * - 基础数据：
         * - videoOffsetTop：播放器相对文档顶部距离，大小不随页面滚动变化
         * - videoClientTop：播放器相对浏览器视口顶部距离，大小随页面滚动变化
         * - targetOffset：用户期望的播放器相对浏览器视口顶部距离，由用户自定义
         * - 文档滚动距离：videoOffsetTop - targetOffset
         */
        async autoLocationToPlayer() {
            const onAutoLocate = vals.auto_locate && ((!vals.auto_locate_video && !vals.auto_locate_bangumi) || (vals.auto_locate_video && vals.player_type === 'video') || (vals.auto_locate_bangumi && vals.player_type === 'bangumi'))
            if (!onAutoLocate || vals.selected_screen_mode === 'web') return true
            vars.autoLocationToPlayerRetryDepths++
            modules.locationToPlayer()
            await utils.sleep(100)
            const $video = await elmGetter.get(selector.video)
            const videoOffsetTop = utils.getElementOffsetToDocument($video).top
            const videoClientTop = Math.trunc($video.getBoundingClientRect().top)
            if ((videoClientTop === vals.offset_top) || (Math.abs((videoOffsetTop - vals.offset_top) - Math.trunc(window.pageYOffset) < 5))) {
                // utils.logger.info('自动定位｜成功')
                const unlockbody = () => {
                    document.body.style.overflow = 'auto'
                }
                return {
                    message: '自动定位｜成功',
                    callback: unlockbody
                }
            } else {
                if (vars.autoLocationToPlayerRetryDepths === 10) throw new Error('自动定位｜失败：已达到最大重试次数')
                utils.logger.warn(`
        自动定位失败，继续尝试
        -----------------
        当前文档顶部偏移量：${Math.trunc(window.pageYOffset)}
        期望文档顶部偏移量：${videoOffsetTop - vals.offset_top}
        偏移量误差：${(videoOffsetTop - vals.offset_top) - Math.trunc(window.pageYOffset)}
        播放器顶部偏移量：${videoClientTop}
        设置偏移量：${vals.offset_top}`)
                await utils.sleep(100)
                utils.documentScrollTo(0)
                return modules.autoLocationToPlayer()
            }
        },
        /**
         * 点击播放器自动定位
         */
        async clickPlayerAutoLocation() {
            if (vals.click_player_auto_locate) {
                const $video = await elmGetter.get(selector.video)
                $video.onclick = async () => {
                    const currentScreenMode = await modules.getCurrentScreenMode()
                    if (['web', 'full', 'mini'].includes(currentScreenMode)) return
                    modules.locationToPlayer()
                }
            }
        },
        /**
         * 自动关闭静音
         */
        async autoCancelMute() {
            if (vars.autoCancelMuteRunningCount += 1) {
                const [mutedButton, volumeButton] = await elmGetter.get([selector.mutedButton, selector.volumeButton])
                // const mutedButtonDisplay = getComputedStyle(mutedButton)['display']
                // const volumeButtonDisplay = getComputedStyle(volumeButton)['display']
                const mutedButtonDisplay = mutedButton.style.display
                const volumeButtonDisplay = volumeButton.style.display
                if (mutedButtonDisplay === 'block' || volumeButtonDisplay === 'none') {
                    mutedButton.click()
                    // utils.logger.info('静音丨已关闭')
                    return {
                        message: '静音丨已关闭'
                    }
                }
            }
        },
        /**
         * 自动选择最高画质
         * @description
         * 质量代码：
         * - 127->8K 超高清;120->4K 超清;116->1080P 60帧;
         * - 80->1080P 高清；64->720P 高清；32->480P 清晰；
         * - 16->360P 流畅；0->自动
         */
        async autoSelectVideoHighestQuality() {
            if (vars.autoSelectVideoHighestQualityRunningCount += 1) {
                let message
                const qualitySwitchButtonsMap = new Map()
                if (!vals.auto_select_video_highest_quality) return
                const qualitySwitchButtons = await elmGetter.each(selector.qualitySwitchButtons, document, button => {
                    qualitySwitchButtonsMap.set(button.dataset.value, button)
                })
                await utils.sleep(100)
                if (vals.is_vip) {
                    if (!vals.contain_quality_4k && !vals.contain_quality_8k) {
                        [...qualitySwitchButtonsMap].filter(quality => {
                            return +quality[0] < 120
                        })[0][1].click()
                        message = '最高画质｜VIP｜不包含4K及8K｜切换成功'
                    }
                    if (vals.contain_quality_4k && !vals.contain_quality_8k) {
                        qualitySwitchButtonsMap.get('120').click()
                        message = '最高画质｜VIP｜4K｜切换成功'
                    }
                    if ((vals.contain_quality_4k && vals.contain_quality_8k) || (!vals.contain_quality_4k && vals.contain_quality_8k)) {
                        qualitySwitchButtonsMap.get('127').click()
                        message = '最高画质｜VIP｜8K｜切换成功'
                    }
                } else {
                    [...qualitySwitchButtonsMap].filter(button => {
                        return button[1].children.length < 2
                    })[0][1].click()
                    message = '最高画质｜非VIP｜切换成功'
                }
                // utils.logger.info(message)
                return {
                    message
                }
            }
        },
        /**
         * 插入漂浮功能按钮
         * - 快速返回至播放器
         */
        async insertFloatSideNavToolsButton() {
            const $floatNav = vals.player_type === 'video' ? await elmGetter.get(selector.videoFloatNav) : await elmGetter.get(selector.bangumiFloatNav, 100)
            const dataV = $floatNav.lastChild.attributes[1].name
            let locateButton
            if (vals.player_type === 'video') {
                const locateButtonHtml = '<div class="fixed-sidenav-storage-item locate" title="定位至播放器"><svg t="1643419779790" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1775" width="200" height="200" style="width: 50%;height: 100%;fill: currentColor;"><path d="M512 352c-88.008 0-160.002 72-160.002 160 0 88.008 71.994 160 160.002 160 88.01 0 159.998-71.992 159.998-160 0-88-71.988-160-159.998-160z m381.876 117.334c-19.21-177.062-162.148-320-339.21-339.198V64h-85.332v66.134c-177.062 19.198-320 162.136-339.208 339.198H64v85.334h66.124c19.208 177.062 162.144 320 339.208 339.208V960h85.332v-66.124c177.062-19.208 320-162.146 339.21-339.208H960v-85.334h-66.124zM512 810.666c-164.274 0-298.668-134.396-298.668-298.666 0-164.272 134.394-298.666 298.668-298.666 164.27 0 298.664 134.396 298.664 298.666S676.27 810.666 512 810.666z" p-id="1776"></path></svg>定位</div>'.replace('title="定位至播放器"', `title="定位至播放器" ${dataV}`)
                locateButton = utils.createElementAndInsert(locateButtonHtml, $floatNav.lastChild, 'prepend')
            }
            if (vals.player_type === 'bangumi') {
                const floatNavMenuItemClass = $floatNav.lastChild.lastChild.getAttribute('class')
                const locateButtonHtml = `<div class="${floatNavMenuItemClass} locate" style="height:40px;padding:0" title="定位至播放器">\n<svg t="1643419779790" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1775" width="200" height="200" style="width: 50%;height: 100%;fill: currentColor;"><path d="M512 352c-88.008 0-160.002 72-160.002 160 0 88.008 71.994 160 160.002 160 88.01 0 159.998-71.992 159.998-160 0-88-71.988-160-159.998-160z m381.876 117.334c-19.21-177.062-162.148-320-339.21-339.198V64h-85.332v66.134c-177.062 19.198-320 162.136-339.208 339.198H64v85.334h66.124c19.208 177.062 162.144 320 339.208 339.208V960h85.332v-66.124c177.062-19.208 320-162.146 339.21-339.208H960v-85.334h-66.124zM512 810.666c-164.274 0-298.668-134.396-298.668-298.666 0-164.272 134.394-298.666 298.668-298.666 164.27 0 298.664 134.396 298.664 298.666S676.27 810.666 512 810.666z" p-id="1776"></path></svg></div>`
                locateButton = utils.createElementAndInsert(locateButtonHtml, $floatNav.lastChild, 'before')
            }
            locateButton.onclick = () => {
                utils.documentScrollTo(vals.current_screen_mode !== 'web' ? vals.player_offset_top - vals.offset_top : 0)
            }
        },
        /**
         * 点击时间锚点自动返回播放器
         */
        async clickVideoTimeAutoLocation() {
            await utils.sleep(100)
            const $video = await elmGetter.get('video')
            const $clickTarget = vals.player_type === 'video' ? await elmGetter.get(selector.videoComment, 100) : await elmGetter.get(selector.bangumiComment, 100)
            await elmGetter.each(selector.videoTime, $clickTarget, function(target) {
                target.onclick = function(event) {
                    event.stopPropagation()
                    utils.documentScrollTo(vals.current_screen_mode !== 'web' ? vals.player_offset_top - vals.offset_top : 0)
                    const targetTime = vals.player_type === 'video' ? this.dataset['videoTime'] : this.dataset['time']
                    $video.currentTime = targetTime
                    $video.play()
                }
            })
        },
        /**
         * 前期准备函数
         * 提前执行其他脚本功能所依赖的其他函数
         */
        thePrepFunction() {
            if (vars.thePrepFunctionRunningCount += 1) {
                utils.clearAllTimersWhenCloseTab()
                utils.whenWindowUrlChange()
                utils.insertStyleToDocument(styles)
                utils.initValue()
                modules.getCurrentPlayerType()
                modules.observerPlayerDataScreenChanges()
            }
        },
        /**
         * 脚本执行主函数
         * 定义了所有功能函数将按何种规则执行
         */
        async theMainFunction() {
            if (vars.theMainFunctionRunningCount += 1) {
                const videoPlayerExists = await elmGetter.get(selector.video)
                if (videoPlayerExists) {
                    utils.logger.info('播放器｜已找到')
                    const isCanPlayThrough = await modules.checkVideoCanPlayThrough()
                    const videoControlerBtnExists = await elmGetter.get(selector.playerControler)
                    if (isCanPlayThrough || (!isCanPlayThrough && videoControlerBtnExists)) {
                        utils.logger.info('视频资源｜可以播放')
                        const selectedScreenMode = await modules.autoSelectScreenMode()
                        if (selectedScreenMode) {
                            utils.logger.info(`屏幕模式｜${vals.selected_screen_mode.toUpperCase()}｜切换成功`)
                            const autoLocationToPlayerSuccess = await modules.autoLocationToPlayer()
                            if (autoLocationToPlayerSuccess) {
                                modules.autoCancelMute()
                                modules.autoSelectVideoHighestQuality()
                                modules.clickPlayerAutoLocation()
                                modules.insertFloatSideNavToolsButton()
                                document.body.style.overflow = 'auto'
                            }
                        } else {
                            utils.logger.error(`屏幕模式｜${vals.selected_screen_mode.toUpperCase()}｜切换失败)`)
                            utils.reloadCurrentTab()
                        }
                    } else {
                        utils.logger.error('视频资源｜加载失败')
                        utils.reloadCurrentTab()
                    }
                } else {
                    utils.logger.error('播放器｜未找到')
                    utils.reloadCurrentTab()
                }
            }
        }
    }

    if (modules.isLogin()) {
        document.body.style.overflow = 'hidden'
        modules.thePrepFunction()
        const timer = setInterval(async () => {
            const dicumentHidden = utils.checkDocumentIsHidden()
            if (!dicumentHidden) {
                clearInterval(timer)
                utils.logger.info('当前标签｜已激活｜开始应用配置')
                // modules.theMainFunction()
                const functions = [
                    modules.checkVideoExistence,
                    modules.checkVideoCanPlayThrough,
                    modules.autoSelectScreenMode,
                    modules.autoLocationToPlayer,
                    modules.autoCancelMute,
                    modules.autoSelectVideoHighestQuality,
                    modules.clickPlayerAutoLocation,
                    modules.insertFloatSideNavToolsButton,
                    modules.clickVideoTimeAutoLocation
                ]
                utils.executeFunctionsSequentially(functions)
            } else {
                utils.logger.info('当前标签｜未激活｜等待激活')
            }
        }, 100)
        arrays.intervalIds.push(timer)
    } else utils.logger.warn('请登录｜本脚本只能在登录状态下使用')
})();
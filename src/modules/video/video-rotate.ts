import { elementSelectors, SITE_CLASS_NAMES } from '@/shared/element-selectors'
/** 视频模块特性上下文（由 video.module 的模块实例混入） */
interface VideoRotateContext {
    userConfigs: Record<string, unknown>
    videoRotateState: number
    _videoRotateVideo?: HTMLVideoElement | null
    _videoRotateContextHandler?: EventListener | null
    _videoRotateFullscreenHandler?: (() => void) | null
    _videoRotateBound?: boolean
    _videoRotateObserver?: MutationObserver | null
    _videoRotateBaseTransform?: string
    applyVideoRotation: (degrees: number) => void
}
export const videoRotateFeatures = {
    // 视频画面旋转
    videoRotateState: 0,
    async initVideoRotate (this: VideoRotateContext): Promise<void> {
        // 监听挂在播放器容器上（捕获阶段），而不是 video 元素本身：
        // 1) 容器比 video 更早存在，右键早于视频就绪时也能注入；
        // 2) B 站切换清晰度 / 网页全屏 / SPA 换集时会替换 video 元素，挂在旧元素上的监听会一起消失
        //    （2026-10-31 用户反馈「旋转失效」的形态之一）。
        const container = (elementSelectors.get('playerContainer') ?? elementSelectors.get('video')) as HTMLElement | null
        if (!container) return
        if (this._videoRotateBound) return
        this._videoRotateBound = true
        // 监听右键菜单事件，注入旋转选项
        this._videoRotateContextHandler = () => {
            let attempts = 0
            const tryInject = () => {
                const menu = elementSelectors.get('playerContextMenu')
                if (!menu) {
                    if (++attempts < 15) setTimeout(tryInject, 20)
                    return
                }
                // 移除旧的旋转菜单项
                menu.querySelectorAll(elementSelectors.CSS('playerContextMenuRotateItems') as string).forEach(el => el.remove())
                const oldDivider = menu.querySelector(elementSelectors.CSS('playerContextMenuRotateDivider') as string)
                if (oldDivider) oldDivider.remove()
                // 分割线：rgba 白浮色保留字面（嵌入 B 站官方播放器右键菜单，随官方播放器深色皮肤，
                // 不随脚本主题切换；见 docs/theme-system.md §2 例外清单）
                const divider = document.createElement('li')
                divider.className = SITE_CLASS_NAMES.contextMenuRotateDivider
                divider.style.cssText = 'height:1px;background:rgba(255,255,255,0.12);margin:4px 16px;list-style:none'
                menu.appendChild(divider)
                // 旋转选项：复原为绝对值，顺/逆时针为相对当前状态
                const rotateItems = [
                    { action: 'rotate_normal', label: '复原', deg: 0, absolute: true },
                    { action: 'rotate_cw', label: '顺时针90°', deg: 90, absolute: false },
                    { action: 'rotate_ccw', label: '逆时针90°', deg: -90, absolute: false },
                    { action: 'rotate_180', label: '旋转180°', deg: 180, absolute: true }
                ]
                rotateItems.forEach(({ action, label, deg, absolute }) => {
                    const li = document.createElement('li')
                    li.setAttribute('data-action', action)
                    li.textContent = label
                    li.addEventListener('click', e => {
                        e.stopPropagation()
                        this.applyVideoRotation(absolute ? deg : this.videoRotateState + deg)
                        menu.classList.remove(SITE_CLASS_NAMES.playerMenuActive)
                    })
                    menu.appendChild(li)
                })
            }
            setTimeout(tryInject, 20)
        }
        container.addEventListener('contextmenu', this._videoRotateContextHandler, true)
        // 全屏切换时重新应用旋转
        this._videoRotateFullscreenHandler = () => {
            this.applyVideoRotation(this.videoRotateState)
        }
        document.addEventListener('fullscreenchange', this._videoRotateFullscreenHandler)
        // video 元素被替换后把当前角度补回去（元素换新 = 旧 el 上的 transform 一并丢失）
        if (this.videoRotateState !== 0 && typeof MutationObserver !== 'undefined') {
            this._videoRotateObserver = new MutationObserver(() => {
                const current = elementSelectors.get('video') as HTMLVideoElement | null
                if (current && current !== this._videoRotateVideo) {
                    this._videoRotateVideo = current
                    this.applyVideoRotation(this.videoRotateState)
                }
            })
            this._videoRotateObserver.observe(container, { childList: true, subtree: true })
        }
    },
    /**
     * 应用旋转。
     *
     * 旋转挂**画面承载层**（`.bpx-player-video-wrap`）而不是 `<video>`：
     * - 有些视频（HDR / 杜比等）B 站不走 <video> 直接显示，而是画到 canvas / 用滤镜链，
     *   只转 video 元素时画面纹丝不动 —— 这是「有的视频旋转不起作用」的主因；
     * - 承载层同时包住 video 与 canvas，转它等于转整幅画面；弹幕层是它的兄弟节点，不受影响。
     * 承载层不存在时才退回转 <video>。
     * 另外，竖屏视频 B 站会自己在承载层上写 transform，这里把它的 base 保留下来做组合，不清掉。
     */
    applyVideoRotation (this: VideoRotateContext, degrees: number): void {
        const video = elementSelectors.get('video') as HTMLVideoElement | null
        const videoWrap = elementSelectors.get('playerVideoWrap') as HTMLElement | null
        const target = videoWrap ?? video
        if (!video || !target) return
        this.videoRotateState = degrees
        if (this._videoRotateBaseTransform === undefined) {
            this._videoRotateBaseTransform = (target.style.transform || '').trim()
        }
        if (degrees === 0) {
            target.style.transform = this._videoRotateBaseTransform
            target.style.transformOrigin = ''
            return
        }
        // 不做缩放补偿：缩放会让画面在旋转后整体变小、铺不满播放器（180° 尤甚）。
        // 旋转后画面保持原始大小，超出部分按播放器边框裁切 —— 这正是用户要的「铺满」。
        const base = this._videoRotateBaseTransform ? ` ${this._videoRotateBaseTransform}` : ''
        target.style.transform = `rotate(${degrees}deg)${base}`
        target.style.transformOrigin = 'center center'
    }
}

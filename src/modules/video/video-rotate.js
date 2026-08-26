import { elementSelectors } from '@/shared/element-selectors'
export const videoRotateFeatures = {
    // 视频画面旋转
    videoRotateState: 0,
    async initVideoRotate () {
        const video = await elementSelectors.video
        if (!video) return
        this._videoRotateVideo = video
        // 监听右键菜单事件，注入旋转选项
        this._videoRotateContextHandler = () => {
            let attempts = 0
            const tryInject = () => {
                const menu = document.querySelector('.bpx-player-contextmenu')
                if (!menu) {
                    if (++attempts < 15) setTimeout(tryInject, 20)
                    return
                }
                // 移除旧的旋转菜单项
                menu.querySelectorAll('[data-action^="rotate_"]').forEach(el => el.remove())
                const oldDivider = menu.querySelector('.bpx-player-contextmenu-rotate-divider')
                if (oldDivider) oldDivider.remove()
                // 分割线
                const divider = document.createElement('li')
                divider.className = 'bpx-player-contextmenu-rotate-divider'
                divider.style.cssText = 'height:1px;background:rgba(255,255,255,0.12);margin:4px 16px;list-style:none'
                menu.appendChild(divider)
                // 旋转选项：复原为绝对值，顺/逆时针为相对当前状态
                const rotateItems = [
                    { action: 'rotate_normal', label: '复原', deg: 0, absolute: true },
                    { action: 'rotate_cw', label: '顺时针90°', deg: 90, absolute: false },
                    { action: 'rotate_ccw', label: '逆时针90°', deg: -90, absolute: false }
                ]
                rotateItems.forEach(({ action, label, deg, absolute }) => {
                    const li = document.createElement('li')
                    li.setAttribute('data-action', action)
                    li.textContent = label
                    li.addEventListener('click', e => {
                        e.stopPropagation()
                        this.applyVideoRotation(absolute ? deg : this.videoRotateState + deg)
                        menu.classList.remove('bpx-player-active')
                    })
                    menu.appendChild(li)
                })
            }
            setTimeout(tryInject, 20)
        }
        video.addEventListener('contextmenu', this._videoRotateContextHandler)
        // 全屏切换时重新应用旋转
        this._videoRotateFullscreenHandler = () => {
            this.applyVideoRotation(this.videoRotateState)
        }
        document.addEventListener('fullscreenchange', this._videoRotateFullscreenHandler)
    },
    applyVideoRotation (degrees) {
        const video = document.querySelector('#bilibili-player video')
        if (!video) return
        this.videoRotateState = degrees
        if (degrees === 0) {
            video.style.transform = ''
            video.style.transformOrigin = ''
        } else {
            const vw = video.videoWidth
            const vh = video.videoHeight
            const scale = (vw && vh) ? Math.min(vw, vh) / Math.max(vw, vh) : 9 / 16
            video.style.transform = `rotate(${degrees}deg) scale(${scale})`
            video.style.transformOrigin = 'center center'
        }
    }
}

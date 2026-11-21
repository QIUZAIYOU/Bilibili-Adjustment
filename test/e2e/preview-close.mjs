#!/usr/bin/env node
/**
 * 预览弹窗关闭静音探针
 *
 * 用伪 video 夹具承载同源播放页，验证：
 * ① 关闭弹窗会暂停播放器；
 * ② 弹窗缓存过期/重建后（把长定时器压短模拟），再次关闭仍会暂停。
 */
import { installGmStubs, launchBrowser, loadUserscript, seedConfig, waitFor } from './harness.mjs'
const failures = []
const check = (label, ok, detail = '') => {
    console.log(`${ok ? '✔' : '✖'} ${label}${detail ? ' — ' + detail : ''}`)
    if (!ok) failures.push(label)
}
const FIXTURE = `<!DOCTYPE html><html><body>
<div id="bilibili-player"><video></video></div>
<script>
const video = document.querySelector('video')
let playing = true
Object.defineProperty(video, 'paused', { get: () => !playing })
Object.defineProperty(video, 'readyState', { get: () => 4 })
video.play = () => { playing = true; return Promise.resolve() }
video.pause = () => { playing = false; window.__pausedByParent = (window.__pausedByParent || 0) + 1 }
window.__isPlaying = () => playing
</script>
</body></html>`
const browser = await launchBrowser()
try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1600, height: 1000 })
    await page.setRequestInterception(true)
    page.on('request', request => {
        const url = request.url()
        if (request.resourceType() === 'document' && url.includes('/video/BV')) {
            void request.respond({ status: 200, contentType: 'text/html', body: FIXTURE })
            return
        }
        void request.continue()
    })
    await page.goto('https://www.bilibili.com/', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.evaluate(() => {
        // 把 keepAlive 这类长定时器压短，模拟「弹窗缓存过期后重建」
        const original = window.setTimeout
        window.setTimeout = (handler, timeout, ...args) => original(handler, typeof timeout === 'number' && timeout > 60000 ? 120 : timeout, ...args)
    })
    await installGmStubs(page)
    await seedConfig(page, { home_video_preview: true })
    await loadUserscript(page)
    await waitFor(async () => page.$('.adj-video-preview-btn'), { timeout: 30000, label: '预览按钮出现' })
    const openAndCheck = async (label) => {
        await page.evaluate(() => {
            document.querySelector('.adj-video-preview-btn')?.click()
        })
        await waitFor(async () => page.evaluate(() => Boolean(document.querySelector('.adj-video-preview-dialog')?.matches(':popover-open'))), {
            timeout: 15000,
            label: `${label}：弹窗打开`
        })
        const getFrame = () => page.frames().find(item => !item.isDetached() && item.url().includes('/video/BV'))
        await waitFor(async () => {
            const frame = getFrame()
            if (!frame) return false
            try {
                return await frame.evaluate(() => window.__isPlaying?.() === true)
            } catch {
                return false
            }
        }, { timeout: 15000, label: `${label}：伪播放器开始播放` })
        const frame = getFrame()
        await page.evaluate(() => {
            document.querySelector('.adj-video-preview-dialog .adjustment-dialog-close')?.click()
        })
        await waitFor(async () => {
            if (!frame || frame.isDetached()) return true
            try {
                return await frame.evaluate(() => window.__isPlaying?.() === false)
            } catch {
                return true
            }
        }, { timeout: 8000, label: `${label}：关闭后暂停` })
        check(`${label}：关闭后播放器已暂停`, true)
    }
    await openAndCheck('首次打开')
    await waitFor(async () => page.evaluate(() => !document.querySelector('.adj-video-preview-dialog')), { timeout: 5000, label: '缓存过期后弹窗销毁' })
    check('弹窗实例已销毁（模拟缓存过期）', true)
    await openAndCheck('重建后再次打开')
} finally {
    await browser.close()
}
if (failures.length) {
    console.error(`\n失败 ${failures.length} 项：${failures.join('、')}`)
    process.exit(1)
}
console.log('\n预览关闭静音探针通过')

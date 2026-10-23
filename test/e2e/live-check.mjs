/**
 * 真实页面核查（需联网）：把产物注入 B 站真实页面，量出侧栏按钮盒子与预览按钮覆盖情况
 *
 * 用法：node test/e2e/live-check.mjs [url]
 * 环境变量：ADJ_E2E_HEADLESS=1 无头运行（默认有头，便于肉眼确认）
 */
import { launchBrowser, openWithUserscript, waitFor } from './harness.mjs'
const URL = process.argv[2] || 'https://www.bilibili.com/video/BV1GJ411x7h7/'
const browser = await launchBrowser()
try {
    const page = await openWithUserscript(browser, URL, {
        config: { home_video_preview: true },
        session: {
            bilibili_video_info: JSON.stringify({
                owner: { mid: 2, name: '测试作者', face: 'https://i0.hdslb.com/bfs/face/member/noface.gif' }
            })
        }
    })
    // 等侧栏按钮插入（视频模块的初始化可能等到播放器就绪）
    await waitFor(
        () => page.evaluate(() => !!document.querySelector('.fixed-sidenav-storage .bili-adjustment-icon')),
        { timeout: 45000, label: '侧栏按钮插入' }
    ).catch(() => console.log('⚠️ 侧栏按钮未出现（视频模块可能没跑到该步骤）'))
    await new Promise(r => setTimeout(r, 1500))
    const report = await page.evaluate(() => {
        const box = el => {
            if (!el) return null
            const r = el.getBoundingClientRect()
            const cs = getComputedStyle(el)
            return {
                cls: (el.getAttribute('class') || '').trim(),
                w: Math.round(r.width),
                h: Math.round(r.height),
                margin: cs.margin,
                padding: cs.padding,
                borderRadius: cs.borderRadius,
                background: cs.backgroundColor,
                display: cs.display
            }
        }
        const nav = document.querySelector('.fixed-sidenav-storage')
        const wrap = nav?.lastElementChild
        // 预览按钮落在哪类容器里（分容器统计才知道覆盖了哪些页型）
        const previewByContainer = {}
        for (const btn of document.querySelectorAll('.adj-video-preview-btn')) {
            const cover = btn.closest('.adj-video-preview-cover')
            const card = cover?.closest('.bili-video-card, .card-box, .rank-item, .video-card, .bili-dyn-card-video, .av-item')
            const key = card ? (card.getAttribute('class') || card.tagName.toLowerCase()).split(/\s+/)[0] : '(未识别容器)'
            previewByContainer[key] = (previewByContainer[key] || 0) + 1
        }
        return {
            featureEnabled: !!document.getElementById('VideoPreviewStyle'),
            sidebarItems: wrap ? [...wrap.children].map(box) : [],
            avatar: box(document.querySelector('.adj-sidenav-up-avatar')),
            avatarImg: (() => {
                const img = document.querySelector('.adj-sidenav-up-avatar-img')
                return img ? { hidden: img.hidden, src: (img.getAttribute('src') || '').slice(0, 60), w: Math.round(img.getBoundingClientRect().width) } : null
            })(),
            avatarTip: document.querySelector('.adj-sidenav-up-avatar-tip')?.textContent || '',
            previewButtons: document.querySelectorAll('.adj-video-preview-btn').length,
            previewCovers: document.querySelectorAll('.adj-video-preview-cover').length,
            previewByContainer,
            cardLinks: document.querySelectorAll('a[href*="/video/"]').length,
            // 视频页的卡片封面长什么样（诊断用）
            sampleCard: (() => {
                const link = document.querySelector('a[href*="/video/"]')
                if (!link) return null
                const img = link.querySelector('img')
                return {
                    linkCls: (link.getAttribute('class') || '').trim(),
                    imgParentCls: img?.parentElement ? (img.parentElement.getAttribute('class') || '') : null,
                    imgGrandCls: img?.parentElement?.parentElement ? (img.parentElement.parentElement.getAttribute('class') || '') : null
                }
            })()
        }
    })
    console.log(JSON.stringify(report, null, 2))
    console.log('\n===== 页面日志（脚本相关） =====')
    const relevant = (page.logs || []).filter(l => /视频预览|VideoPreview|error|Error|失败|warn|页面类型|热更/.test(l))
    console.log(relevant.length ? relevant.join('\n') : '（无相关日志）')
} finally {
    await browser.close()
}

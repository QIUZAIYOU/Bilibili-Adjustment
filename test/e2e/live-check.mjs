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
                display: cs.display,
                flexDirection: cs.flexDirection
            }
        }
        const navs = [...document.querySelectorAll('.fixed-sidenav-storage')]
        const nav = document.querySelector('.fixed-sidenav-storage')
        const wrap = nav?.lastElementChild
        // 侧栏按钮唯一性：事故形态是「定位/UP/片段/设置」在页面左缘堆出十几组，
        // 所以这里直接数全文档（不是只数容器内），副本落在容器外也要被算出来
        const locateIcons = [...document.querySelectorAll('.bili-adjustment-icon.locate')]
        const navStats = {
            navCount: navs.length,
            locateCount: locateIcons.length,
            copiesOutsideNav: locateIcons.filter(el => !el.closest('.fixed-sidenav-storage') && !el.closest('#mirror-vdcon')).length,
            navVisible: navs.some(el => el.getClientRects().length > 0)
        }
        // 预览按钮落在哪类容器里（分容器统计才知道覆盖了哪些页型）
        const previewByContainer = {}
        for (const btn of document.querySelectorAll('.adj-video-preview-btn')) {
            const cover = btn.closest('.adj-video-preview-cover')
            const card = cover?.closest('.bili-video-card, .card-box, .rank-item, .video-card, .bili-dyn-card-video, .av-item')
            const key = card ? (card.getAttribute('class') || card.tagName.toLowerCase()).split(/\s+/)[0] : '(未识别容器)'
            previewByContainer[key] = (previewByContainer[key] || 0) + 1
        }
        // 注入按钮的样式门禁：B 站卡片样式绑定在侧栏组件 scope 上，scope 丢了会变成
        // 「无背景、横排、图标文字挤在一起」——2026-11-05 的真实故障。这里按计算样式断言。
        const injectedStyles = [...document.querySelectorAll('.fixed-sidenav-storage .bili-adjustment-icon')].map(el => {
            const cs = getComputedStyle(el)
            return {
                cls: (el.getAttribute('class') || '').trim(),
                scopes: el.getAttributeNames().filter(name => name.startsWith('data-v-')),
                display: cs.display,
                flexDirection: cs.flexDirection,
                borderRadius: cs.borderRadius,
                backgroundColor: cs.backgroundColor
            }
        })
        return {
            navStats,
            injectedStyles,
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
    // 机器可判定的唯一性门禁：定位按钮全文档只能有 1 个，且页面左缘（容器外）不能有副本
    const navFailures = []
    if (report.navStats.locateCount !== 1) navFailures.push(`定位按钮数量为 ${report.navStats.locateCount}（期望 1）`)
    if (report.navStats.copiesOutsideNav !== 0) navFailures.push(`侧栏容器外有 ${report.navStats.copiesOutsideNav} 个副本（期望 0）`)
    if (report.navStats.navCount === 0) navFailures.push('没有找到侧栏容器 .fixed-sidenav-storage')
    if (navFailures.length > 0) {
        console.log('❌ 侧栏按钮唯一性检查失败：' + navFailures.join('；'))
        process.exitCode = 1
    } else {
        console.log('✅ 侧栏按钮唯一性通过：locate=1，容器外副本=0')
    }
    // 样式门禁：scope + B 站卡片的计算样式（display:flex / column / 圆角 / 非透明背景）
    const styleFailures = []
    const isTransparent = bg => !bg || bg === 'transparent' || /^rgba\(0, 0, 0, 0\)$/.test(bg)
    if (report.injectedStyles.length === 0) styleFailures.push('侧栏里没有找到注入按钮')
    for (const item of report.injectedStyles) {
        const name = item.cls.replace('fixed-sidenav-storage-item', '').replace('bili-adjustment-icon', '').trim() || item.cls
        if (item.scopes.length === 0) styleFailures.push(name + ' 没有 data-v scope（卡片样式不会命中）')
        if (item.display !== 'flex') styleFailures.push(name + ' display=' + item.display + '（期望 flex）')
        if (item.flexDirection !== 'column') styleFailures.push(name + ' flex-direction=' + item.flexDirection + '（期望 column）')
        if (!item.borderRadius || item.borderRadius === '0px') styleFailures.push(name + ' border-radius=' + item.borderRadius + '（期望圆角卡片）')
        if (isTransparent(item.backgroundColor)) styleFailures.push(name + ' 背景透明（期望卡片背景）')
    }
    if (styleFailures.length > 0) {
        console.log('❌ 侧栏按钮样式检查失败：' + styleFailures.join('；'))
        process.exitCode = 1
    } else {
        console.log('✅ 侧栏按钮样式通过：' + report.injectedStyles.length + ' 个按钮均为带 scope 的圆角卡片')
    }
    console.log('\n===== 页面日志（脚本相关） =====')
    const relevant = (page.logs || []).filter(l => /视频预览|VideoPreview|error|Error|失败|warn|页面类型|热更/.test(l))
    console.log(relevant.length ? relevant.join('\n') : '（无相关日志）')
} finally {
    await browser.close()
}

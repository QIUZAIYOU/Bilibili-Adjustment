#!/usr/bin/env node
/**
 * 宽版设置入口探针：?adj_open_settings=1 自动打开站点内宽版设置面板
 *
 * ScriptCat 原生用户配置弹窗不支持宽版、父子缩进与联动显隐；菜单入口会把用户带到
 * 站点内设置面板（900px 宽、原生分组导航），这里验证入口链路。
 */
import { launchBrowser, openWithUserscript, waitFor } from './harness.mjs'
const failures = []
const check = (label, ok, detail = '') => {
    console.log(`${ok ? '✔' : '✖'} ${label}${detail ? ' — ' + detail : ''}`)
    if (!ok) failures.push(label)
}
const browser = await launchBrowser()
try {
    const page = await openWithUserscript(browser, 'https://www.bilibili.com/?adj_open_settings=1', { config: {}, viewport: { width: 1600, height: 1000 } })
    await waitFor(async () => page.evaluate(() => Boolean(document.querySelector('.adjustment-popover.adjustment-popover-wide')?.matches(':popover-open'))), {
        timeout: 30000,
        label: '宽版设置自动打开'
    })
    const state = await page.evaluate(() => {
        const popover = document.querySelector('.adjustment-popover.adjustment-popover-wide')
        const nav = document.querySelector('.adjustment-settings-nav')
        return {
            width: popover ? Math.round(popover.getBoundingClientRect().width) : 0,
            navWide: Boolean(nav?.classList.contains('is-wide')),
            sections: popover ? popover.querySelectorAll('.adjustment-section').length : 0,
            paramRemoved: !location.search.includes('adj_open_settings')
        }
    })
    check('宽版弹窗已打开', state.width > 0, `width=${state.width}`)
    check('宽度大于默认 550', state.width >= 800, `width=${state.width}`)
    check('分组导航切到宽版定位', state.navWide)
    check('设置分组正常渲染', state.sections >= 5, `sections=${state.sections}`)
    check('URL 参数已清理', state.paramRemoved)
} finally {
    await browser.close()
}
if (failures.length) {
    console.error(`\n失败 ${failures.length} 项：${failures.join('、')}`)
    process.exit(1)
}
console.log('\n宽版设置探针通过')

#!/usr/bin/env node
/**
 * ScriptCat 用户配置（==UserConfig==）桥接探针
 *
 * 1) 产物必须带 UserConfig 块；
 * 2) 启动时采纳脚本猫侧的值（theme=夜间哔哩 → data-adj-theme=night）；
 * 3) 本机已有/默认值回写脚本猫面板（selected_player_mode=宽屏）；
 * 4) 本机配置存储里确实写入了 night。
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { BUILD_PATH, installGmStubs, launchBrowser, loadUserscript, waitFor } from './harness.mjs'
const failures = []
const check = (label, ok, detail = '') => {
    console.log(`${ok ? '✔' : '✖'} ${label}${detail ? ' — ' + detail : ''}`)
    if (!ok) failures.push(label)
}
const source = await readFile(BUILD_PATH, 'utf8')
check('产物包含 ==UserConfig== 块', source.includes('/* ==UserConfig==') && source.includes('==/UserConfig== */'))
check('包含界面主题配置项', source.includes('"界面与播放器"') && source.includes('theme:'))
check('包含黑名单配置项', source.includes('up_blocklist_enabled:'))

const browser = await launchBrowser()
try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1600, height: 1000 })
    await page.goto('https://www.bilibili.com/', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await installGmStubs(page)
    await page.evaluate(() => {
        const store = window.__gmStore
        store.values.set('界面与播放器.theme', '夜间哔哩')
    })
    await loadUserscript(page)
    await waitFor(async () => page.evaluate(() => window.__gmStore.values.get('adj.cfg.theme')?.v === 'night'), {
        timeout: 15000,
        label: '本机配置写入 night'
    })
    await waitFor(async () => page.evaluate(() => window.__gmStore.values.has('界面与播放器.selected_player_mode')), {
        timeout: 15000,
        label: '默认值回写脚本猫'
    })
    check('脚本猫 theme=夜间哔哩 被采纳', true)
    const state = await page.evaluate(() => {
        const store = window.__gmStore
        const configRecord = store.values.get('adj.cfg.theme')
        return {
            storedTheme: configRecord?.v ?? configRecord,
            mirroredMode: store.values.get('界面与播放器.selected_player_mode'),
            mirroredTheme: store.values.get('界面与播放器.theme'),
            mirroredBlocklist: store.values.get('黑名单.up_blocklist_enabled')
        }
    })
    check('本机配置写入 theme=night', state.storedTheme === 'night', String(state.storedTheme))
    check('默认值回写脚本猫面板（宽屏）', state.mirroredMode === '宽屏', String(state.mirroredMode))
    check('脚本猫 theme 保持 label', state.mirroredTheme === '夜间哔哩', String(state.mirroredTheme))
    check('黑名单开关也回写脚本猫', state.mirroredBlocklist === false, String(state.mirroredBlocklist))

    // 脚本猫里把主题改回默认（跟随B站）：即便值等于默认值，也必须被采纳
    const applied = await page.evaluate(() => {
        const store = window.__gmStore
        const handlers = store.listeners.get('界面与播放器.theme')
        if (!handlers || !handlers.size) return false
        for (const handler of handlers.values()) handler('界面与播放器.theme', '夜间哔哩', '跟随B站', true)
        return true
    })
    check('脚本猫变更监听器已注册', applied)
    await waitFor(async () => page.evaluate(() => window.__gmStore.values.get('adj.cfg.theme')?.v === 'follow'), {
        timeout: 8000,
        label: '脚本猫改回默认值被采纳'
    })
    check('脚本猫改回默认值也被采纳', true)
} finally {
    await browser.close()
}
if (failures.length) {
    console.error(`\n失败 ${failures.length} 项：${failures.join('、')}`)
    process.exit(1)
}
console.log('\nScriptCat 用户配置探针全部通过')

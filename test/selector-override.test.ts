import { test } from 'node:test'
import assert from 'node:assert/strict'
/**
 * 选择器热更的**关键回归点**：查询路径是 `CSS_MAP[key] || (hasSelector(key) ? getSelector(key) : null)`，
 * **CSS_MAP 优先**。因此「只调 registerSelector」的覆盖对 CSS_MAP 里的全部 key 都是**静默无效**的
 * （2026-09-17 实现热更时踩到过：远端覆盖生效、日志显示成功，但页面查询仍用内置值）。
 * 这里用极简 DOM 桩在 Node 里直接跑真实查询路径，锁住「registry 与 CSS_MAP 同时改写」这条不变量。
 */
const makeElement = id => ({
    id,
    isConnected: true,
    parentElement: null,
    matches: () => true
})
const registry = new Map()
const createElement = () => ({
    querySelector: selector => {
        if (selector === '###') throw new SyntaxError(`'${selector}' is not a valid selector`)
        return null
    }
})
const installDomStub = () => {
    const dom = {
        createElement,
        querySelector: selector => registry.get(selector) || null,
        querySelectorAll: () => [],
        body: { appendChild: () => {} }
    }
    Object.assign(globalThis, {
        document: dom,
        window: { location: { host: '', pathname: '/', origin: '' }, addEventListener: () => {} },
        MutationObserver: class {
            observe () {}
            disconnect () {}
        }
    })
}
installDomStub()
test('overrideSelector：查询路径真的命中覆盖值（CSS_MAP 与注册表必须同时改写）', async () => {
    const { elementSelectors, overrideSelector } = await import('@/shared/element-selectors')
    const { getSelector } = await import('@/shared/selector-registry')
    const builtInApp = makeElement('app')
    const hotfixedApp = makeElement('app-hotfixed')
    registry.set('#app', builtInApp)
    registry.set('#app-hotfixed', hotfixedApp)
    try {
        // 内置值：查到的就是 #app
        assert.equal(elementSelectors.CSS_MAP.app, '#app')
        assert.equal(elementSelectors.get('app'), builtInApp)
        // 覆盖后：注册表、CSS_MAP、实际查询三者必须一致
        overrideSelector('app', '#app-hotfixed')
        assert.equal(getSelector('app'), '#app-hotfixed')
        assert.equal(elementSelectors.CSS_MAP.app, '#app-hotfixed')
        assert.equal(elementSelectors.get('app'), hotfixedApp)
        // 非法 CSS：抛错且**不写入**（内置值不被污染）
        assert.throws(() => overrideSelector('app', '###'), SyntaxError)
        assert.equal(elementSelectors.CSS_MAP.app, '#app-hotfixed')
        assert.equal(elementSelectors.get('app'), hotfixedApp)
    } finally {
        registry.clear()
        elementSelectors.CSS_MAP.app = '#app'
        overrideSelector('app', '#app')
    }
})
test('overrideSelector：空值/非字符串一律拒绝', async () => {
    const { overrideSelector } = await import('@/shared/element-selectors')
    assert.throws(() => overrideSelector('app', ''), TypeError)
    assert.throws(() => overrideSelector('', '#app'), TypeError)
})

/**
 * 保存一组元素的指定 computed 样式到 dataset 中
 * @param {string} key - 标识名
 * @param {Array<{el: Element, props: string[]}>} items
 */
export const saveElementStyles = (key, items) => {
    const store = {}
    items.forEach(({ el, props }) => {
        const id = el.id || el.tagName
        store[id] = {}
        props.forEach(prop => {
            // 优先取内联样式，无则取 computed 值
            const inline = el.style[prop]
            store[id][prop] = inline || getComputedStyle(el)[prop]
        })
    })
    sessionStorage.setItem(`bili_saved_styles_${key}`, JSON.stringify(store))
}
/**
 * 恢复之前保存的样式到元素上
 * @param {string} key - 标识名
 * @param {Array<{el: Element, props: string[]}>} items
 */
export const restoreElementStyles = (key, items) => {
    const raw = sessionStorage.getItem(`bili_saved_styles_${key}`)
    if (!raw) return
    const store = JSON.parse(raw)
    items.forEach(({ el, props }) => {
        const id = el.id || el.tagName
        const saved = store[id]
        if (!saved) return
        props.forEach(prop => {
            if (saved[prop] !== undefined) {
                el.style.setProperty(prop, saved[prop])
            }
        })
    })
    sessionStorage.removeItem(`bili_saved_styles_${key}`)
}

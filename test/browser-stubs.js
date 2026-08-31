// Node 环境下最小浏览器全局 stub：仅用于让 src 纯逻辑模块可被导入（模块加载期引用 document/window）。
// 真实浏览器行为由 userscript 运行环境提供，这里只保证模块加载与纯函数测试可用。
globalThis.window = {
    location: {
        href: 'https://www.bilibili.com/',
        host: 'www.bilibili.com',
        pathname: '/',
        origin: 'https://www.bilibili.com'
    },
    addEventListener: () => {}
}
// 浏览器中 location 是 window.location 的全局别名，src 模块加载期可能直接引用裸 location
globalThis.location = globalThis.window.location
// 文本节点：replaceWith 将替换结果原样回写父元素（不做真实 HTML 解析，
// 字符串级结果与真实浏览器序列化一致，足够支撑 formatVideoCommentDescription 的纯字符串转换测试）
const createTextNode = (text, parent) => ({
    textContent: text,
    _parent: parent,
    replaceWith (...nodes) {
        const joined = nodes.map(node => node.textContent ?? node._html).join('')
        parent._html = joined
        parent._children = [{ textContent: joined, _parent: parent }]
    }
})
const createElement = () => ({
    _html: '',
    _children: [],
    // selector-registry 校验 CSS 语法时调用；stub 不做真实校验（返回 null 即视为合法）
    querySelector: () => null,
    get innerHTML () { return this._html },
    set innerHTML (value) {
        this._html = value
        this._children = [createTextNode(value, this)]
    },
    get childNodes () { return this._children },
    cloneNode () {
        const copy = createElement()
        copy.innerHTML = this._html
        return copy
    }
})
globalThis.NodeFilter = { SHOW_TEXT: 1 }
globalThis.document = {
    createElement: () => createElement(),
    createTreeWalker: root => {
        const queue = [...root._children]
        let current = null
        return {
            get currentNode () { return current },
            nextNode () {
                if (!queue.length) {
                    current = null
                    return null
                }
                current = queue.shift()
                return current
            }
        }
    }
}
// 进度写入守卫使用 HTMLMediaElement.HAVE_METADATA 常量
globalThis.HTMLMediaElement = { HAVE_METADATA: 1 }

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
globalThis.document = {
    // selector-registry 校验 CSS 语法时调用；stub 不做真实校验（返回 null 即视为合法）
    createElement: () => ({ querySelector: () => null })
}
// 进度写入守卫使用 HTMLMediaElement.HAVE_METADATA 常量
globalThis.HTMLMediaElement = { HAVE_METADATA: 1 }

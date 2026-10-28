/**
 * 「鱼塘」弹窗模板
 *
 * 只描述静态结构；运行时内容（命中数量、评论列表）一律用 DOM API 往
 * `data-adj-field` 标记的节点里填 —— 昵称与评论正文是**用户可写文本**，
 * 拼进 HTML 就是存储型 XSS。
 */
export const fishPondTemplates = {
    fishPondDialog: `<div class="adj-fish-pond" bilibili-adjustment-element>
        <div class="adj-fish-pond-toolbar">
            <span class="adj-fish-pond-count" data-adj-field="count">正在扫描…</span>
            <button type="button" class="adj-fish-pond-rescan" data-adj-field="rescan">重新扫描</button>
        </div>
        <div class="adj-fish-pond-list" data-adj-field="list"></div>
        <div class="adj-fish-pond-empty" data-adj-field="empty" hidden>这片鱼塘很干净，没发现大肥鱼。</div>
    </div>`
}

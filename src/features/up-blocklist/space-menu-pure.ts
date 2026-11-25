/**
 * 空间页原生菜单注入的纯 DOM 逻辑（无网络/无 storage → 便于单测）
 */
export const SPACE_BLOCK_ATTR = 'data-adj-space-block'
export const SPACE_BLOCK_CLASS = 'adj-space-block-item'
/** 官方菜单项文案就是「加入黑名单」；带空白也认，其它项（举报等）不认 */
export const isOfficialBlockItem = (text: string | null | undefined): boolean =>
    String(text ?? '').replace(/\s+/g, '') === '加入黑名单'
/** 复制官方项上的 Vue scoped 属性（hash 随版本变化，不能写死） */
export const copyScopeAttrs = (from: Element, to: Element): void => {
    for (const name of from.getAttributeNames()) {
        if (name.startsWith('data-v-')) to.setAttribute(name, from.getAttribute(name) || '')
    }
}
/** 创建「加入黑名单（脚本）」菜单项（调用方负责插入到官方项之前） */
export const createSpaceBlockItem = (
    doc: Document,
    official: Element,
    onClick: () => void
): HTMLElement => {
    const item = doc.createElement('div')
    item.className = `menu-popover__panel-item ${SPACE_BLOCK_CLASS}`
    item.textContent = '加入黑名单（脚本）'
    item.setAttribute(SPACE_BLOCK_ATTR, '1')
    copyScopeAttrs(official, item)
    item.addEventListener('click', event => {
        event.preventDefault()
        event.stopPropagation()
        onClick()
    })
    return item
}
/** 在面板里插入菜单项（已存在则复用；没有官方项则不插入） */
export const injectSpaceBlockItem = (
    panel: HTMLElement,
    uid: string,
    onClick: (uid: string) => void
): HTMLElement | null => {
    const existing = panel.querySelector(`[${SPACE_BLOCK_ATTR}]`) as HTMLElement | null
    if (existing) return existing
    const official = Array.from(panel.querySelectorAll('.menu-popover__panel-item'))
        .find(item => isOfficialBlockItem(item.textContent))
    if (!official) return null
    const item = createSpaceBlockItem(panel.ownerDocument, official, () => onClick(uid))
    panel.insertBefore(item, official)
    return item
}

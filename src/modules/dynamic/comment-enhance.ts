import { LoggerService } from '@/services/logger.service'
import { getTemplates } from '@/shared/templates'
import { ShadowDOMHelper } from '@/utils/shadow-dom-helper'
import { elementSelectors, shadowDomSelectors } from '@/shared/element-selectors'
import { createElementAndInsert, addEventListenerToElement } from '@/utils/common'
const logger = new LoggerService('DynamicModule')
const shadowDOMHelper = new ShadowDOMHelper()
/** 动态模块特性上下文（由 dynamic.module 的模块实例混入） */
interface CommentEnhanceContext {
    userConfigs: Record<string, unknown>
    _cleanup: Array<() => void>
    doSomethingToCommentElements: (buttonElement: Element) => Promise<void>
}
export const commentEnhanceFeatures = {
    async doSomethingToCommentElements (this: CommentEnhanceContext, buttonElement: Element): Promise<void> {
        const listItem = buttonElement.closest(elementSelectors.CSS('dynamicListItem') as string)
        const showLocation = (host: Element, location: string | null | undefined) => {
            try {
                const existingLocation = shadowDOMHelper.queryDescendant(host, '#location')
                if (existingLocation) return
                const locationWrapperHtml = getTemplates.locationWrapper
                const pubdate = shadowDOMHelper.queryDescendant(host, elementSelectors.CSS('videoReplyPubDate') as string)
                if (!pubdate) return
                const locationElement = createElementAndInsert(locationWrapperHtml, pubdate as Node, 'after') as HTMLElement | null
                if (locationElement) locationElement.textContent = location || 'IP属地：未知'
            } catch (error) {
                logger.error('插入位置信息失败:', error)
            }
        }
        const removeCommentTagElements = (host: Element) => {
            const tagElements = shadowDOMHelper.queryDescendant(host, shadowDomSelectors.commentTags, true) as Element[]
            tagElements.forEach(tag => {
                tag.remove()
            })
        }
        this._cleanup.push(shadowDOMHelper.observeInsertion(shadowDomSelectors.commentRenderder, renderder => {
            // 自定义元素上挂的 data 由 B 站注入，这里按需收窄
            const data = (renderder as Element & { data?: { reply_control?: { location?: string }}}).data
            if (this.userConfigs.show_comment_location){
                showLocation(renderder, data?.reply_control?.location ?? 'IP属地：未知')
            }
            if (this.userConfigs.remove_comment_tags){
                removeCommentTagElements(renderder)
            }
        }, listItem as Element))
        this._cleanup.push(shadowDOMHelper.observeInsertion(shadowDomSelectors.commentReplyRenderder, renderder => {
            const data = (renderder as Element & { data?: { reply_control?: { location?: string }}}).data
            if (this.userConfigs.show_comment_location){
                showLocation(renderder, data?.reply_control?.location ?? 'IP属地：未知')
            }
        }, listItem as Element))
    },
    handleLoadComments (this: CommentEnhanceContext): void {
        const handledButtons = new WeakMap<Element, boolean>()
        this._cleanup.push(shadowDOMHelper.observeInsertion(elementSelectors.CSS('dynamicCommentLoadButton') as string, button => {
            if (!handledButtons.has(button)) {
                this._cleanup.push(addEventListenerToElement(button, 'click', () => {
                    this.doSomethingToCommentElements(button)
                    handledButtons.set(button, true)
                }))
            }
        }))
    }
}

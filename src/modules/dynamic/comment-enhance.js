import { LoggerService } from '@/services/logger.service'
import { ShadowDOMHelper } from '@/utils/shadow-dom-helper'
import { elementSelectors, shadowDomSelectors } from '@/shared/element-selectors'
import { createElementAndInsert, addEventListenerToElement } from '@/utils/common'
const logger = new LoggerService('DynamicModule')
const shadowDOMHelper = new ShadowDOMHelper()
export const commentEnhanceFeatures = {
    async doSomethingToCommentElements (buttonElement) {
        const listItem = buttonElement.closest(elementSelectors.CSS('dynamicListItem'))
        const showLocation = (host, location) => {
            try {
                const existingLocation = shadowDOMHelper.queryDescendant(host, '#location')
                if (existingLocation) return
                const locationWrapperHtml = '<div id="location" style="margin-left:5px"></div>'
                const pubdate = shadowDOMHelper.queryDescendant(host, elementSelectors.CSS('videoReplyPubDate'))
                if (!pubdate) return
                const locationElement = createElementAndInsert(locationWrapperHtml, pubdate, 'after')
                if (locationElement) locationElement.textContent = location || 'IP属地：未知'
            } catch (error) {
                logger.error('插入位置信息失败:', error)
            }
        }
        const removeCommentTagElements = host => {
            const tagElements = shadowDOMHelper.queryDescendant(host, shadowDomSelectors.commentTags, true)
            tagElements.forEach(tag => {
                tag.remove()
            })
        }
        this._cleanup.push(shadowDOMHelper.observeInsertion(shadowDomSelectors.commentRenderder, renderder => {
            if (this.userConfigs.show_comment_location){
                showLocation(renderder, renderder.data?.reply_control?.location ?? 'IP属地：未知')
            }
            if (this.userConfigs.remove_comment_tags){
                removeCommentTagElements(renderder)
            }
        }, listItem))
        this._cleanup.push(shadowDOMHelper.observeInsertion(shadowDomSelectors.commentReplyRenderder, renderder => {
            if (this.userConfigs.show_comment_location){
                showLocation(renderder, renderder.data?.reply_control?.location ?? 'IP属地：未知')
            }
        }, listItem))
    },
    handleLoadComments () {
        const handledButtons = new WeakMap()
        this._cleanup.push(shadowDOMHelper.observeInsertion(elementSelectors.CSS('dynamicCommentLoadButton'), button => {
            if (!handledButtons.has(button)) {
                this._cleanup.push(addEventListenerToElement(button, 'click', () => {
                    this.doSomethingToCommentElements(button)
                    handledButtons.set(button, true)
                }))
            }
        }))
    }
}

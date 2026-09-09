/**
 * Vue 渲染探针入口（P2-a：验证 Vue SFC 在 userscript 产物中的全链路）
 *
 * 将 SampleDialog 挂载进通用弹窗 openAdjustmentDialog 的内容区；
 * content(body) 返回 cleanup（app.unmount），弹窗关闭/销毁时由弹窗宿主调用。
 */
import { createApp } from 'vue'
import { openAdjustmentDialog } from '@/components/popover-dialog'
import SampleDialog from './SampleDialog.vue'
/** 打开 Vue 渲染探针弹窗；开发环境用于验证挂载/主题/配置响应式链路 */
export const openVueSampleDialog = () => {
    const dialog = openAdjustmentDialog({
        key: 'vue-sample-dialog',
        title: 'Vue 渲染探针',
        subtitle: 'P2-a 全链路验证',
        content: body => {
            console.info('[BA-Vue] content 回调执行，挂载 Vue…')
            const holder = document.createElement('div')
            body.appendChild(holder)
            const app = createApp(SampleDialog)
            app.mount(holder)
            console.info('[BA-Vue] Vue 已挂载，内容节点数：', holder.childElementCount)
            return () => {
                app.unmount()
                holder.remove()
            }
        }
    })
    const root = dialog && dialog.root
    console.info('[BA-Vue] 弹窗实例已创建：', Boolean(dialog), '| popover API：', typeof (root && root.showPopover), '| 打开态：', root ? root.matches(':popover-open') : 'n/a')
    return dialog
}

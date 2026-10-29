/**
 * 「鱼塘」按钮的同步通道
 *
 * 按钮是**按需出现**的（只在命中大肥鱼评论时插进侧栏），而「有没有命中」在两处产生：
 * 模块自己的扫描（`index.ts`）和弹窗里的「重新扫描」（`dialog.ts`）。
 * 弹窗不能直接引用模块实例（模块又 import 弹窗，会绕成循环），所以用一个极小的注册表把
 * 同步器交给两边共用：谁扫完谁调 `syncFishButtonByCount`。
 */
type FishButtonSyncer = (visible: boolean) => void
let syncer: FishButtonSyncer | null = null
/**
 * 注册/注销同步器（视频模块挂载时注册，销毁时传 null）
 * @param fn 同步器；null 表示注销
 */
export const registerFishButtonSyncer = (fn: FishButtonSyncer | null): void => {
    syncer = fn
}
/**
 * 按命中条数同步按钮显隐
 * @param count 本次扫描命中的大肥鱼评论条数
 */
export const syncFishButtonByCount = (count: number): void => {
    syncer?.(count > 0)
}

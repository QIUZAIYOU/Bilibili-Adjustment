/**
 * 播放器点击是否算「用户点画面」
 *
 * 脚本自己会用 `element.click()` 点 B 站播放器控件（宽屏/静音/清晰度），这些合成 click
 * 也落在播放器容器里，被当成用户点画面就会在模式切换前后多定位一次
 * （2026-11-09 用户反馈「切换播放模式之前先定位了一次」）。
 */
export interface PlayerLocateClickInput {
    /** 事件是否由真实输入产生（HTMLElement.click() / dispatchEvent 都是 false） */
    isTrusted: boolean
    /** 点的是播放器控制条（进度条、按钮区）内部 */
    insideControls: boolean
}
/** 只接受真实点击，且点在控制条之外（即画面区） */
export const shouldAcceptPlayerLocateClick = (input: PlayerLocateClickInput): boolean =>
    input.isTrusted && !input.insideControls

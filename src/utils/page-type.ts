import { regexps } from '@/shared/regexps'
/**
 * 页型判据（纯函数，零副作用）
 *
 * 为什么要有这一层：页型在**两个地方**各判一次，此前是两份互不相干的实现 ——
 * ① `utils/common.ts#detectivePageType` 决定「加载哪个页面模块」（video / home / dynamic / other）；
 * ② `shared/element-selectors.ts#getCurrentPageType` 决定「哪些选择器属于本页型独占」（等待还是跳过）。
 * 两份实现一旦不一致，就会出现「模块加载了但选择器被当成别的页型跳过」的半残状态。
 * 现在统一到本模块，两处共用同一判据。
 *
 * 判据来源全部是 `shared/regexps.ts` 注册表（B 站 URL 结构热更的唯一切口）：
 * 模块里不写死 B 站路径，改路由时改服务器上的 hot-config/regexps.js 即可生效。
 *
 * ⚠️ 注意：注册表里的正则是**可被热更替换**的，所以这里必须在调用时读取
 * `regexps.common.xxx`（不能在模块加载时解构缓存），否则热更覆盖不会生效。
 */
/** 普通视频页路径（/video/） */
export const isNormalVideoPage = (pathname: string): boolean => regexps.common.videoPath.test(pathname)
/** 番剧页路径（/bangumi/） */
export const isBangumiPage = (pathname: string): boolean => regexps.common.bangumiPath.test(pathname)
/** 列表页路径（/list/） */
export const isListPage = (pathname: string): boolean => regexps.common.listPath.test(pathname)
/**
 * 活动视频页路径（/festival/ 等）：内嵌标准播放器 + 评论区 + 弹幕，功能上等同播放页。
 * 判据走注册表 `common.activityVideoPath`，可热更扩到 B 站后续新增的活动路径。
 */
export const isActivityVideoPage = (pathname: string): boolean => regexps.common.activityVideoPath.test(pathname)
/**
 * 「视频模块页面」—— 决定加载 video 模块：普通视频页 / 番剧页 / 列表页 / 活动视频页。
 */
export const isVideoModulePage = (pathname: string): boolean =>
    isNormalVideoPage(pathname) || isBangumiPage(pathname) || isListPage(pathname) || isActivityVideoPage(pathname)
/**
 * 「视频页」—— 选择器页型门控用：普通视频页 + 活动视频页。
 * 不含列表页（/list/，历史上就按 other 处理）与番剧页（番剧页有独立的 bangumi 页型）。
 */
export const isVideoPage = (pathname: string): boolean =>
    isNormalVideoPage(pathname) || isActivityVideoPage(pathname)

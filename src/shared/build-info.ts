/**
 * 构建标识（发布一致性兜底）
 *
 * `__BUILD_SHA__` 由 vite.config.js 的 `define` 在构建期注入（git 短 SHA；工作区有未提交改动时带
 * `-dirty` 后缀，无法取到 git 时为 `unknown`）。它与 scripts/upload.py 上传的 version.json 里的
 * `sha` 对应：两者不一致 = 服务器上的文件被「同版本覆盖发布」过，脚本据此提示重新安装。
 *
 * Node 单测环境没有该常量，`typeof` 对未声明标识符是安全操作（不会抛 ReferenceError），
 * 故此处兜底为空串，策略层再按 isComparableBuildSha 判断是否可比。
 */
declare const __BUILD_SHA__: string | undefined
export const BUILD_SHA: string = typeof __BUILD_SHA__ === 'string' ? __BUILD_SHA__ : ''

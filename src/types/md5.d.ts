/**
 * md5 包的本地类型补丁
 * 该包不随 npm 分发类型声明（无 @types/md5 依赖），这里只声明项目实际用到的 `md5(string)` 形态。
 */
declare module 'md5' {
    /** 计算字符串的 MD5 摘要（32 位小写十六进制） */
    export default function md5 (message: string): string
}

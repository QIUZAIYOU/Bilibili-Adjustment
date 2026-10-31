/**
 * 敏感配置键（凭据）清单
 *
 * ⚠️ 2026-10-31 审查（C3）：`ai_apikey` / `custom_model_api_key` 是普通 schema 键，
 * 之前既被 `buildSettingsExportPayload` 原样导出（导出文件会被分享），
 * 也会被 `ConfigService` 的「配置已更新: key = value」调试日志打印明文。
 *
 * 本模块零依赖，供「导出载荷生成」「日志打码」两处共用，避免两套名单漂移。
 */
/** 凭据类配置键：导出置空、日志打码 */
export const SENSITIVE_CONFIG_KEYS: ReadonlySet<string> = new Set(['ai_apikey', 'custom_model_api_key'])
/** 判断某个配置键是否属于凭据类 */
export const isSensitiveKey = (key: string): boolean => SENSITIVE_CONFIG_KEYS.has(key)
/** 日志里展示的配置值：凭据类只显示长度标记，其余原样 */
export const maskConfigValueForKey = (key: string, value: unknown): string => {
    if (!isSensitiveKey(key)) return String(value)
    const text = typeof value === 'string' ? value : String(value ?? '')
    return text ? `[已隐藏 ${text.length} 字符]` : '[空]'
}

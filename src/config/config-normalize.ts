/**
 * 配置值类型归一化
 *
 * 设置面板的下拉是原生 select，其 `value` 恒为**字符串**（选「72小时」存的是 '72'）；
 * 历史数据里复选框也可能存 'false'。读取方若直接用 `typeof x === 'number'` 或 `Boolean(x)` 判断，
 * 会得到相反结论 —— 典型症状（issue #27）：「设置 72 小时检查更新频率却按默认 6 小时执行」
 * 「关掉开关却仍然生效」。
 *
 * 类型依据取 schema 派生出的默认值（ConfigService.DEFAULT_VALUES），无需另维护类型表。
 * 独立成文件是为了能被单元测试直接导入（config.service 会连带引入 IndexedDB 依赖）。
 */
export const normalizeConfigValue = (defaultValue: unknown, value: unknown): unknown => {
    if (typeof defaultValue === 'boolean') {
        return value === true || value === 'true'
    }
    if (typeof defaultValue === 'number') {
        // 空值与未设置保持原样：Number('') === 0 会把「未设置」误判成 0
        if (value === '' || value === null || value === undefined) return value
        const num = Number(value)
        // 无法转成有效数字时保留原值：避免把用户填写的文本类内容打成默认值
        return Number.isFinite(num) ? num : value
    }
    return value
}

// 假 GM 存储（单测用）
//
// 模拟脚本管理器的 GM_* API，两种形态：
// - 'sync'：同步版 GM_getValue/GM_setValue/...（油猴 v4/v5、ScriptCat、Violentmonkey 都提供）
// - 'promise'：Promise 版 GM.getValue/GM.setValue/...（没有同步版时的回落路径）
//
// 语义对齐真实 GM：**只有别的上下文写入才会回调监听器**（remote=true），
// 同一上下文的写入不触发 —— 所以「别的源改了配置」要用 remoteSet() 模拟。
const GM_KEYS = [
    'GM_getValue',
    'GM_setValue',
    'GM_deleteValue',
    'GM_listValues',
    'GM_getValues',
    'GM_setValues',
    'GM_addValueChangeListener',
    'GM_removeValueChangeListener'
]
/**
 * 安装假 GM API
 * @param {'sync'|'promise'} mode
 * @returns {{ values: Map<string, unknown>, remoteSet: (key: string, value: unknown) => void }}
 */
export const installFakeGm = (mode = 'sync') => {
    const values = new Map()
    const listeners = new Map()
    let nextId = 1
    const notify = (key, oldValue, newValue) => {
        const map = listeners.get(key)
        if (!map) return
        for (const handler of Array.from(map.values())) handler(key, oldValue, newValue, true)
    }
    const get = key => values.get(key)
    const set = (key, value) => { values.set(key, value) }
    const remove = key => { values.delete(key) }
    const list = () => Array.from(values.keys())
    const getMany = keys => {
        const result = {}
        for (const key of keys) if (values.has(key)) result[key] = values.get(key)
        return result
    }
    const setMany = entries => {
        for (const [key, value] of Object.entries(entries)) set(key, value)
    }
    const addListener = (key, handler) => {
        const id = nextId++
        if (!listeners.has(key)) listeners.set(key, new Map())
        listeners.get(key).set(id, handler)
        return id
    }
    const removeListener = id => {
        for (const map of listeners.values()) map.delete(id)
    }
    const scope = globalThis
    if (mode === 'sync') {
        scope.GM_getValue = get
        scope.GM_setValue = set
        scope.GM_deleteValue = remove
        scope.GM_listValues = list
        scope.GM_getValues = getMany
        scope.GM_setValues = setMany
        scope.GM_addValueChangeListener = addListener
        scope.GM_removeValueChangeListener = removeListener
        scope.GM = undefined
    } else {
        for (const key of GM_KEYS) scope[key] = undefined
        scope.GM = {
            getValue: async key => get(key),
            setValue: async (key, value) => { set(key, value) },
            deleteValue: async key => { remove(key) },
            listValues: async () => list(),
            getValues: async keys => getMany(keys),
            setValues: async entries => { setMany(entries) },
            addValueChangeListener: addListener,
            removeValueChangeListener: removeListener
        }
    }
    return {
        values,
        remoteSet: (key, value) => {
            const oldValue = values.get(key)
            values.set(key, value)
            notify(key, oldValue, value)
        }
    }
}
/** 卸载假 GM API（让适配层重新探测） */
export const removeFakeGm = () => {
    const scope = globalThis
    for (const key of GM_KEYS) scope[key] = undefined
    scope.GM = undefined
}

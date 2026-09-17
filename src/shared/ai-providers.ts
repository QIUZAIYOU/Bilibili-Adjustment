/**
 * AI 提供商默认配置（纯数据，零依赖）
 *
 * 为什么要单独成模块：这份表是「会随厂商更新而过期的配置」——新型号、端点点变更都不该等脚本发版。
 * 因此它既作为内置兜底，也作为热更覆盖的**白名单**（远端只能覆盖已存在的 provider 的
 * baseURL / defaultModel，不能新增 provider、不能改名称/文档链接）。
 */
import { registerHotConfigTarget } from './hot-config-registry'
/** 提供商配置（均为 OpenAI 兼容协议） */
export interface AIProviderConfig {
    name: string
    baseURL: string
    defaultModel: string
    docsUrl: string
    pricingUrl: string
}
/** 内置提供商表（热更覆盖的基底与白名单） */
export const AI_PROVIDER_CONFIGS: Record<string, AIProviderConfig> = {
    siliconflow: {
        name: '硅基流动',
        baseURL: 'https://api.siliconflow.cn/v1',
        defaultModel: 'deepseek-ai/DeepSeek-V3',
        docsUrl: 'https://siliconflow.cn',
        pricingUrl: 'https://siliconflow.cn/pricing'
    },
    deepseek: {
        name: 'DeepSeek 官方',
        baseURL: 'https://api.deepseek.com/v1',
        defaultModel: 'deepseek-chat',
        docsUrl: 'https://platform.deepseek.com',
        pricingUrl: 'https://platform.deepseek.com/api-docs/pricing'
    },
    kimi: {
        name: 'Kimi（月之暗面）',
        baseURL: 'https://api.moonshot.cn/v1',
        defaultModel: 'moonshot-v1-8k',
        docsUrl: 'https://platform.moonshot.cn',
        pricingUrl: 'https://platform.moonshot.cn/docs/pricing'
    },
    zhipu: {
        name: '智谱 AI',
        baseURL: 'https://open.bigmodel.cn/api/paas/v4',
        defaultModel: 'glm-4-flash',
        docsUrl: 'https://open.bigmodel.cn',
        pricingUrl: 'https://open.bigmodel.cn/pricing'
    },
    openai: {
        name: 'OpenAI',
        baseURL: 'https://api.openai.com/v1',
        defaultModel: 'gpt-4o-mini',
        docsUrl: 'https://platform.openai.com',
        pricingUrl: 'https://platform.openai.com/api-keys'
    },
    custom: {
        name: '自定义',
        baseURL: '',
        defaultModel: '',
        docsUrl: '',
        pricingUrl: ''
    }
}
/**
 * 应用热更覆盖（就地合并）
 * @param {Record<string, {baseURL?: string, defaultModel?: string}>} overrides 远端覆盖表
 * @returns {string[]} 实际生效的 provider 名（供日志）
 */
export const applyProviderOverrides = (overrides: Record<string, { baseURL?: string, defaultModel?: string }>): string[] => {
    const applied: string[] = []
    for (const [provider, override] of Object.entries(overrides || {})) {
        const target = AI_PROVIDER_CONFIGS[provider]
        if (!target || !override) continue
        let touched = false
        if (typeof override.baseURL === 'string' && override.baseURL.trim()) {
            target.baseURL = override.baseURL.trim()
            touched = true
        }
        if (typeof override.defaultModel === 'string' && override.defaultModel.trim()) {
            target.defaultModel = override.defaultModel.trim()
            touched = true
        }
        if (touched) applied.push(provider)
    }
    return applied
}
// 注册热更目标（AI 提供商覆盖表）：本模块自带内置表，故在这里自注册（服务端不 import 本模块，避免首屏负担）
registerHotConfigTarget('ai-providers', {
    keys: () => Object.keys(AI_PROVIDER_CONFIGS),
    apply: (provider, value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return false
        // 只认已内置的 provider，且只取 baseURL / defaultModel 两个字符串字段（名称/文档链接不归远端管）
        return applyProviderOverrides({ [provider]: value as { baseURL?: string, defaultModel?: string }}).length > 0
    }
})

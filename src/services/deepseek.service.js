import { LoggerService } from './logger.service'
import { ConfigService } from './config.service'
import axios from 'axios'
export class DeepSeekService {
    static #instance
    #logger = new LoggerService('DeepSeekService')
    #initialized = false
    constructor () {
        if (DeepSeekService.#instance) {
            return DeepSeekService.#instance
        }
        DeepSeekService.#instance = this
    }
    async initialize () {
        if (this.#initialized) return
        try {
            await ConfigService.initialize()
            this.#initialized = true
        } catch (error) {
            this.#logger.error('DeepSeekService初始化失败', error)
        }
    }
    async getApiKey () {
        await this.initialize()
        return ConfigService.getValue('ai_apikey')
    }
    async identifyAdvertisementTimestamps (subtitlesJsonString) {
        await this.initialize()
        const apiKey = await this.getApiKey()
        if (!apiKey) {
            this.#logger.error('DeepSeek API Key未配置')
        }
        try {
            // 构建请求体
            const requestBody = {
                model: 'deepseek-chat',
                messages: [
                    {
                        role: 'system',
                        content: `你是一个极其专业的视频广告识别专家，专门分析YouTube、抖音、B站、TikTok等平台视频的字幕内容，以最高精度识别其中的广告段落（包括硬广、软广、口播植入、赞助披露、中插广告、片尾推广等）。

                        给定一个包含多个字幕条目的列表，每个条目有三个字段：
                        - start_timestamp：字幕开始时间（单位：秒，浮点数或整数）
                        - end_timestamp：字幕结束时间（单位：秒，浮点数或整数）
                        - content：字幕文本内容

                        你的任务是：
                        1.  逐条仔细阅读所有字幕内容，结合上下文判断哪些连续的字幕条目属于广告段落。
                        2.  广告的典型特征包括但不限于：
                            - 明确提到“赞助”“合作”“广告”“推广”“本视频由XX赞助”“感谢XX支持”“品牌方”“植入”“这款产品”“链接在描述区”“优惠码”“限时折扣”“马上购买”等词汇
                            - 主播直接向观众推荐产品、服务、App、课程或其他品牌
                            - 出现品牌名称并伴随正面评价、功能介绍、使用演示、价格说明、购买引导
                            - 出现“赞助商环节”“广告时间”“插播一条广告”“软广时间”等自披露语句
                            - 突然切换到与视频主体内容无关的第三方产品或服务介绍
                            - **出现表示即将进入广告环节的过渡语句，如“在开始之前”、“插播一条”、“接下来是广告时间”、“不过在这之前”等，即使后续字幕才具体介绍产品。**
                        3.  广告段落必须是连续的字幕条目。广告开始于**第一条显示广告意图（包括引入广告的过渡语句）**的字幕的start_timestamp，结束于最后一条仍属于同一广告内容的字幕的end_timestamp。
                        4.  如果同一视频中存在多个独立广告段落，请分别识别。
                        5.  即使广告内容与视频主题有一定关联（如美妆视频植入化妆品），只要存在明显的推广或赞助意图，仍需判定为广告。
                        6.  只在有明确证据时才判定为广告，避免误判正常内容讨论为广告。
                        7.  输出必须严格为一个JSON数组，数组中每个元素为一个对象，仅包含"start"和"end"两个字段，数值保持原字幕时间戳的精度（保留小数）。如果没有检测到任何广告，则返回空数组[]。

                        输出示例（有广告）：
                        [{"start": 125.4, "end": 189.6}, {"start": 720.0, "end": 765.2}]

                        输出示例（无广告）：
                        []

                        请直接输出JSON结果，不要输出任何解释、文字或额外内容。`
                    },
                    {
                        role: 'user',
                        content: subtitlesJsonString
                    }
                ],
                stream: false
            }
            // 调用DeepSeek API
            const response = await axios.post('https://api.deepseek.com/chat/completions', requestBody, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                }
            })
            const data = response.data
            const result = JSON.parse(data.choices[0].message.content)
            this.#logger.debug('广告识别结果', result)
            return result
        } catch (error) {
            // 处理HTTP错误码
            if (error.response) {
                const status = error.response.status
                let errorMessage = '字幕分析失败'
                switch (status) {
                    case 400:
                        errorMessage = 'DeepSeek API请求格式错误：请求体格式错误。解决方法：请根据错误信息提示修改请求体'
                        break
                    case 401:
                        errorMessage = 'DeepSeek API认证失败：API key错误，认证失败。解决方法：请检查您的API key是否正确，如没有API key，请先创建API key'
                        break
                    case 402:
                        errorMessage = 'DeepSeek API余额不足：账号余额不足。解决方法：请确认账户余额，并前往充值页面进行充值'
                        break
                    case 422:
                        errorMessage = 'DeepSeek API参数错误：请求体参数错误。解决方法：请根据错误信息提示修改相关参数'
                        break
                    case 429:
                        errorMessage = 'DeepSeek API请求速率达到上限：请求速率（TPM或RPM）达到上限。解决方法：请合理规划您的请求速率'
                        break
                    case 500:
                        errorMessage = 'DeepSeek API服务器故障：服务器内部故障。解决方法：请等待后重试。若问题一直存在，请联系我们解决'
                        break
                    case 503:
                        errorMessage = 'DeepSeek API服务器繁忙：服务器负载过高。解决方法：请稍后重试您的请求'
                        break
                    default:
                        errorMessage = `DeepSeek API请求失败，状态码：${status}`
                }
                this.#logger.error(errorMessage, error)
            } else {
                this.#logger.error('字幕分析失败', error)
            }
        }
    }
    async identifyAdvertisementSegments (subtitlesJsonString) {
        await this.initialize()
        try {
            return await this.identifyAdvertisementTimestamps(subtitlesJsonString)
        } catch (error) {
            this.#logger.error('广告段落识别失败', error)
            return []
        }
    }
}
export const deepseekService = new DeepSeekService()

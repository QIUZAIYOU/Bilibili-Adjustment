export const regexps = {
    video: {
        nbspToBlank: /&nbsp;/gi,
        timeString: /\b(?:[0-5]?\d|60):[0-5]\d\b/g,
        url: /(?<!((href|url)="))(?:(?:http|https|ftp):\/\/)?(?!\d+(?:\.\d+)+$)(?!v\d+(?:\.\d+)+$)(?![a-zA-Z]*\d+(?:\.\d+)+$)[a-zA-Z][\w-]+(?:\.[a-zA-Z][\w-]+)+(?:[\w\-.,@?^=%&:/~+#;]*[\w\-@?^=%&/~+#;])?/g,
        videoId: /(?<!(>|\/))\bBV(?:1[1-9a-km-zA-Z]|2[0-9a-zA-Z])[0-9a-zA-Z]{8}\b(?!<)/g,
        readId: /\bcv\d{7}\b/g,
        blankLine: /^\s*$(?:\r?\n?)/gm,
        specialBlank: /(%09)+/g,
        user: /@([^\s]+)/g
    },
    dynamic: {
        newIndexLink: /(https:\/\/t.bilibili.com\/pages\/nav\/index_new).*/i,
        indexVoteLink: /https:\/\/t.bilibili.com\/vote\/h5\/index\/#\/result\?vote_id=.*/i,
        webVoteLink: /t.bilibili.com\/h5\/dynamic\/vote#\/result\?vote_id=.*/i,
        indexLotteryLink: /https:\/\/t.bilibili.com\/lottery\/h5\/index\/.*/i,
        webLotteryLink: /https:\/\/t.bilibili.com\/lottery\/.*/i,
        moreDataLink: /https:\/\/t.bilibili.com\/[0-9]+\?tab=[0-9]+/i,
        DetailLink: /https:\/\/t.bilibili.com\/[0-9]+/i,
        TopicDetailLink: /https:\/\/t.bilibili.com\/topic\/[0-9]+/i
    }
}

export const regexps = {
    nbspToBlank: /&nbsp;/gi,
    timeString: /\b(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\b/g,
    url: /(?<!((href|url)="))(http|https|ftp):\/\/[\w-]+(\.[\w-]+)*([\w\-.,@?^=%&:/~+#;]*[\w\-@?^=%&/~+#;])?/g,
    videoId: /(?<!(>|\/))\bBV(?:1[1-9a-km-zA-Z]|2[0-9a-zA-Z])[0-9a-zA-Z]{8}\b(?!<)/g,
    readId: /\bcv\d{7}\b/g,
    blankLine: /^\s*$(?:\r?\n?)/gm,
    specialBlank: /(%09)+/g
}

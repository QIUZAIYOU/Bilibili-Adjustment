import { chromium } from 'playwright';
import { resolve } from 'node:path';

// 落地页有滚动进场动画：整页截图前必须先把整页滚一遍让 reveal 触发，
// 否则截出来是一张「只有首屏有内容、下面全空」的图（内容其实在，只是 opacity:0）
const [url, out, w = '1440', h = '900'] = process.argv.slice(2);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
await page.goto('file:///' + resolve(url).replace(/\\/g, '/'), { waitUntil: 'load' });
await page.waitForTimeout(500);
await page.evaluate(async () => {
    document.documentElement.style.scrollBehavior = 'auto';
    const step = window.innerHeight * 0.7;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise(r => setTimeout(r, 160));
    }
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 500));
});
await page.waitForTimeout(900);
await page.screenshot({ path: out, fullPage: true });
console.log('saved', out);
await browser.close();

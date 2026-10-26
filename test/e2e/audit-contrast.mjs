import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIN_BODY = 14;
const MIN_LABEL = 12;

const files = process.argv.slice(2);

let failed = false;
const browser = await chromium.launch();
for (const f of files) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto('file:///' + resolve(f).replace(/\\/g, '/'));
    await page.waitForTimeout(400);
    // 页面有滚动进场动画：测量前强制进入「已进场」终态并关掉过渡，
    // 否则元素还处在 opacity 过渡中，算出来的比值是假的
    await page.evaluate(() => {
        document.querySelectorAll('[data-reveal]').forEach(el => el.classList.add('visible'));
        document.querySelectorAll('.demo-feat').forEach(el => el.classList.add('show'));
        const style = document.createElement('style');
        style.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}';
        document.head.appendChild(style);
    });
    await page.waitForTimeout(500);
    const report = await page.evaluate(({ MIN_BODY, MIN_LABEL }) => {
        const lum = (rgb) => {
            const a = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
            return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
        };
        const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
        const parse = (s) => {
            const m = s.match(/rgba?\(([^)]+)\)/);
            if (!m) return null;
            const p = m[1].split(',').map((x) => parseFloat(x));
            return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
        };
        // 与 huashu-design design_lint.py 同算法：只认「不透明且无背景图」的底色，
        // 半透明面板/渐变一律算不出来 → 跳过对比度判定，而不是拿白色当底
        const opaqueBg = (e) => {
            if (/^(IMG|VIDEO|CANVAS|PICTURE|IFRAME)$/.test(e.tagName) || e instanceof SVGElement) return null;
            const cs = getComputedStyle(e);
            if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
            const c = parse(cs.backgroundColor);
            return c && c[3] > 0.9 ? c.slice(0, 3) : undefined;
        };
        const bgOf = (el) => {
            const own = opaqueBg(el);
            if (own !== undefined) return own;
            const r = el.getBoundingClientRect();
            const x = r.left + r.width / 2, y = r.top + r.height / 2;
            if (x >= 0 && y >= 0 && x < innerWidth && y < innerHeight) {
                for (const e of document.elementsFromPoint(x, y)) {
                    if (e === el || el.contains(e)) continue;
                    const b = opaqueBg(e);
                    if (b !== undefined) return b;
                }
                return [255, 255, 255];
            }
            for (let e = el.parentElement; e && e.nodeType === 1; e = e.parentElement) {
                const b = opaqueBg(e);
                if (b !== undefined) return b;
            }
            return [255, 255, 255];
        };
        const opacityOf = (el) => {
            let o = 1, n = el;
            while (n && n !== document.documentElement) { o *= parseFloat(getComputedStyle(n).opacity); n = n.parentElement; }
            return o;
        };
        const ownText = (el) => {
            let s = '';
            for (const n of el.childNodes) if (n.nodeType === 3) s += n.textContent;
            return s.trim();
        };
        const path = (el) => {
            const parts = [];
            let n = el;
            while (n && n.nodeType === 1 && n !== document.body) {
                let s = n.tagName.toLowerCase();
                if (n.id) { s += '#' + n.id; parts.unshift(s); break; }
                if (n.className && typeof n.className === 'string') s += '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.');
                parts.unshift(s);
                n = n.parentElement;
            }
            return parts.join(' > ');
        };
        const CAPTION = 'figcaption, footer, small, caption, aside, sup, sub, [class*=caption], [class*=credit], [class*=footnote], [class*=meta]';
        const out = { lowContrast: [], small: [], bodySmall: [] };
        for (const el of document.body.querySelectorAll('*')) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || cs.display === 'none') continue;
            const t = ownText(el);
            if (t.length < 1) continue;
            const fs = parseFloat(cs.fontSize);
            const col = parse(cs.color);
            if (!col) continue;
            const bg = bgOf(el);
            if (!bg) continue;
            const a = col[3] * opacityOf(el);
            const fg = [0, 1, 2].map((i) => col[i] * a + bg[i] * (1 - a));
            const c = contrast(fg, bg);
            const large = fs >= 24 || (fs >= 18.66 && parseInt(cs.fontWeight) >= 700);
            const need = large ? 3 : 4.5;
            if (c < need) out.lowContrast.push({ sel: path(el), text: t.slice(0, 24), ratio: Math.round(c * 100) / 100, need, px: fs, color: cs.color, bg: `rgb(${bg.map(Math.round).join(',')})` });
            if (fs < MIN_LABEL) out.small.push({ sel: path(el), text: t.slice(0, 24), px: fs });
            if (t.length >= 28 && !el.closest(CAPTION) && fs < MIN_BODY) out.bodySmall.push({ sel: path(el), text: t.slice(0, 24), px: fs });
        }
        return out;
    }, { MIN_BODY, MIN_LABEL });
    console.log(`\n=== ${f} ===`);
    console.log(`对比度不足 ${report.lowContrast.length} 处`);
    for (const r of report.lowContrast) console.log(`  ${r.ratio} (需${r.need}) ${r.px}px "${r.text}" ${r.sel} | ${r.color} on ${r.bg}`);
    console.log(`小于 ${MIN_LABEL}px 的标签 ${report.small.length} 处`);
    for (const r of report.small) console.log(`  ${r.px}px "${r.text}" ${r.sel}`);
    console.log(`正文下限 ${MIN_BODY}px 不足 ${report.bodySmall.length} 处`);
    for (const r of report.bodySmall) console.log(`  ${r.px}px "${r.text}" ${r.sel}`);
    const bad = report.lowContrast.length + report.small.length + report.bodySmall.length;
    if (bad) {
        failed = true;
        console.log(`✗ ${f}：${bad} 处未达标`);
    } else {
        console.log(`✓ ${f}：对比度 / 标签字号 / 正文字号全部达标`);
    }
    await page.close();
}
await browser.close();
if (failed) process.exit(1);

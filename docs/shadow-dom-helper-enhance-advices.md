下面按“正确性 Bug / 性能 / 设计 / 代码细节”逐项说，最后给一个优先级建议。

---

## 一、正确性问题（建议优先修）

### 1. `observeInsertion` 漏处理“新插入节点后代中的 ShadowRoot 内已有元素”

当前 mutation 回调里：

```ts
if (nodeEl.matches(selector)) batch.add(nodeEl)
const matches = nodeEl.querySelectorAll(selector) // 不穿透 shadow
...
if (nodeEl.shadowRoot) { // 只处理 node 自身的 shadowRoot
    observeShadowRoots(nodeEl)
    processQueue.push(nodeEl.shadowRoot)
    ...
}
```

问题场景：

```html
<!-- 新插入的 host 自己没有 shadowRoot，但后代 span 有 -->
<div>
  <span><!-- span.attachShadow(...).innerHTML = '<button class="target">' --></span>
</div>
```

- `nodeEl.querySelectorAll` 不会穿透 `span.shadowRoot`
- `nodeEl.shadowRoot` 为 `null`，所以不会 push 任何 shadowRoot 到 `processQueue`
- 最终 `button.target` 永远不会触发回调

**建议**：mutation 回调不要自己做 `querySelectorAll` + 只 push 直接 shadowRoot，而是把所有新增 Element 直接交给 `drainQueue` 的 `_traverse` 处理。`_traverse` 本来就会穿透所有层级的 ShadowRoot。

```ts
for (const mutation of mutationList) {
    if (mutation.type !== 'childList') continue
    for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue
        const nodeEl = node as Element
        observeShadowRoots(nodeEl)          // 尽快注册 observe，避免丢后续 mutation
        processQueue.push(nodeEl)           // 交给 _traverse 统一穿透处理
    }
}
drainQueue().catch(...)
```

这样还能顺手删掉 `batch`、`processBatch(batch)` 这一大段重复逻辑，并修复“mutation 回调里同步执行 callback 阻塞主线程”的问题。

---

### 2. `node instanceof ShadowRoot` 在 ShadowRoot 未定义环境会抛 ReferenceError

```ts
if (node === root || node instanceof ShadowRoot) {
```

如果运行环境没有 `ShadowRoot` 全局（老浏览器 / 某些 WebView / 测试环境 mock），这里直接 `ReferenceError`。

**建议**：

```ts
const isShadowRoot = typeof ShadowRoot !== 'undefined' && node instanceof ShadowRoot
if (node === root || isShadowRoot) { ... }
```

或者用更稳的判断：

```ts
const isShadowRoot = node.nodeType === Node.DOCUMENT_FRAGMENT_NODE && !!(node as ShadowRoot).host
```

---

### 3. `processBatch` 没有检查 `cancelled`

mutation 回调里的 `setTimeout` 在 stop 之后可能仍会执行：

```ts
processBatch(batch) // 没有 cancelled 检查
```

虽然 `drainQueue` 里有检查，但这条路径绕过了。**建议**在 `processBatch` 开头加 `if (cancelled) return`，或在调用前检查。

---

### 4. 停止函数没有清理 `processQueue`

```ts
return () => {
    cancelled = true
    observer.disconnect()
    this.observers.delete(observer)
    clearTimeout(timeoutId ?? undefined)
    pendingMutations = []
}
```

`processQueue` 可能还持有大量节点引用。建议加：

```ts
processQueue.length = 0
```

`initProcess` 里也建议加 `if (cancelled) return`，避免 stop 后仍 push root。

---

### 5. `_traverse` 的遍历顺序：light DOM 先于 Shadow Tree

当前 push 顺序：

```ts
if (nodeEl.shadowRoot) stack.push(nodeEl.shadowRoot)
if (nodeEl.children) {
    for (let i = nodeEl.children.length - 1; i >= 0; i--) stack.push(nodeEl.children[i])
}
```

LIFO 弹出顺序是：`children[0] → children[1] → ... → shadowRoot`。也就是说 `first` 模式下会**先返回 light DOM 中的匹配，哪怕 Shadow Tree 里有更靠前的渲染内容**。

标准 `querySelector` 不穿透 Shadow DOM，所以没有官方顺序定义，但用户通常预期“Shadow Tree 内容是 host 的一部分”。这不是必现 Bug，但建议：
- 明确文档说明顺序
- 或调整 push 顺序，让 shadowRoot 先弹出（如果希望 Shadow Tree 优先）

---

### 6. `observers` WeakSet 是死代码

```ts
private observers = new WeakSet<MutationObserver>()
// 只有 add 和 delete，没有任何读取
```

注释说“保持引用/去重”，但 `WeakSet` 是弱引用，不会保持引用；去重也没有意义（每个 `observeInsertion` 创建新 observer）。**建议直接删除**。

---

## 二、性能问题

### 1. `_traverse` 对“没有 Shadow DOM 的页面”遍历整棵 DOM 树

即使页面完全没有 Shadow DOM，`_traverse` 也会把每个元素 push/pop 一遍，只为了检查 `shadowRoot`。原生 `querySelectorAll` 是 O(n) 且由浏览器优化，这里的 JS 树遍历会明显更慢，大页面上可能慢几倍。

**可考虑的优化**：

- 先用原生 `root.querySelectorAll(selector)` 拿到 light DOM 结果，同时只用一个轻量遍历收集所有 `shadowRoot`，再在每个 shadowRoot 内递归。这样 light DOM 匹配交给浏览器引擎。
- 或者用 `TreeWalker`（`document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)`）替代手写 stack，通常更快、内存更可控。
- 如果接受“light DOM 优先”的顺序，可以大幅简化：

```ts
const result = root.querySelector(selector) // 或 querySelectorAll
// 再遍历 shadowRoot 补充
```

- 维护一个“当前文档是否出现过 ShadowRoot”的标记，没有时直接走原生查询。

---

### 2. `observeInsertion` 中多处重复遍历

- mutation 回调里 `nodeEl.querySelectorAll(selector)` + `observeShadowRoots(nodeEl)`（遍历整棵新子树）
- `drainQueue` 里 `_traverse(node, selector, 'all')`（又遍历整棵子树）

同一棵新插入的子树被遍历了 2~3 次。按上面的修复把所有新增 Element 交给 `drainQueue`，可以合并成一次 `_traverse` + 一次 `observeShadowRoots`。

---

### 3. mutation 回调里的 `processBatch(batch)` 是同步执行

`drainQueue` 已经做了 100 个一批的异步分片，但 mutation 回调这条路径是同步 `processBatch`，如果一次插入大量匹配元素，会长时间阻塞主线程。统一走 `processQueue` 即可解决。

---

### 4. `drainQueue` 里 `batch` 先全量收集再分片

```ts
const batch: Element[] = []
for (const el of this._traverse(node, selector, 'all') as Element[]) batch.push(el)
while (batch.length) { processBatch(batch.splice(0, 100)); ... }
```

如果匹配元素很多，`batch` 数组会一次性占用大量内存。可以为 `observeInsertion` 写一个流式遍历（或给 `_traverse` 加一个 `onMatch` 回调版本），边遍历边分批处理。

---

### 5. `requestIdleCallback` 没有 timeout

```ts
fn => requestIdleCallback(fn)
```

在繁忙页面可能被推迟很久，初始扫描迟迟不执行。建议：

```ts
fn => requestIdleCallback(fn, { timeout: 1000 })
```

---

## 三、设计与 API

### 1. `_isValidRoot` / `_traverse` 无状态，却挂在实例上

这两个方法不依赖 `this`，可以提取为模块级函数或 `static`，更易测试、也避免调用方误以为有实例状态。`observers` 删掉后，`ShadowDOMHelper` 基本就是纯工具类。

---

### 2. `querySelector` 的参数类型与 `_traverse` 不一致

`_traverse` 接受 `DocumentFragment`，`_isValidRoot` 也允许，但公开 API `querySelector/querySelectorAll` 只声明 `Element | Document`，`queryDescendant` 又只接受 `Element | ShadowRoot`。建议统一为：

```ts
type QueryRoot = Element | Document | DocumentFragment
```

避免用户传普通 `DocumentFragment` 时类型报错，而运行时其实支持。

---

### 3. selector 校验方式不一致

`observeInsertion` 用：

```ts
document.createElement('div').matches(selector)
```

`_traverse` 用 `querySelector` 并捕获 `SyntaxError`。`matches` 和 `querySelector` 对某些选择器（伪元素、`:scope`、旧浏览器的新伪类）支持略有差异，可能出现“校验通过但 `_traverse` 抛错”或反之。

**建议统一**，例如都用：

```ts
try { document.createDocumentFragment().querySelector(selector) } catch { ... }
```

或在 `observeInsertion` 里直接复用 `_traverse` 的校验逻辑。

---

### 4. `observeInsertion` 无法感知 `attachShadow` 动态挂载

`MutationObserver` 监听不到 `element.attachShadow()`（它不产生 DOM mutation）。如果业务中有“先插入元素，之后才 attachShadow 并填充内容”，这些内容不会被回调。这是 API 的固有限制，但建议在文档里明确说明；如需支持，只能轮询或要求调用方手动通知。

---

### 5. `queryDescendant` 的 `all` 参数与 `querySelectorAll` 风格不统一

一个是 `(element, selector, all = false)`，一个是 `(selector, root = document)`。可以统一成 `(selector, root, mode)` 或提供重载。小问题，但影响一致性。

---

## 四、代码细节

1. **`/** global */` 注释无意义**，可以删掉；如果是 eslint 的 `/* global ... */`，位置和格式也不对。

2. **`results?.add(el)` 多余**：`isAll` 为 true 时 `results` 一定非 null，直接用 `results!.add(el)` 或调整类型即可。

3. **`clearTimeout(timeoutId ?? undefined)`** 可以简化为 `if (timeoutId) clearTimeout(timeoutId)`。

4. **`_traverse` 里注释不准确**：

   ```ts
   // shadowRoot / children 只存在于 Element（Document 与 DocumentFragment 上分别缺失/等价）
   ```

   实际上 `Document` 和 `DocumentFragment` 都实现了 `ParentNode`，都有 `children`。`shadowRoot` 只存在于 `Element`。注释建议改成：

   ```ts
   // shadowRoot 只存在于 Element；children 在 Document/DocumentFragment/Element 上都存在
   ```

5. **`_traverse` 返回类型过宽**：`Element | Element[] | null`，调用方大量 cast。可以用重载或泛型：

   ```ts
   _traverse(root, selector, mode: 'first'): Element | null
   _traverse(root, selector, mode: 'all'): Element[]
   ```

6. **`processQueue` 命名容易和 `MutationRecord` 的队列混淆**，可以叫 `pendingRoots` 或 `scanQueue`。

7. **`observeShadowRoots` 中 `seen` 用 `WeakSet<Element | Document | DocumentFragment>`**，但 `current` 可能是 `Document`，`WeakSet` 接受对象，没问题；不过 `Document` 是否会被多次 push 值得确认，通常不会。

8. **`drainQueue` 的 `isDraining` 标志**：如果 `drainQueue` 内部抛出未捕获异常（比如 `_traverse` 的 `TypeError`），`isDraining` 会永远为 `true`，后续队列不再处理。建议用 `try/finally`：

   ```ts
   const drainQueue = async () => {
       if (isDraining) return
       isDraining = true
       try { ... } finally { isDraining = false }
   }
   ```

   虽然 selector 已前置校验，但 `_traverse` 仍可能因其他原因抛错。

9. **`_traverse` 的 `catch` 里 `continue`** 在 `throw new TypeError` 之后不可达，逻辑没问题，但可读性一般。

10. **`observeInsertion` 的 `pendingMutations` 无上限**：50ms 窗口内如果 mutation 极多，数组会很大。可以考虑设置一个上限或改为直接处理（因为 50ms 防抖本身已经限制了频率）。

---

## 优先级建议

| 优先级 | 项 |
|---|---|
| P0 | 修复 `observeInsertion` 漏处理后代 ShadowRoot 的 Bug（统一走 `processQueue`） |
| P0 | `ShadowRoot` 未定义环境的兼容判断 |
| P1 | `processBatch` 加 `cancelled` 检查；停止函数清理 `processQueue` |
| P1 | 删除 `observers` 死代码；`drainQueue` 用 `try/finally` 重置 `isDraining` |
| P2 | `_traverse` 性能优化（原生查询 + 仅遍历 shadowRoot，或 TreeWalker） |
| P2 | 统一 selector 校验；`requestIdleCallback` 加 timeout |
| P3 | 类型重载、注释修正、API 一致性等 |

整体来看，`_traverse` 的思路是对的（只在 root/ShadowRoot 边界做原生查询），主要问题集中在 `observeInsertion` 的 mutation 处理路径上，修好 P0 后正确性会好很多。
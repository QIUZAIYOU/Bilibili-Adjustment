# 设置项修改指导文档

> 本文档用于规范哔哩哔哩调整脚本中「设置项」的新增、修改和删除流程，确保不再出现选择器未注册、配置未保存、事件未绑定等低级错误。

---

## 一、修改前必读

每次涉及设置项的变更（新增/修改/删除），必须按以下清单逐项检查。遗漏任何一步都可能导致运行时错误。

---

## 二、修改清单（Checklist）

### 步骤 1：配置默认值（config.service.js）

**文件：** `src/services/config.service.js`

**操作：**
- 在 `DEFAULT_VALUES` Map 中添加/修改/删除对应的配置项。
- 配置 key 使用 `snake_case` 命名。
- 确保默认值类型与预期一致（布尔、字符串、数字）。

**示例：**
```javascript
['my_new_setting', false], // 新增布尔型设置项
['my_new_api_key', ''],    // 新增字符串型设置项
```

**检查点：**
- [ ] 新配置项已添加到 `DEFAULT_VALUES`
- [ ] 配置 key 命名符合 `snake_case`
- [ ] 默认值类型正确

---

### 步骤 2：模板变量（templates.js）

**文件：** `src/shared/templates.js`

**操作：**
- 在 `videoSettings` 模板字符串中，为新增的设置项添加模板变量占位符，格式为 `[[VARIABLE_NAME]]`。
- 变量名使用全大写 + 下划线。
- 如果设置项需要条件显示（如根据其他设置项的值显示/隐藏），需添加 `style="display:[[VARIABLE_STYLE]]"` 控制。

**示例：**
```html
<div class="adjustment-form-item" id="MyNewSettingContainer" style="display:[[MYNEWSETTINGSTYLE]]">
  <label>我的新设置</label>
  <input id="MyNewSetting" class="adjustment-input" value="[[MYNEWSETTING]]">
</div>
```

**检查点：**
- [ ] 模板中已添加对应的 `[[VARIABLE_NAME]]` 占位符
- [ ] 变量名全大写，与 config key 对应
- [ ] 如需条件显示，已添加 `style="display:..."` 控制

---

### 步骤 3：元素选择器注册（element-selectors.js）

**文件：** `src/shared/element-selectors.js`

**操作：**
- 在 `selectors` 对象中，为新增的 DOM 元素添加选择器映射。
- key 使用驼峰命名（CamelCase），与模板中的 `id` 对应。
- value 使用 CSS 选择器字符串，通常为 `#ElementId`。

**示例：**
```javascript
MyNewSetting: '#MyNewSetting',
MyNewSettingContainer: '#MyNewSettingContainer',
```

**⚠️ 重要：** 任何需要在 JavaScript 中通过 `elementSelectors` 获取的 DOM 元素，都必须在此注册！否则会在控制台输出错误：
```
未注册的选择器: "XXX"，请先在 element-selectors.js 中定义或在 SelectorRegistry 中注册
```

**检查点：**
- [ ] 新增 DOM 元素的 id 已在 `selectors` 对象中注册
- [ ] 选择器 key 使用驼峰命名
- [ ] 选择器 value 正确对应模板中的 id

---

### 步骤 4：渲染时替换模板变量（settings.component.js）

**文件：** `src/components/settings.component.js`

**操作：**
- 在 `renderVideoSettings` 方法中，从 `this.userConfigs` 读取配置值。
- 在 `getTemplates.replace('videoSettings', { ... })` 调用中，添加新的模板变量替换。

**示例：**
```javascript
const videoSettings = getTemplates.replace('videoSettings', {
  // ... 其他变量
  MYNEWSETTING: this.userConfigs.my_new_setting,
  MYNEWSETTINGSTYLE: this.userConfigs.my_new_setting ? 'flex' : 'none',
})
```

**检查点：**
- [ ] `renderVideoSettings` 中已读取新配置值
- [ ] `getTemplates.replace` 中已添加新变量映射
- [ ] 条件显示逻辑正确（如 `style` 控制）

---

### 步骤 5：事件监听绑定（settings.component.js）

**文件：** `src/components/settings.component.js`

**操作：**
- 在 `initVideoSettingsEventListeners` 方法中，通过 `elementSelectors.batch` 批量获取新增元素。
- 为新增元素添加 `change` / `click` 等事件监听。
- 在事件回调中，使用 `storageService.userSet` 保存配置，并更新 `this.userConfigs`。

**示例：**
```javascript
const batchSelectors = [
  // ... 其他选择器
  'MyNewSetting',
  'MyNewSettingContainer',
]
const elements = await elementSelectors.batch(batchSelectors)
// 按顺序解构
const elementsMap = {
  // ... 其他元素
  MyNewSetting: elements[20],
  MyNewSettingContainer: elements[21],
}
const { /* ... */, MyNewSetting, MyNewSettingContainer } = elementsMap

// 绑定事件
addEventListenerToElement(MyNewSetting, 'change', async e => {
  const value = e.target.value.trim()
  await storageService.userSet('my_new_setting', value)
  this.userConfigs.my_new_setting = value
})
```

**检查点：**
- [ ] 新元素已加入 `batchSelectors` 数组
- [ ] `elementsMap` 中已映射新元素
- [ ] 已解构出新元素变量
- [ ] 已绑定对应的事件监听
- [ ] 事件回调中已调用 `storageService.userSet` 保存配置
- [ ] 事件回调中已更新 `this.userConfigs`

---

### 步骤 6：构建验证

**命令：**
```bash
npm run build
```

**检查点：**
- [ ] 构建无错误（no errors）
- [ ] 构建无警告（理想情况，如有警告需评估是否可接受）

---

## 三、常见问题速查

### Q1: 控制台报错 "未注册的选择器"
**原因：** `element-selectors.js` 中未注册该选择器。
**解决：** 按步骤 3 注册选择器。

### Q2: 修改设置后刷新页面，设置未保存
**原因：** 事件监听中未调用 `storageService.userSet`，或 `config.service.js` 中无默认值。
**解决：** 检查步骤 1 和步骤 5。

### Q3: 设置项显示/隐藏逻辑不生效
**原因：** 模板中未添加 `style="display:..."` 控制，或 `settings.component.js` 中未传入对应的 style 变量。
**解决：** 检查步骤 2 和步骤 4。

### Q4: 模板变量未被替换
**原因：** `getTemplates.replace` 调用中遗漏了该变量。
**解决：** 检查步骤 4。

---

## 四、修改流程图

```
新增/修改设置项
    │
    ▼
┌─────────────────────────┐
│ 1. config.service.js    │  ← 添加默认值
│    DEFAULT_VALUES       │
└─────────────────────────┘
    │
    ▼
┌─────────────────────────┐
│ 2. templates.js         │  ← 添加模板变量占位符
│    videoSettings        │
└─────────────────────────┘
    │
    ▼
┌─────────────────────────┐
│ 3. element-selectors.js │  ← 注册 DOM 选择器 ⚠️ 最容易遗漏
│    selectors            │
└─────────────────────────┘
    │
    ▼
┌─────────────────────────┐
│ 4. settings.component.js│  ← 渲染时替换变量
│    renderVideoSettings  │
└─────────────────────────┘
    │
    ▼
┌─────────────────────────┐
│ 5. settings.component.js│  ← 绑定事件监听
│    initVideoSettings... │
└─────────────────────────┘
    │
    ▼
┌─────────────────────────┐
│ 6. npm run build        │  ← 验证构建
└─────────────────────────┘
```

---

## 五、示例：完整的新增设置项流程

假设要新增一个「自定义主题色」设置项：

### 5.1 config.service.js
```javascript
['custom_theme_color', '#00a1d6'], // 自定义主题色
```

### 5.2 templates.js
```html
<div class="adjustment-form-item">
  <div class="adjustment-form-item-content">
    <label>自定义主题色</label>
    <input id="CustomThemeColor" class="adjustment-input" value="[[CUSTOMTHEMECOLOR]]">
  </div>
</div>
```

### 5.3 element-selectors.js
```javascript
CustomThemeColor: '#CustomThemeColor',
```

### 5.4 settings.component.js（渲染）
```javascript
const videoSettings = getTemplates.replace('videoSettings', {
  // ... 其他变量
  CUSTOMTHEMECOLOR: this.userConfigs.custom_theme_color,
})
```

### 5.5 settings.component.js（事件）
```javascript
const batchSelectors = [
  // ... 其他选择器
  'CustomThemeColor',
]
const elements = await elementSelectors.batch(batchSelectors)
const elementsMap = {
  // ... 其他元素
  CustomThemeColor: elements[40],
}
const { /* ... */, CustomThemeColor } = elementsMap

addEventListenerToElement(CustomThemeColor, 'change', async e => {
  const value = e.target.value.trim()
  await storageService.userSet('custom_theme_color', value)
  this.userConfigs.custom_theme_color = value
})
```

### 5.6 构建验证
```bash
npm run build
```

---

## 六、注意事项

1. **命名规范：**
   - config key：`snake_case`（如 `my_new_setting`）
   - 模板变量：`UPPER_SNAKE_CASE`（如 `[[MYNEWSETTING]]`）
   - 选择器 key：`CamelCase`（如 `MyNewSetting`）
   - DOM id：`CamelCase`（如 `MyNewSetting`）

2. **最容易遗漏的步骤：**
   - `element-selectors.js` 中注册选择器（步骤 3）
   - `initVideoSettingsEventListeners` 中添加到 `batchSelectors`（步骤 5）

3. **批量获取元素的顺序：**
   - `batchSelectors` 数组中的顺序必须与 `elementsMap` 中的顺序一致，否则解构会错位。

4. **条件显示：**
   - 如果设置项需要根据其他设置项的值显示/隐藏，模板中需使用 `style="display:[[VARIABLE_STYLE]]"`，并在 `renderVideoSettings` 中传入对应的 style 变量。

---

**最后更新：** 2026-05-21

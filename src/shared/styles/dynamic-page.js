export const dynamicPageStyles = {
    popover: `
        #DynamicSettingsPopoverTitle {
            margin-bottom: var(--adj-space-lg);
            text-align: center;
            font-weight: 700;
            font-size: var(--adj-font-xxl);
        }

        #DynamicSettingsPopover #DynamicSettingsPopoverTips {
            margin-top: var(--adj-space-sm);
        }

        /* 表单内边距由 .adjustment-form 统一提供（挂载点本身即该容器），
           此处不要再给挂载点加 padding，否则会出现双重内边距 */
    `
}

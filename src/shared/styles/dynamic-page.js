import { theme } from '../theme'

export const dynamicPageStyles = {
    popover: `
        #DynamicSettingsPopoverTitle {
            margin-bottom: ${theme.spacing.lg};
            text-align: center;
            font-weight: 700;
            font-size: ${theme.fontSize.xxl};
        }

        #DynamicSettingsPopover #DynamicSettingsPopoverTips {
            margin-top: ${theme.spacing.sm};
        }
    `
}

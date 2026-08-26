// 全局事件名：跨模块经 eventBus 协调，集中定义避免拼写错误导致监听失效
export const EVENT_NAMES = {
    APP_READY: 'app:ready',
    CONFIG_CHANGED: 'config:changed',
    LOGGER_SHOW: 'logger:show',
    VIDEO_CANPLAYTHROUGH: 'video:canplaythrough',
    VIDEO_PLAYER_MODE_SELECTED: 'video:playerModeSelected',
    VIDEO_START_OTHER_FUNCTIONS: 'video:startOtherFunctions',
    VIDEO_WEBFULL_PLAYER_MODE_UNLOCK: 'video:webfullPlayerModeUnlock',
    MODULE_REGISTERED: 'module:registered',
    MODULE_UNLOADED: 'module:unloaded',
    MODULE_FALLBACK: 'module:fallback',
    MODULE_ERROR: 'module:error',
    SYSTEM_INIT_START: 'system:init-start',
    SYSTEM_INIT_SUCCESS: 'system:init-success',
    SYSTEM_INIT_FAIL: 'system:init-fail',
    NETWORK_OFFLINE: 'network:offline'
}
// 浏览器存储键：键名跨文件复用，集中定义避免不一致
export const STORAGE_KEYS = {
    SESSION_LAST_PLAYER_MODE: 'bili_last_player_mode',
    SESSION_MODE_COOLDOWN: 'bili_mode_cooldown',
    SESSION_LAST_SUBTITLE_STATE: 'bili_last_subtitle_state',
    SESSION_VIDEO_INFO: 'bilibili_video_info',
    LOCAL_PLAYBACK_PROGRESS: 'bili_adjustment_playback_progress'
}

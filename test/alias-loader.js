// 预加载入口：注册 '@/' 别名解析 hook（--import 指定，随 --test 子进程继承）
import { register } from 'node:module'
register('./hooks.js', import.meta.url)

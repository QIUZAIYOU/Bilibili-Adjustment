// ==UserScript==
// @name         哔哩哔哩（bilibili.com）调整
// @namespace    哔哩哔哩（bilibili.com）调整
// @version      2.2.1
// @author       QIAN
// @description  一、首页新增推荐视频历史记录(仅记录前6个推荐位中的非广告内容)，以防误点刷新错过想看的视频。二、动态页调整：默认显示"投稿视频"内容，可自行设置URL以免未来URL发生变化。三、播放页调整：1.自动定位到播放器（进入播放页，可自动定位到播放器，可设置偏移量及是否在点击主播放器时定位）；2.可设置播放器默认模式；3.可设置是否自动选择最高画质；4.新增快速返回播放器漂浮按钮；5.新增点击评论区时间锚点可快速返回播放器；6.网页全屏模式解锁(网页全屏模式下可滚动查看评论，并在播放器控制栏新增快速跳转至评论区按钮)；7.将视频简介内容优化后插入评论区或直接替换原简介区内容(替换原简介中固定格式的静态内容为跳转链接)；8.视频播放过程中跳转指定时间节点至目标时间节点(可用来跳过片头片尾及中间广告等)；9.新增点击视频合集、下方推荐视频、结尾推荐视频卡片快速返回播放器；
// @license      GPL-3.0 License
// @copyright    QIAN
// @match        *://www.bilibili.com/*
// @match        *://www.bilibili.com/video/*
// @match        *://www.bilibili.com/bangumi/play/*
// @match        *://www.bilibili.com/list/*
// @match        *://t.bilibili.com/*
// @require      https://cdn.jsdelivr.net/npm/systemjs@6.15.1/dist/system.min.js
// @require      https://cdn.jsdelivr.net/npm/systemjs@6.15.1/dist/extras/named-register.min.js
// @require      data:application/javascript,%3B(typeof%20System!%3D'undefined')%26%26(System%3Dnew%20System.constructor())%3B
// @grant        unsafeWindow
// ==/UserScript==
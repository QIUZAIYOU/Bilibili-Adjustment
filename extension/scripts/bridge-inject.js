/**
 * Bilibili-Adjustment — 桥接 API (在 MAIN world 中运行)
 *
 * 通过 window.postMessage 与 ISOLATED world 的 content script 通信，
 * 间接调用 chrome.runtime.sendMessage → background.js
 *
 * postMessage 是 Chrome 扩展中 ISOLATED ↔ MAIN world
 * 跨世界通信的标准方式，比 CustomEvent 更可靠。
 */
;(function(){
  'use strict'

  if (window.__biliExt && window.__biliExt.bridge) return
  window.__biliExt = window.__biliExt || {}

  var _reqId = 0
  var _pending = {}

  // 监听来自 ISOLATED world 的响应 (通过 postMessage)
  window.addEventListener('message', function(event) {
    if (!event.data || event.data.source !== '__biliExt' || event.data.type !== 'response') return

    var resolver = _pending[event.data.requestId]
    if (resolver) {
      delete _pending[event.data.requestId]
      if (event.data.response && event.data.response.error) {
        resolver.reject(new Error(event.data.response.error))
      } else {
        resolver.resolve(event.data.response)
      }
    }
  })

  // 发送请求到 ISOLATED world，由 content script 转发到 background
  // 5 秒超时防止挂起
  function _send(messageType, payload) {
    console.log('[BiliAdjust][Bridge] MAIN 发送请求: ' + messageType, payload)
    return new Promise(function(resolve, reject) {
      var requestId = ++_reqId
      var timeout = setTimeout(function() {
        delete _pending[requestId]
        reject(new Error('bridge timeout: ' + messageType))
      }, 5000)
      _pending[requestId] = {
        resolve: function(v) { clearTimeout(timeout); resolve(v) },
        reject: function(e) { clearTimeout(timeout); reject(e) }
      }
      window.postMessage({
        source: '__biliExt',
        type: 'request',
        requestId: requestId,
        messageType: messageType,
        payload: payload || {}
      }, '*')
    })
  }

  window.__biliExt.bridge = {
    _send: _send,
    getConfig: function(k) { return _send('config:get',{key:k}).then(function(r){return r && r.value}) },
    setConfig: function(k,v) { return _send('config:set',{key:k,value:v}) },
    getAllConfigs: function() { return _send('config:getAll').then(function(r){return r && r.configs}) },
    removeConfig: function(k) { return _send('config:remove',{key:k}) },
    resetConfig: function() { return _send('config:reset') },
    getHistory: function() { return _send('history:get').then(function(r){return r && r.items}) },
    addHistoryItem: function(item) { return _send('history:add',{item:item}).then(function(r){return r && r.items}) },
    clearHistory: function() { return _send('history:clear') },
    searchHistory: function(q) { return _send('history:search',{query:q}).then(function(r){return r && r.items}) },
    checkUpdate: function(v) { return _send('update:check',{currentVersion:v}) },
    aiChat: function(p,m,msgs,key,url) { return _send('ai:chat',{provider:p,model:m,messages:msgs,apiKey:key,customBaseUrl:url}) },
    validateAiKey: function(p,key) { return _send('ai:validateKey',{provider:p,apiKey:key}) },
    getAiModels: function(p,key) { return _send('ai:getModels',{provider:p,apiKey:key}) },
    getCache: function(k) { return _send('cache:get',{key:k}).then(function(r){return r && r.value}) },
    setCache: function(k,v) { return _send('cache:set',{key:k,value:v}) },
  }
})()

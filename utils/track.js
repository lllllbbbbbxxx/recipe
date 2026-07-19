// 轻量埋点：写入云数据库 events 集合。异步、静默失败，绝不影响用户。
const dishStore = require('./dish-store')

const APP_VERSION = '1.0.9'   // 随版本更新，用于按版本对比指标

// 视为"关键动作"的事件——会话内首个关键动作会补发一条 first_action
const KEY_ACTIONS = [
  'draw_click', 'dish_add_success', 'dish_import_done',
  'fridge_add', 'recommend_accept', 'generate_menu', 'meal_decided', 'meal_cooked',
  'order_submit',
]

let sessionId = ''
let sessionStart = 0
let firstActionLogged = false
let actedThisSession = false

function genId() {
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
}

// 每次冷启动/切前台调用，开启新会话
function startSession() {
  sessionId = genId()
  sessionStart = Date.now()
  firstActionLogged = false
  actedThisSession = false
}

function getSessionInfo() {
  return { sessionId, sessionStart, actedThisSession }
}

function currentPage() {
  try {
    const pages = getCurrentPages()
    const p = pages[pages.length - 1]
    return p ? p.route : ''
  } catch (e) { return '' }
}

function write(event, props, openid) {
  try {
    if (!dishStore.initCloud()) return
    wx.cloud.database().collection('events').add({
      data: Object.assign({
        event,
        openid: openid || '',
        sessionId,
        ts: Date.now(),
        page: currentPage(),
        appVersion: APP_VERSION,
      }, props || {}),
    }).catch(() => {})
  } catch (e) {}
}

function track(event, props) {
  try {
    if (!sessionId) startSession()
    const app = getApp()
    const openid = (app && app.globalData && app.globalData.openid) || ''

    // 关键动作 → 标记本会话已行动，并补发首个 first_action
    if (KEY_ACTIONS.indexOf(event) >= 0) {
      actedThisSession = true
      if (!firstActionLogged) {
        firstActionLogged = true
        write('first_action', { action: event, msSinceOpen: Date.now() - sessionStart }, openid)
      }
    }
    write(event, props || {}, openid)
  } catch (e) {}
}

module.exports = { track, startSession, getSessionInfo }

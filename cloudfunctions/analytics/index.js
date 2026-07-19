const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 读取全部 events（分页，管理员权限，最多 2 万条）
async function fetchAllEvents() {
  const MAX = 20000, PAGE = 1000
  const total = Math.min((await db.collection('events').count()).total, MAX)
  const tasks = []
  for (let i = 0; i < total; i += PAGE) {
    tasks.push(db.collection('events').skip(i).limit(PAGE).get())
  }
  const res = await Promise.all(tasks)
  return res.reduce((all, r) => all.concat(r.data || []), [])
}

const uniq = arr => Array.from(new Set(arr))
const rate = (a, b) => (b ? +(a / b).toFixed(3) : 0)
function median(nums) {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}
function countBy(arr, keyFn) {
  const m = {}
  arr.forEach(x => { const k = keyFn(x); if (k != null) m[k] = (m[k] || 0) + 1 })
  return m
}

exports.main = async (event) => {
  let events
  try {
    events = await fetchAllEvents()
  } catch (err) {
    return { error: String(err), hint: '确认已创建 events 集合' }
  }

  // 留存/漏斗永远用全量；Q1-Q7 可用 days 参数圈定"近 N 天"
  const allEvents = events
  const days = event && Number(event.days)
  if (days && days > 0) {
    const cutoff = Date.now() - days * 86400000
    events = events.filter(e => (e.ts || 0) >= cutoff)
  }

  const of = name => events.filter(e => e.event === name)
  const sessionsOf = list => uniq(list.map(e => e.sessionId).filter(Boolean))

  const appOpens = of('app_open')
  const openSessions = sessionsOf(appOpens)
  const users = uniq(events.map(e => e.openid).filter(Boolean))

  // ── Q1 用户知道该干什么吗 ──
  const firstActions = of('first_action')
  const appHides = of('app_hide')
  const q1 = {
    会话数: openSessions.length,
    有首个动作的会话占比: rate(sessionsOf(firstActions).length, openSessions.length),
    首动作耗时中位数秒: +(median(firstActions.map(e => e.msSinceOpen || 0)) / 1000).toFixed(1),
    空转退出占比: rate(appHides.filter(e => e.actedThisSession === false).length, appHides.length),
  }

  // ── Q2 愿意录菜谱吗 ──
  const manualAdd = of('dish_add_success')
  const importDone = of('dish_import_done')
  const q2 = {
    手动录入过菜谱的人数: uniq(manualAdd.map(e => e.openid)).length,
    手动录入总次数: manualAdd.length,
    一键导入总道数: importDone.reduce((s, e) => s + (e.count || 0), 0),
    手动占比: rate(manualAdd.length, manualAdd.length + importDone.length),
  }

  // ── Q3 库存是不是核心 ──
  const fridgeAdd = of('fridge_add')
  const fridgeUsers = uniq(fridgeAdd.map(e => e.openid).filter(Boolean))
  // 维护库存 vs 不维护 的推荐接受率对比
  const acceptUsers = uniq(of('recommend_accept').map(e => e.openid).filter(Boolean))
  const q3 = {
    录过库存的人数: fridgeUsers.length,
    录库存人数占比: rate(fridgeUsers.length, users.length),
    来源分布: countBy(fridgeAdd, e => e.source),
    改数量次数: of('fridge_qty_edit').length,
    维护库存用户里接受过推荐的占比: rate(fridgeUsers.filter(u => acceptUsers.includes(u)).length, fridgeUsers.length),
    未维护用户里接受过推荐的占比: rate(users.filter(u => !fridgeUsers.includes(u) && acceptUsers.includes(u)).length, Math.max(users.length - fridgeUsers.length, 1)),
    // P0 闭环：做完菜确认扣库存的占比（决定了一顿的多少会真正回写库存）
    做完菜扣库存率: rate(sessionsOf(of('meal_cooked')).length, sessionsOf(of('meal_decided')).length),
  }

  // ── Q4 / Q8 推荐价值 & 接受率 ──
  const drawViews = of('recommend_view').filter(e => e.type === 'draw')
  const drawAccepts = of('recommend_accept').filter(e => e.type === 'draw')
  const drawRedraws = of('recommend_redraw')
  // 按匹配度算接受率：把 accept 与同会话同 dishId 的 view.match 关联
  const viewMatch = {}
  drawViews.forEach(v => { viewMatch[v.sessionId + '|' + v.dishId] = v.match })
  const acceptMatchCount = countBy(drawAccepts, a => viewMatch[a.sessionId + '|' + a.dishId] || 'unknown')
  const viewMatchCount = countBy(drawViews, v => v.match)
  const acceptRateByMatch = {}
  Object.keys(viewMatchCount).forEach(m => { acceptRateByMatch[m] = rate(acceptMatchCount[m] || 0, viewMatchCount[m]) })
  const q4 = {
    抽卡接受率: rate(drawAccepts.length, drawViews.length),
    再抽率: rate(drawRedraws.length, drawViews.length),
    生成菜单次数: of('recommend_view').filter(e => e.type === 'generate').length,
    按匹配度的接受率: acceptRateByMatch,  // ready/almost/miss，验证库存匹配是否真的提升接受
  }

  // ── Q5 用户为了什么来 ──
  const q5 = {
    首个动作分布: countBy(firstActions, e => e.action),
    页面访问分布: countBy(of('page_view'), e => e.page),
    完成决定吃什么的会话占比: rate(sessionsOf(of('meal_decided')).length, openSessions.length),
  }

  // ── Q6 数量（取每人最近一次 app_open 快照）──
  const latestByUser = {}
  appOpens.forEach(e => { if (!latestByUser[e.openid] || e.ts > latestByUser[e.openid].ts) latestByUser[e.openid] = e })
  const snaps = Object.values(latestByUser)
  const avg = (arr, f) => arr.length ? +(arr.reduce((s, x) => s + (f(x) || 0), 0) / arr.length).toFixed(1) : 0
  const q6 = {
    人均菜谱数: avg(snaps, e => e.dishCount),
    人均库存数: avg(snaps, e => e.fridgeCount),
    菜谱数为0的人数: snaps.filter(e => !e.dishCount).length,
    库存数为0的人数: snaps.filter(e => !e.fridgeCount).length,
  }

  // ── Q7 用户行为分类 ──
  const persona = { 决策型: 0, 囤货型: 0, 收藏型: 0, 沉默流失: 0 }
  users.forEach(u => {
    const ue = events.filter(e => e.openid === u)
    const decision = ue.filter(e => ['draw_click', 'recommend_redraw', 'recommend_accept', 'generate_menu', 'meal_decided'].includes(e.event)).length
    const stock = ue.filter(e => ['fridge_add', 'fridge_qty_edit'].includes(e.event)).length
    const collect = ue.filter(e => ['dish_add_success', 'dish_import_done'].includes(e.event)).length
    if (decision + stock + collect === 0) { persona.沉默流失++; return }
    if (stock >= decision && stock >= collect) persona.囤货型++
    else if (collect >= decision && collect >= stock) persona.收藏型++
    else persona.决策型++
  })

  // ── 留存与活跃（PRD 5.1 口径，恒用全量数据）──
  const DAY = 86400000
  const now = Date.now()
  const allOf = name => allEvents.filter(e => e.event === name)
  const byUser = {}
  allEvents.forEach(e => {
    if (!e.openid) return
    ;(byUser[e.openid] = byUser[e.openid] || []).push(e)
  })
  // 第 N 日留存：首个 app_open 后第 N 天（窗口 [(N-1)d, Nd)）仍有 app_open
  function retentionDayN(n) {
    let eligible = 0, retained = 0
    Object.keys(byUser).forEach(u => {
      const opens = byUser[u].filter(e => e.event === 'app_open').map(e => e.ts || 0)
      if (!opens.length) return
      const first = Math.min.apply(null, opens)
      if (now - first < n * DAY) return   // 还没到第 N 天，不计入分母
      eligible += 1
      if (opens.some(ts => ts >= first + (n - 1) * DAY && ts < first + n * DAY)) retained += 1
    })
    return { 达标人数: retained, 可评估人数: eligible, 留存率: rate(retained, eligible) }
  }
  const last7 = allEvents.filter(e => (e.ts || 0) >= now - 7 * DAY)
  const weeklyActiveUsers = uniq(last7.map(e => e.openid).filter(Boolean))
  const weeklyDecided = uniq(last7.filter(e => e.event === 'meal_decided').map(e => e.sessionId).filter(Boolean))
  const 留存与活跃 = {
    次日留存: retentionDayN(2),
    七日留存: retentionDayN(7),
    近7天活跃用户: weeklyActiveUsers.length,
    近7天决策次数: weeklyDecided.length,
    人均周决策次数: weeklyActiveUsers.length ? +(weeklyDecided.length / weeklyActiveUsers.length).toFixed(2) : 0,
  }

  // ── 裂变漏斗（menu_share → share_open → order_submit → 被分享者建库）──
  const shareOpens = allOf('share_open')
  const orderSubmits = allOf('order_submit')
  // 被分享者：首个事件即 share_open 的用户；转化 = 之后有建库行为
  const BUILD_EVENTS = ['dish_add_success', 'dish_import_done', 'fridge_add']
  let guestFirstUsers = 0, guestConverted = 0
  Object.keys(byUser).forEach(u => {
    const list = byUser[u].slice().sort((a, b) => (a.ts || 0) - (b.ts || 0))
    if (!list.length || list[0].event !== 'share_open') return
    guestFirstUsers += 1
    if (list.some(e => BUILD_EVENTS.indexOf(e.event) >= 0)) guestConverted += 1
  })
  const 裂变漏斗 = {
    发起分享次数: allOf('menu_share').length,
    链接打开次数: shareOpens.length,
    下单次数: orderSubmits.length,
    打开到下单率: rate(orderSubmits.length, shareOpens.length),
    被分享者人数: guestFirstUsers,
    被分享者建库转化率: rate(guestConverted, guestFirstUsers),
    厨师采纳订单次数: allOf('order_accept_to_menu').length,
  }

  // ── 近 14 天按天聚合（UTC+8）──
  function dayKey(ts) { return new Date((ts || 0) + 8 * 3600 * 1000).toISOString().slice(0, 10) }
  const 近14天 = {}
  allEvents.filter(e => (e.ts || 0) >= now - 14 * DAY).forEach(e => {
    const k = dayKey(e.ts)
    const d = (近14天[k] = 近14天[k] || { 打开: 0, 决策: 0, 做完: 0, 分享: 0, 链接打开: 0, 下单: 0 })
    if (e.event === 'app_open') d.打开 += 1
    else if (e.event === 'meal_decided') d.决策 += 1
    else if (e.event === 'meal_cooked') d.做完 += 1
    else if (e.event === 'menu_share') d.分享 += 1
    else if (e.event === 'share_open') d.链接打开 += 1
    else if (e.event === 'order_submit') d.下单 += 1
  })

  return {
    生成时间: new Date().toISOString(),
    统计范围: days && days > 0 ? `Q1-Q7 为近 ${days} 天；留存/漏斗为全量` : '全量',
    概览: { 事件总数: events.length, 用户数: users.length, 会话数: openSessions.length },
    留存与活跃,
    裂变漏斗,
    近14天,
    Q1_是否知道干什么: q1,
    Q2_愿不愿录菜谱: q2,
    Q3_库存是否核心: q3,
    Q4Q8_推荐价值与接受率: q4,
    Q5_为了什么来: q5,
    Q6_数量: q6,
    Q7_用户分类: persona,
  }
}

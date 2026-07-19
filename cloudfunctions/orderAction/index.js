// 订单写操作统一入口：管理员权限执行，服务端校验身份，客户端不再直写。
// action:
//   'create'  好友建单（含限频：每人每小时最多 10 单）
//   'update'  下单人改自己的单（selectedDishes/note）
//   'done'    厨师标记完成
//   'delete'  下单人或厨师删除（顺带清理头像文件）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const HOUR = 3600 * 1000

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { action, id } = event || {}
  if (!OPENID) return { ok: false, error: 'no openid' }

  const col = db.collection('orders')

  // ── 建单（限频 + 字段校验，服务端写入 _openid）──
  if (action === 'create') {
    const o = (event && event.order) || {}
    const chefOpenid = String(o.chefOpenid || '')
    const guestName = String(o.guestName || '').trim().slice(0, 20)
    const note = String(o.note || '').trim().slice(0, 100)
    const selectedDishes = Array.isArray(o.selectedDishes)
      ? o.selectedDishes.slice(0, 30).map(d => ({ id: String(d.id || ''), name: String(d.name || '').slice(0, 40) }))
      : []
    if (!chefOpenid || !guestName || !selectedDishes.length) return { ok: false, error: 'invalid order' }

    // 限频：该用户 1 小时内建单 ≥10 → 拒绝
    const recent = await col.where({ _openid: OPENID, createdAt: _.gt(Date.now() - HOUR) }).count()
    if (recent.total >= 10) return { ok: false, error: 'rate_limited' }

    const res = await col.add({
      data: {
        _openid: OPENID,   // 管理员写入需显式带上创建者
        chefOpenid,
        menuId: String(o.menuId || ''),
        guestName,
        guestAvatar: String(o.guestAvatar || ''),
        selectedDishes,
        note,
        status: 'pending',
        createdAt: Date.now(),
      },
    })
    return { ok: true, id: res._id }
  }

  // ── 其余操作都需要先取到订单 ──
  if (!id) return { ok: false, error: 'missing id' }
  let order
  try {
    const res = await col.doc(id).get()
    order = res && res.data
  } catch (e) {
    return { ok: false, error: 'not found' }
  }
  if (!order) return { ok: false, error: 'not found' }

  if (action === 'update') {
    if (order._openid !== OPENID) return { ok: false, error: 'not owner' }
    const selectedDishes = Array.isArray(event.selectedDishes)
      ? event.selectedDishes.slice(0, 30).map(d => ({ id: String(d.id || ''), name: String(d.name || '').slice(0, 40) }))
      : null
    if (!selectedDishes || !selectedDishes.length) return { ok: false, error: 'invalid dishes' }
    await col.doc(id).update({
      data: { selectedDishes, note: String(event.note || '').trim().slice(0, 100) },
    })
    return { ok: true }
  }

  if (action === 'done') {
    if (order.chefOpenid !== OPENID) return { ok: false, error: 'not chef' }
    await col.doc(id).update({ data: { status: 'done' } })
    return { ok: true }
  }

  if (action === 'delete') {
    if (order._openid !== OPENID && order.chefOpenid !== OPENID) {
      return { ok: false, error: 'not owner' }
    }
    await col.doc(id).remove()
    // 顺带清理订单头像文件，避免云存储垃圾累积
    if (order.guestAvatar && String(order.guestAvatar).indexOf('cloud://') === 0) {
      try { await cloud.deleteFile({ fileList: [order.guestAvatar] }) } catch (e) {}
    }
    return { ok: true }
  }

  return { ok: false, error: 'unknown action' }
}

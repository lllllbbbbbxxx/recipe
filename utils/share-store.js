// 分享菜单快照：每次分享把"当时选中的菜"冻结成一份，链接带 menuId，
// 好友只看到那一份；厨师可回顾历史分享并一键再分享。
const dishStore = require('./dish-store')

const COLLECTION = 'shared_menus'

function col() {
  dishStore.initCloud()
  return wx.cloud.database().collection(COLLECTION)
}

// 客户端同步生成一个可用作 menuId 的 key（分享那一刻就能拿到）
function genKey(openid) {
  return `${openid || 'anon'}-${Date.now()}-${Math.floor(Math.random() * 10000)}`
}

// 后台创建分享快照，不阻塞分享动作
function createSharedMenu(key, chefOpenid, dishes) {
  try {
    if (!dishStore.initCloud()) return
    col().add({
      data: {
        key,
        chefOpenid,
        dishes: dishes || [],
        count: (dishes || []).length,
        createdAt: Date.now(),
      },
    }).catch(() => {})
  } catch (e) {}
}

// 好友按 menuId 读取快照（集合需「所有用户可读」）
async function getSharedMenu(key) {
  try {
    const res = await col().where({ key }).limit(1).get()
    return (res.data && res.data[0]) || null
  } catch (e) {
    return null
  }
}

// 厨师读自己的分享记录
async function getMyShares(chefOpenid) {
  try {
    const res = await col().where({ chefOpenid }).orderBy('createdAt', 'desc').limit(50).get()
    return res.data || []
  } catch (e) {
    return []
  }
}

module.exports = { genKey, createSharedMenu, getSharedMenu, getMyShares }

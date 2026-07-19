const dishStore = require('./dish-store')
const freshnessUtils = require('./freshness-utils')
const amountUtils = require('./amount-utils')

const COLLECTION = 'fridge_items'
const STORAGE_KEY = 'fridge_items'

function getCollection() {
  dishStore.initCloud()
  return wx.cloud.database().collection(COLLECTION)
}

function normalizeItems(items) {
  const map = {}
  const list = items || []
  list.forEach(item => {
    // 数量拆成 数字 + 单位；老数据从 amount 里解析，新数据用 qty/unit
    const parsed = amountUtils.parseAmount(item.amount || '')
    const qty = (item.qty != null && item.qty !== '') ? String(item.qty) : parsed.qty
    const unit = (item.unit != null && item.unit !== '') ? String(item.unit) : parsed.unit
    const normalized = {
      id: String(item.id || item._id || Date.now()),
      cloudId: item.cloudId || item._id || '',
      name: item.name || '',
      qty,
      unit,
      amount: amountUtils.formatAmount(qty, unit),
      category: item.category || '其他',
      staple: !!item.staple,
      source: item.source || 'manual',
      addedAt: item.addedAt || item.createdAt || 0,
      shelfLifeDays: item.shelfLifeDays,
      expireAt: item.expireAt || 0,
      createdAt: item.createdAt || 0,
      updatedAt: item.updatedAt || 0,
    }
    if (!normalized.name) return
    const enriched = freshnessUtils.enrichItem(normalized, normalized.updatedAt || Date.now())
    // 按「名字」去重：同名食材只保留一条（最新更新的），自动合并历史重复
    const key = enriched.name
    const old = map[key]
    if (!old || (enriched.updatedAt || 0) >= (old.updatedAt || 0)) {
      map[key] = enriched
    }
  })
  return Object.keys(map).map(k => map[k])
}

function getCachedItems() {
  return normalizeItems(wx.getStorageSync(STORAGE_KEY) || [])
}

function setCachedItems(items) {
  const normalized = normalizeItems(items)
  wx.setStorageSync(STORAGE_KEY, normalized)
  return normalized
}

async function getCloudItems() {
  const res = await getCollection()
    .orderBy('updatedAt', 'desc')
    .limit(200)
    .get()
  return normalizeItems(res.data || [])
}

function toCloudData(item) {
  const qty = item.qty != null ? String(item.qty) : ''
  const unit = item.unit != null ? String(item.unit) : ''
  return {
    id: String(item.id),
    name: item.name,
    qty,
    unit,
    amount: amountUtils.formatAmount(qty, unit) || item.amount || '',
    category: item.category || '其他',
    staple: !!item.staple,
    source: item.source || 'manual',
    addedAt: item.addedAt || item.createdAt || Date.now(),
    shelfLifeDays: item.shelfLifeDays != null ? item.shelfLifeDays : freshnessUtils.inferShelfLifeDays(item),
    expireAt: item.expireAt || 0,
    createdAt: item.createdAt || Date.now(),
    updatedAt: item.updatedAt || Date.now(),
  }
}

async function saveCloudItem(item) {
  const data = toCloudData(item)
  const collection = getCollection()
  if (item.cloudId) {
    await collection.doc(item.cloudId).update({ data })
    return { ...data, cloudId: item.cloudId }
  }

  // 按名字查已有文档：有则更新，无则新增，杜绝同名重复
  const found = await collection.where({ name: data.name }).limit(1).get()
  if (found.data && found.data.length) {
    const cloudId = found.data[0]._id
    await collection.doc(cloudId).update({ data })
    return { ...data, cloudId }
  }

  const res = await collection.add({ data })
  return { ...data, cloudId: res._id }
}

async function getItems() {
  const cached = getCachedItems()
  if (!dishStore.initCloud()) return cached

  try {
    const cloudItems = await getCloudItems()
    setCachedItems(cloudItems)
    return cloudItems
  } catch (err) {
    console.warn('get fridge items failed, using local cache', err)
    return cached
  }
}

async function saveItem(item) {
  const now = Date.now()
  let nextItem = {
    ...item,
    id: String(item.id || ('f-' + (item.name || '')) || now),
    source: item.source || 'manual',
    addedAt: item.addedAt || item.createdAt || now,
    createdAt: item.createdAt || now,
    updatedAt: now,
  }
  nextItem = freshnessUtils.enrichItem(nextItem, now)

  try {
    if (dishStore.initCloud()) {
      nextItem = await saveCloudItem(nextItem)
    }
  } catch (err) {
    console.warn('save fridge item failed, saving local only', err)
  }

  // setCachedItems 会按名字归一去重
  return setCachedItems([...getCachedItems(), nextItem]).find(i => i.name === nextItem.name) || nextItem
}

/**
 * 批量添加：本地即时写入（秒开），云端并行后台 upsert（不阻塞 UI）。
 * 用名字型稳定 id，保证同名不产生重复。返回合并去重后的列表。
 */
function saveItemsBatch(rawItems) {
  const now = Date.now()
  const incoming = (rawItems || [])
    .filter(it => it && it.name)
    .map(it => freshnessUtils.enrichItem({
      ...it,
      id: String(it.id || ('f-' + it.name)),
      source: it.source || 'manual',
      amount: it.amount || '',
      addedAt: it.addedAt || now,
      createdAt: it.createdAt || now,
      updatedAt: now,
    }, now))

  // 本地立即写入（同步、瞬间完成）
  const merged = setCachedItems([...getCachedItems(), ...incoming])

  // 云端并行 upsert，后台进行，不 await
  if (incoming.length && dishStore.initCloud()) {
    Promise.all(
      incoming.map(it => saveCloudItem(it).catch(err => console.warn('cloud save fridge fail', it.name, err)))
    ).catch(() => {})
  }
  return merged
}

async function deleteItem(id) {
  const cached = getCachedItems()
  const item = cached.find(item => String(item.id) === String(id))
  const name = item ? item.name : null

  try {
    if (dishStore.initCloud() && name) {
      const collection = getCollection()
      // 按名字删除云端所有同名文档，彻底清掉历史重复
      const found = await collection.where({ name }).get()
      await Promise.all((found.data || []).map(d => collection.doc(d._id).remove().catch(() => {})))
    }
  } catch (err) {
    console.warn('delete fridge item failed, deleting local only', err)
  }

  return setCachedItems(
    cached.filter(item => (name ? item.name !== name : String(item.id) !== String(id)))
  )
}

// 切换是否常备（左滑按钮用）
function setStaple(id, staple) {
  const cached = getCachedItems()
  const item = cached.find(i => String(i.id) === String(id))
  if (!item) return cached
  return saveItemsBatch([{ ...item, staple: !!staple }])
}

// 更新某个食材的 数字/单位（行内两框编辑用）
function updateAmount(id, qty, unit) {
  const cached = getCachedItems()
  const item = cached.find(i => String(i.id) === String(id))
  if (!item) return cached
  return saveItemsBatch([{ ...item, qty: String(qty || ''), unit: String(unit || '') }])
}

/**
 * 做完菜扣减库存。ops: [{ id, remove?:true, qty?, unit? }]
 *  remove=true 直接移除；否则把 qty/unit 更新为剩余量。
 *  本地即时 + 云端后台。
 */
function applyConsumption(ops) {
  const list = ops || []
  const removeIds = new Set(list.filter(o => o.remove).map(o => String(o.id)))
  const updateMap = {}
  list.filter(o => !o.remove).forEach(o => { updateMap[String(o.id)] = o })

  const now = Date.now()
  const next = getCachedItems().map(item => {
    const id = String(item.id)
    if (removeIds.has(id)) return null
    const u = updateMap[id]
    if (u) return freshnessUtils.enrichItem({ ...item, qty: String(u.qty || ''), unit: String(u.unit || item.unit || ''), updatedAt: now }, now)
    return item
  }).filter(Boolean)

  // 云端后台：删除的 remove、更新的 upsert
  if (dishStore.initCloud()) {
    const collection = getCollection()
    const removeNames = getCachedItems().filter(i => removeIds.has(String(i.id))).map(i => i.name)
    Promise.all([
      ...removeNames.map(name => collection.where({ name }).get()
        .then(r => Promise.all((r.data || []).map(d => collection.doc(d._id).remove().catch(() => {})))).catch(() => {})),
      ...Object.keys(updateMap).map(id => {
        const item = next.find(i => String(i.id) === id)
        return item ? saveCloudItem(item).catch(() => {}) : Promise.resolve()
      }),
    ]).catch(() => {})
  }
  return setCachedItems(next)
}

// 批量按名字移除（做完菜扣减库存用）：本地即时 + 云端后台删同名文档
function removeItemsByName(names) {
  const set = new Set(names || [])
  if (!set.size) return getCachedItems()
  const cached = getCachedItems()
  if (dishStore.initCloud()) {
    const collection = getCollection()
    Promise.all([...set].map(name =>
      collection.where({ name }).get()
        .then(r => Promise.all((r.data || []).map(d => collection.doc(d._id).remove().catch(() => {}))))
        .catch(() => {})
    )).catch(() => {})
  }
  return setCachedItems(cached.filter(i => !set.has(i.name)))
}

module.exports = {
  getItems,
  getCachedItems,
  saveItem,
  saveItemsBatch,
  deleteItem,
  removeItemsByName,
  setStaple,
  updateAmount,
  applyConsumption,
  normalizeItems,
}

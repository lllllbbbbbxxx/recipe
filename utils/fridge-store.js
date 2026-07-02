const dishStore = require('./dish-store')
const freshnessUtils = require('./freshness-utils')

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
    const normalized = {
      id: String(item.id || item._id || Date.now()),
      cloudId: item.cloudId || item._id || '',
      name: item.name || '',
      amount: item.amount || '',
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
    const key = enriched.id
    const old = map[key]
    if (!old || enriched.updatedAt >= old.updatedAt) {
      map[key] = enriched
    }
  })
  return Object.keys(map).map(id => map[id])
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
  return {
    id: String(item.id),
    name: item.name,
    amount: item.amount || '',
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

  const found = await collection.where({ id: data.id }).limit(1).get()
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
    id: String(item.id || now),
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

  const cached = getCachedItems()
  const exists = cached.some(item => String(item.id) === nextItem.id)
  const items = exists
    ? cached.map(item => (String(item.id) === nextItem.id ? nextItem : item))
    : [...cached, nextItem]
  setCachedItems(items)
  return nextItem
}

async function deleteItem(id) {
  const cached = getCachedItems()
  const item = cached.find(item => String(item.id) === String(id))

  try {
    if (dishStore.initCloud()) {
      const collection = getCollection()
      if (item && item.cloudId) {
        await collection.doc(item.cloudId).remove()
      } else {
        const found = await collection.where({ id: String(id) }).limit(1).get()
        if (found.data && found.data.length) {
          await collection.doc(found.data[0]._id).remove()
        }
      }
    }
  } catch (err) {
    console.warn('delete fridge item failed, deleting local only', err)
  }

  return setCachedItems(cached.filter(item => String(item.id) !== String(id)))
}

module.exports = {
  getItems,
  getCachedItems,
  saveItem,
  deleteItem,
  normalizeItems,
}

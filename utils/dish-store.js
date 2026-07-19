const CLOUD_ENV = 'cloud1-d2g1doo8z695561f5'
const COLLECTION = 'dishes'
const STORAGE_KEY = 'dishes'
const STORAGE_INITIALIZED_KEY = 'dishes_initialized'
const CLOUD_MIGRATED_KEY = 'dishes_cloud_migrated'

const defaultDishes = [
  { id: '1', name: '番茄炒蛋', mealRole: '素菜', tags: ['快手', '家常'], ingredients: [{ name: '鸡蛋', amount: '3个' }, { name: '番茄', amount: '2个' }, { name: '盐', amount: '适量' }] },
  { id: '2', name: '蒜蓉炒菜心', mealRole: '素菜', tags: ['快手', '清淡'], ingredients: [{ name: '菜心', amount: '300g' }, { name: '大蒜', amount: '5瓣' }, { name: '盐', amount: '适量' }] },
  { id: '3', name: '红烧肉', mealRole: '荤菜', tags: ['下饭', '鲜香'], ingredients: [{ name: '五花肉', amount: '500g' }, { name: '生抽', amount: '3勺' }, { name: '老抽', amount: '1勺' }, { name: '糖', amount: '1勺' }] },
  { id: '4', name: '麻婆豆腐', mealRole: '荤菜', tags: ['辣', '下饭'], ingredients: [{ name: '豆腐', amount: '1块' }, { name: '猪肉末', amount: '50g' }, { name: '豆瓣酱', amount: '2勺' }] },
  { id: '5', name: '西红柿鸡蛋汤', mealRole: '汤', tags: ['汤', '清淡'], ingredients: [{ name: '番茄', amount: '1个' }, { name: '鸡蛋', amount: '2个' }, { name: '盐', amount: '适量' }] },
]

let cloudReady = false

function initCloud() {
  if (!wx.cloud) return false
  if (cloudReady) return true
  try {
    wx.cloud.init({
      env: CLOUD_ENV,
      traceUser: true,
    })
    cloudReady = true
    return true
  } catch (err) {
    console.warn('cloud init failed', err)
    return false
  }
}

function getCollection() {
  initCloud()
  return wx.cloud.database().collection(COLLECTION)
}

function normalizeDishes(dishes) {
  const map = {}
  const list = dishes || []
  list.forEach(dish => {
    const normalized = {
      id: String(dish.id || dish._id || Date.now()),
      cloudId: dish.cloudId || dish._id || '',
      name: dish.name || '',
      coverImage: dish.coverImage || dish.coverFileID || '',
      mealRole: dish.mealRole || inferMealRole(dish),
      tags: (dish.tags || []).slice(0, 2),
      ingredients: dish.ingredients || [],
      lastCooked: dish.lastCooked || 0,
      createdAt: dish.createdAt || 0,
      updatedAt: dish.updatedAt || 0,
    }
    const key = normalized.id
    const old = map[key]
    if (!old || normalized.updatedAt >= old.updatedAt) {
      map[key] = normalized
    }
  })
  return Object.keys(map).map(id => map[id])
}

function inferMealRole(dish) {
  const tags = dish.tags || []
  if (tags.includes('汤')) return '汤'
  if (tags.includes('清淡')) return '素菜'
  if (tags.includes('下饭') || tags.includes('辣') || tags.includes('鲜香')) return '荤菜'
  return ''
}

function getCachedDishes() {
  if (!wx.getStorageSync(STORAGE_INITIALIZED_KEY)) return normalizeDishes(defaultDishes)
  return normalizeDishes(wx.getStorageSync(STORAGE_KEY) || [])
}

function setCachedDishes(dishes) {
  const normalized = normalizeDishes(dishes)
  wx.setStorageSync(STORAGE_KEY, normalized)
  wx.setStorageSync(STORAGE_INITIALIZED_KEY, true)
  return normalized
}

async function getCloudDishes() {
  const res = await getCollection()
    .orderBy('updatedAt', 'desc')
    .limit(100)
    .get()
  cleanupDuplicateCloudDishes(res.data || [])
  return normalizeDishes(res.data || [])
}

function cleanupDuplicateCloudDishes(dishes) {
  const groups = {}
  dishes.forEach(dish => {
    const id = String(dish.id || dish._id)
    if (!groups[id]) groups[id] = []
    groups[id].push(dish)
  })

  Object.keys(groups).forEach(id => {
    const group = groups[id]
    if (group.length <= 1) return
    group
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(1)
      .forEach(dish => {
        if (!dish._id) return
        getCollection().doc(dish._id).remove().catch(err => {
          console.warn('cleanup duplicate dish failed', err)
        })
      })
  })
}

function toCloudData(dish) {
  return {
    id: String(dish.id),
    name: dish.name,
    coverImage: dish.coverImage || '',
    coverFileID: dish.coverImage || '',
    mealRole: dish.mealRole || '',
    tags: dish.tags || [],
    ingredients: dish.ingredients || [],
    lastCooked: dish.lastCooked || 0,
    createdAt: dish.createdAt || Date.now(),
    updatedAt: dish.updatedAt || Date.now(),
  }
}

async function saveCloudDish(dish) {
  const data = toCloudData(dish)
  const collection = getCollection()
  if (dish.cloudId) {
    await collection.doc(dish.cloudId).update({ data })
    return { ...data, cloudId: dish.cloudId }
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

async function deleteCloudDish(id, cloudId) {
  const collection = getCollection()
  if (cloudId) {
    await collection.doc(cloudId).remove()
    return
  }

  const found = await collection.where({ id: String(id) }).limit(1).get()
  if (found.data && found.data.length) {
    await collection.doc(found.data[0]._id).remove()
  }
}

async function uploadCoverIfNeeded(filePath, dishId) {
  if (!filePath || filePath.indexOf('cloud://') === 0 || filePath.indexOf('http') === 0) {
    return filePath || ''
  }
  if (!initCloud()) return filePath

  const extMatch = filePath.match(/\.([a-zA-Z0-9]+)(\?|$)/)
  const ext = extMatch ? extMatch[1] : 'jpg'
  const cloudPath = `dish-covers/${dishId}-${Date.now()}.${ext}`
  const res = await wx.cloud.uploadFile({
    cloudPath,
    filePath,
  })
  return res.fileID
}

async function getDishes() {
  const localDishes = getCachedDishes()
  if (!initCloud()) return localDishes

  try {
    const cloudDishes = await getCloudDishes()
    if (cloudDishes.length) {
      wx.setStorageSync(CLOUD_MIGRATED_KEY, true)
      return setCachedDishes(cloudDishes)
    }

    if (wx.getStorageSync(CLOUD_MIGRATED_KEY)) {
      return setCachedDishes([])
    }

    const seedDishes = localDishes.length ? localDishes : normalizeDishes(defaultDishes)
    const uploaded = []
    for (const dish of seedDishes) {
      const coverImage = await uploadCoverIfNeeded(dish.coverImage, dish.id)
      uploaded.push(await saveCloudDish({ ...dish, coverImage }))
    }
    wx.setStorageSync(CLOUD_MIGRATED_KEY, true)
    return setCachedDishes(uploaded)
  } catch (err) {
    console.warn('get cloud dishes failed, using local cache', err)
    return localDishes
  }
}

async function saveDish(dish) {
  const now = Date.now()
  const id = String(dish.id || now)
  let nextDish = {
    ...dish,
    id,
    createdAt: dish.createdAt || now,
    updatedAt: now,
  }

  try {
    if (initCloud()) {
      nextDish.coverImage = await uploadCoverIfNeeded(nextDish.coverImage, id)
      nextDish = await saveCloudDish(nextDish)
      wx.setStorageSync(CLOUD_MIGRATED_KEY, true)
    }
  } catch (err) {
    console.warn('save cloud dish failed, saving local only', err)
  }

  const cached = getCachedDishes()
  const exists = cached.some(item => String(item.id) === id)
  const dishes = exists
    ? cached.map(item => (String(item.id) === id ? nextDish : item))
    : [...cached, nextDish]
  setCachedDishes(dishes)
  return nextDish
}

/**
 * 批量导入菜谱：本地即时写入（秒开），云端并行后台保存。
 * 用名字型稳定 id，配合调用方跳过同名，避免重复。返回合并后的列表。
 */
function saveDishesBatch(rawDishes) {
  const now = Date.now()
  const incoming = (rawDishes || [])
    .filter(d => d && d.name)
    .map(d => ({
      ...d,
      id: String(d.id || ('d-' + d.name)),
      coverImage: d.coverImage || '',
      createdAt: d.createdAt || now,
      updatedAt: now,
    }))

  const merged = setCachedDishes([...getCachedDishes(), ...incoming])

  if (incoming.length && initCloud()) {
    wx.setStorageSync(CLOUD_MIGRATED_KEY, true)
    Promise.all(
      incoming.map(d => saveCloudDish(d).catch(err => console.warn('cloud save dish fail', d.name, err)))
    ).catch(() => {})
  }
  return merged
}

// 做完菜：给这些菜写 lastCooked（本地即时 + 云端后台），供"不重复推荐"降权
function markCooked(ids) {
  const set = new Set((ids || []).map(String))
  if (!set.size) return getCachedDishes()
  const now = Date.now()
  const toSave = getCachedDishes()
    .filter(d => set.has(String(d.id)))
    .map(d => ({ ...d, lastCooked: now }))
  return toSave.length ? saveDishesBatch(toSave) : getCachedDishes()
}

async function deleteDish(id) {
  const cached = getCachedDishes()
  const dish = cached.find(item => String(item.id) === String(id))

  try {
    if (initCloud()) {
      await deleteCloudDish(id, dish && dish.cloudId)
    }
  } catch (err) {
    console.warn('delete cloud dish failed, deleting local only', err)
  }

  const dishes = cached.filter(item => String(item.id) !== String(id))
  return setCachedDishes(dishes)
}

module.exports = {
  CLOUD_ENV,
  STORAGE_KEY,
  initCloud,
  getDishes,
  getCachedDishes,
  saveDish,
  saveDishesBatch,
  markCooked,
  deleteDish,
  normalizeDishes,
}

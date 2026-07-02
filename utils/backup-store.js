const dishStore = require('./dish-store')
const fridgeStore = require('./fridge-store')

const COLLECTION = 'data_backups'

function getCollection() {
  dishStore.initCloud()
  return wx.cloud.database().collection(COLLECTION)
}

async function buildBackup() {
  const dishes = await dishStore.getDishes()
  const fridgeItems = await fridgeStore.getItems()
  return {
    type: 'cooking_app_backup',
    version: 1,
    exportedAt: Date.now(),
    cloudEnv: dishStore.CLOUD_ENV,
    dishes: dishStore.normalizeDishes(dishes),
    fridgeItems: fridgeStore.normalizeItems(fridgeItems),
  }
}

function stringifyBackup(backup) {
  return JSON.stringify(backup, null, 2)
}

function parseBackup(text) {
  const data = JSON.parse(text)
  if (!data || data.type !== 'cooking_app_backup') {
    throw new Error('invalid backup')
  }
  return {
    dishes: dishStore.normalizeDishes(data.dishes || []),
    fridgeItems: fridgeStore.normalizeItems(data.fridgeItems || []),
  }
}

async function saveCloudBackup() {
  if (!dishStore.initCloud()) throw new Error('cloud unavailable')
  const backup = await buildBackup()
  const res = await getCollection().add({
    data: {
      ...backup,
      dishCount: backup.dishes.length,
      fridgeItemCount: backup.fridgeItems.length,
      createdAt: Date.now(),
    },
  })
  return {
    id: res._id,
    backup,
  }
}

async function restoreFromText(text) {
  const backup = parseBackup(text)
  for (const dish of backup.dishes) {
    await dishStore.saveDish({ ...dish, cloudId: '' })
  }
  for (const item of backup.fridgeItems) {
    await fridgeStore.saveItem({ ...item, cloudId: '' })
  }
  return backup
}

module.exports = {
  buildBackup,
  stringifyBackup,
  saveCloudBackup,
  restoreFromText,
}

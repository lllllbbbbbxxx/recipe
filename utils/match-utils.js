const OPTIONAL_INGREDIENTS = ['葱', '姜', '蒜', '香菜', '芝麻', '辣椒', '花椒', '小葱', '葱花']
const SEASONINGS = ['盐', '生抽', '老抽', '醋', '糖', '冰糖', '料酒', '豆瓣酱', '蚝油', '酱油', '白糖', '味精', '鸡精', '胡椒', '淀粉', '番茄酱', '辣椒酱', '花椒', '八角', '桂皮', '香叶', '油']

function isSeasoningName(name) {
  return SEASONINGS.some(item => name.includes(item))
}

function inferImportance(ingredient, index) {
  const name = ingredient.name || ''
  if (isSeasoningName(name)) return 'seasoning'
  if (ingredient.importance) return ingredient.importance
  if (OPTIONAL_INGREDIENTS.some(item => name.includes(item))) return 'optional'
  if (index === 0) return 'main'
  return 'required'
}

function normalizeNames(names) {
  const result = []
  names.forEach(name => {
    const text = String(name || '').trim()
    if (text && !result.includes(text)) result.push(text)
  })
  return result
}

function isIngredientMatched(requiredName, ownedName) {
  return requiredName === ownedName ||
    requiredName.includes(ownedName) ||
    ownedName.includes(requiredName)
}

function isOwned(name, ownedNames) {
  return ownedNames.some(ownedName => isIngredientMatched(name, ownedName))
}

function getDishMatch(dish, fridgeItems) {
  const ownedNames = normalizeNames((fridgeItems || [])
    .filter(item => item.freshnessStatus !== 'expired')
    .map(item => item.name))
  const ingredients = dish.ingredients || []
  const missingMain = []
  const missingRequired = []
  const missingOptional = []
  const missingSeasonings = []
  let matchedCount = 0

  ingredients.forEach((ingredient, index) => {
    const name = String(ingredient.name || '').trim()
    if (!name) return
    if (isOwned(name, ownedNames)) {
      matchedCount += 1
      return
    }

    const importance = inferImportance(ingredient, index)
    if (importance === 'main') missingMain.push(name)
    else if (importance === 'optional') missingOptional.push(name)
    else if (importance === 'seasoning') missingSeasonings.push(name)
    else missingRequired.push(name)
  })

  const canCook = ingredients.length > 0 && missingMain.length === 0 && missingRequired.length === 0 && missingOptional.length === 0 && missingSeasonings.length === 0
  const canDraw = ingredients.length > 0 && missingMain.length === 0 && missingRequired.length === 0
  const almostReady = canDraw && (missingOptional.length > 0 || missingSeasonings.length > 0)
  const missingCount = missingMain.length + missingRequired.length + missingOptional.length + missingSeasonings.length
  let text = '可做'
  let detail = '冰箱食材已覆盖'
  let level = 'ready'

  if (almostReady) {
    text = '差点味'
    const details = []
    if (missingOptional.length) details.push(`缺配料：${missingOptional.slice(0, 2).join('、')}`)
    if (missingSeasonings.length) details.push(`缺调料：${missingSeasonings.slice(0, 2).join('、')}`)
    detail = details.join('；')
    level = 'almost'
  } else if (missingMain.length) {
    text = '缺主料'
    detail = `缺：${missingMain.slice(0, 3).join('、')}`
    level = 'blocked'
  } else if (missingRequired.length) {
    text = '缺关键'
    detail = `缺：${missingRequired.slice(0, 3).join('、')}`
    level = 'blocked'
  } else if (!ingredients.length) {
    text = '缺信息'
    detail = '还没有录入食材'
    level = 'blocked'
  }

  return {
    canCook,
    canDraw,
    almostReady,
    level,
    matchedCount,
    missingCount,
    missingMain,
    missingRequired,
    missingOptional,
    missingSeasonings,
    text,
    detail,
  }
}

function buildDrawPool(dishes, fridgeItems) {
  const pool = []
  const source = dishes || []
  source.forEach(dish => {
    const match = getDishMatch(dish, fridgeItems)
    if (!match.canDraw) return
    const weight = match.missingOptional.length ? 2 : 5
    for (let i = 0; i < weight; i += 1) {
      pool.push({ dish, match })
    }
  })
  return pool
}

function pickWeightedDish(dishes, fridgeItems) {
  const pool = buildDrawPool(dishes, fridgeItems)
  if (!pool.length) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

module.exports = {
  getDishMatch,
  buildDrawPool,
  pickWeightedDish,
}

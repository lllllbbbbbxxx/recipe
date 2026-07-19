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

// 临期/过期食材名（用于消耗加权）
function getExpiringNames(fridgeItems) {
  return (fridgeItems || [])
    .filter(item => item.freshnessStatus === 'soon' || item.freshnessStatus === 'expired')
    .map(item => item.name)
}

// 这道菜用到几样临期食材
function countExpiringUsed(dish, expiringNames) {
  let n = 0
  ;(dish.ingredients || []).forEach(ing => {
    const name = String(ing.name || '').trim()
    if (name && expiringNames.some(e => name.includes(e) || e.includes(name))) n += 1
  })
  return n
}

/**
 * 抽卡池加权：
 *  基础：食材齐全 5，缺可选料 2
 *  + 临期优先：用到临期食材 +3/样（封顶 +6）
 *  + 荤素搭配：opts.cartRoles=今日菜单已有的类别，本菜类别不在其中 +3
 */
function buildDrawPool(dishes, fridgeItems, opts) {
  opts = opts || {}
  const cartRoles = opts.cartRoles || []
  const expiringNames = getExpiringNames(fridgeItems)
  const pool = []
  ;(dishes || []).forEach(dish => {
    const match = getDishMatch(dish, fridgeItems)
    if (!match.canDraw) return
    let weight = match.missingOptional.length ? 2 : 5

    const exp = countExpiringUsed(dish, expiringNames)
    if (exp) weight += Math.min(exp * 3, 6)

    const role = dish.mealRole || ''
    if (role && cartRoles.length && cartRoles.indexOf(role) < 0) weight += 3

    // 不重复推荐：48 小时内做过的菜权重减半（至少保留 1）
    if (dish.lastCooked && Date.now() - dish.lastCooked < 48 * 3600 * 1000) {
      weight = Math.max(1, Math.round(weight / 2))
    }

    for (let i = 0; i < weight; i += 1) pool.push({ dish, match })
  })
  return pool
}

function pickWeightedDish(dishes, fridgeItems, opts) {
  const pool = buildDrawPool(dishes, fridgeItems, opts)
  if (!pool.length) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

module.exports = {
  getDishMatch,
  buildDrawPool,
  pickWeightedDish,
}

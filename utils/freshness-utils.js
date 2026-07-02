const DAY = 24 * 60 * 60 * 1000

const NAME_RULES = [
  { keywords: ['生菜', '菠菜', '青菜', '油麦菜', '菜心'], days: 3 },
  { keywords: ['西兰花', '花菜', '豆腐'], days: 2 },
  { keywords: ['番茄', '西红柿', '黄瓜', '青椒'], days: 5 },
  { keywords: ['土豆', '洋葱', '胡萝卜'], days: 10 },
  { keywords: ['猪肉', '牛肉', '羊肉', '排骨', '鸡胸肉', '鸡翅'], days: 2 },
  { keywords: ['虾仁', '虾', '鱼', '贝'], days: 2 },
  { keywords: ['鸡蛋'], days: 14 },
  { keywords: ['米', '面'], days: 60 },
]

const CATEGORY_RULES = {
  蔬菜: 5,
  肉蛋: 3,
  调料: 0,
  主食: 30,
  其他: 7,
}

function inferShelfLifeDays(item) {
  if (item.staple || item.category === '调料') return 0
  const name = String(item.name || '').trim()
  for (let i = 0; i < NAME_RULES.length; i += 1) {
    if (NAME_RULES[i].keywords.some(keyword => name.includes(keyword))) return NAME_RULES[i].days
  }
  return CATEGORY_RULES[item.category || '其他'] || 7
}

function enrichItem(item, now = Date.now()) {
  const createdAt = item.createdAt || now
  const addedAt = item.addedAt || createdAt
  const source = item.source || 'manual'
  const staple = !!item.staple
  const shelfLifeDays = item.shelfLifeDays != null ? item.shelfLifeDays : inferShelfLifeDays(item)
  const expireAt = staple || !shelfLifeDays ? 0 : (item.expireAt || (addedAt + shelfLifeDays * DAY))
  let freshnessStatus = 'normal'
  let daysLeft = null
  let freshnessText = staple ? '常备' : ''
  let urgencyScore = 0

  if (!staple && expireAt) {
    daysLeft = Math.ceil((expireAt - now) / DAY)
    if (daysLeft < 0) {
      freshnessStatus = 'expired'
      freshnessText = `已过期 ${Math.abs(daysLeft)} 天`
      urgencyScore = 4
    } else if (daysLeft <= 2) {
      freshnessStatus = 'soon'
      freshnessText = `还剩 ${daysLeft} 天`
      urgencyScore = 3
    } else if (daysLeft <= 5) {
      freshnessStatus = 'normal'
      freshnessText = `还剩 ${daysLeft} 天`
      urgencyScore = 2
    } else {
      freshnessText = `还剩 ${daysLeft} 天`
      urgencyScore = 1
    }
  }

  return {
    ...item,
    staple,
    source,
    addedAt,
    shelfLifeDays,
    expireAt,
    freshnessStatus,
    daysLeft,
    freshnessText,
    urgencyScore,
  }
}

function buildFreshnessSummary(items) {
  const list = (items || []).map(item => enrichItem(item))
  const expiredItems = list.filter(item => item.freshnessStatus === 'expired')
  const soonItems = list.filter(item => item.freshnessStatus === 'soon')
  const urgentItems = [...expiredItems, ...soonItems]
    .sort((a, b) => (b.urgencyScore - a.urgencyScore) || ((a.daysLeft || 0) - (b.daysLeft || 0)))
  return {
    total: list.length,
    expiredCount: expiredItems.length,
    soonCount: soonItems.length,
    urgentItems,
  }
}

function getUrgentNames(items) {
  return buildFreshnessSummary(items).urgentItems.map(item => item.name)
}

module.exports = {
  DAY,
  inferShelfLifeDays,
  enrichItem,
  buildFreshnessSummary,
  getUrgentNames,
}

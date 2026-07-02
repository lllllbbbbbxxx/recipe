const CATEGORY_KEYWORDS = {
  蔬菜: ['菜', '白菜', '青菜', '生菜', '菠菜', '油麦菜', '西兰花', '花菜', '芹菜', '韭菜', '香菜', '葱', '蒜', '姜', '番茄', '西红柿', '土豆', '胡萝卜', '萝卜', '黄瓜', '冬瓜', '南瓜', '茄子', '豆角', '豆芽', '豆腐', '青椒', '辣椒', '小米辣', '菇', '蘑菇', '香菇', '金针菇', '杏鲍菇', '平菇', '口蘑', '木耳', '莲藕', '藕', '莴笋', '笋', '苗', '苦瓜', '丝瓜', '秋葵', '芦笋', '山药', '芋头', '洋葱', '彩椒'],
  肉蛋: ['肉', '猪', '牛', '羊', '鸡', '鸭', '鱼', '虾', '蟹', '贝', '排骨', '鸡蛋', '蛋', '火腿', '培根', '午餐肉'],
  调料: ['盐', '糖', '生抽', '老抽', '酱油', '醋', '料酒', '蚝油', '豆瓣酱', '番茄酱', '辣椒酱', '淀粉', '胡椒', '花椒', '八角', '桂皮', '香叶', '味精', '鸡精', '油'],
  主食: ['米', '饭', '面', '粉', '馒头', '饺子', '馄饨', '包子', '年糕', '吐司', '面包', '玉米', '红薯', '紫薯'],
}

const LIGHT_KEYWORDS = ['青菜', '生菜', '菠菜', '油麦菜', '西兰花', '冬瓜', '黄瓜', '豆腐', '番茄', '西红柿']
const SPICY_KEYWORDS = ['辣椒', '青椒', '尖椒', '小米辣', '豆瓣酱', '辣椒酱', '花椒']
const SOUP_KEYWORDS = ['汤', '紫菜', '冬瓜', '番茄', '西红柿']
const FAST_KEYWORDS = ['鸡蛋', '蛋', '豆腐', '青菜', '生菜', '菠菜', '土豆', '番茄', '西红柿', '黄瓜']

function includesAny(text, keywords) {
  return keywords.some(keyword => text.includes(keyword))
}

function classifyIngredient(name) {
  const text = String(name || '').trim()
  if (!text) return '其他'
  const categories = Object.keys(CATEGORY_KEYWORDS)
  for (let i = 0; i < categories.length; i += 1) {
    const category = categories[i]
    if (includesAny(text, CATEGORY_KEYWORDS[category])) return category
  }
  return '其他'
}

function inferDishMeta(ingredients) {
  const names = (ingredients || [])
    .map(item => String(item.name || '').trim())
    .filter(Boolean)
  const joined = names.join('、')
  const categories = names.map(name => classifyIngredient(name))
  const tags = []
  let mealRole = ''

  if (includesAny(joined, SOUP_KEYWORDS) && names.length <= 4) {
    mealRole = '汤'
    tags.push('汤')
  } else if (categories.includes('肉蛋')) {
    mealRole = '荤菜'
    tags.push('下饭')
  } else if (categories.includes('主食')) {
    mealRole = '主食'
    tags.push('家常')
  } else if (categories.includes('蔬菜')) {
    mealRole = '素菜'
    tags.push('清淡')
  }

  if (includesAny(joined, SPICY_KEYWORDS) && !tags.includes('辣')) tags.push('辣')
  if (includesAny(joined, FAST_KEYWORDS) && !tags.includes('快手')) tags.push('快手')
  if (!tags.length && names.length) tags.push('家常')

  return {
    mealRole,
    tags: tags.slice(0, 2),
  }
}

module.exports = {
  classifyIngredient,
  inferDishMeta,
}

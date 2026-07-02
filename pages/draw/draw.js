const dishStore = require('../../utils/dish-store')
const fridgeStore = require('../../utils/fridge-store')
const matchUtils = require('../../utils/match-utils')

Page({
  data: {
    dishes: [],
    fridgeItems: [],
    candidates: [],
    currentDish: {
      name: '先抽一张',
      ingredientText: '看看今晚适合吃什么',
      thumbText: '抽',
      thumbClass: 'thumb-green',
      tagViews: [],
      matchText: '待抽',
      matchClass: 'match-ready',
      missingText: '根据冰箱库存推荐',
    },
    candidateCount: 0,
    isDrawing: false,
    hasResult: false,
    resultLabel: 'READY',
    drawButtonText: '开始抽卡',
    poolHint: '可做优先，缺调料也可以抽',
  },

  onLoad() {
    this.loadData()
  },

  onShow() {
    this.loadData()
  },

  async loadData() {
    const cachedDishes = dishStore.getCachedDishes()
    const cachedFridgeItems = fridgeStore.getCachedItems()
    this.setSourceData(cachedDishes, cachedFridgeItems)

    const dishes = await dishStore.getDishes()
    const fridgeItems = await fridgeStore.getItems()
    this.setSourceData(dishes, fridgeItems)
  },

  setSourceData(dishes, fridgeItems) {
    const normalizedDishes = dishStore.normalizeDishes(dishes)
    const matchedCandidates = normalizedDishes.filter(dish => (
      matchUtils.getDishMatch(dish, fridgeItems).canDraw
    ))
    const candidates = matchedCandidates.length ? matchedCandidates : normalizedDishes
    this.setData({
      dishes: normalizedDishes,
      fridgeItems,
      candidates,
      candidateCount: candidates.length,
      poolHint: matchedCandidates.length ? '可做优先，缺调料也可以抽' : '暂无库存匹配，先随机抽一道',
    })
    if (!this.data.hasResult && candidates.length) {
      this.setData({ currentDish: this.buildCardDish(candidates[0]) })
    }
  },

  startDraw() {
    if (!this.data.candidates.length) {
      wx.showToast({ title: '先添加菜谱', icon: 'none' })
      return
    }
    if (this.data.isDrawing) return

    this.setData({
      isDrawing: true,
      hasResult: false,
      resultLabel: 'DRAWING',
      drawButtonText: '抽取中...',
    })

    let count = 0
    const timer = setInterval(() => {
      const dish = this.data.candidates[Math.floor(Math.random() * this.data.candidates.length)]
      this.setData({ currentDish: this.buildCardDish(dish) })
      count += 1
      if (count >= 16) {
        clearInterval(timer)
        const picked = matchUtils.pickWeightedDish(this.data.candidates, this.data.fridgeItems)
        const dish = picked ? picked.dish : this.data.candidates[Math.floor(Math.random() * this.data.candidates.length)]
        this.setData({
          currentDish: this.buildCardDish(dish),
          isDrawing: false,
          hasResult: true,
          resultLabel: 'TONIGHT',
          drawButtonText: '再抽一次',
        })
      }
    }, 90)
  },

  addToMenu() {
    if (!this.data.hasResult) return
    const pages = getCurrentPages()
    const prevPage = pages.length > 1 ? pages[pages.length - 2] : null
    if (prevPage && prevPage.route === 'pages/menu/menu') {
      const cart = prevPage.mergeCartDishes([...prevPage.data.cart, this.data.currentDish])
      prevPage.setData(prevPage.buildCartData(cart), () => prevPage.applyFilter())
      wx.navigateBack()
      return
    }
    wx.showToast({ title: '已抽中，可返回加入', icon: 'none' })
  },

  buildCardDish(dish) {
    const ingredientNames = dish.ingredients.map(item => item.name).filter(Boolean)
    const match = matchUtils.getDishMatch(dish, this.data.fridgeItems)
    const thumb = this.buildThumbData(dish)
    return {
      ...dish,
      ...thumb,
      ingredientText: ingredientNames.slice(0, 4).join('、') + (ingredientNames.length > 4 ? ' 等' : ''),
      tagViews: (dish.tags || []).map((tag, index) => ({ key: `${dish.id}-${tag}-${index}`, name: tag })),
      matchText: match.text,
      missingText: match.canDraw ? match.detail : '可能需要补点食材',
      matchClass: match.canCook ? 'match-ready' : (match.canDraw ? 'match-almost' : 'match-missing'),
    }
  },

  buildThumbData(dish) {
    const name = dish.name || '菜'
    let thumbClass = 'thumb-green'
    const tags = dish.tags || []
    if (tags.includes('辣')) thumbClass = 'thumb-red'
    if (tags.includes('汤')) thumbClass = 'thumb-blue'
    if (tags.includes('清淡')) thumbClass = 'thumb-light'
    if (tags.includes('鲜香')) thumbClass = 'thumb-gold'
    return {
      thumbText: name.slice(0, 1),
      thumbClass,
    }
  },

  onShareAppMessage() {
    return {
      title: `今天吃${this.data.currentDish.name}`,
      path: '/pages/menu/menu',
    }
  },
})

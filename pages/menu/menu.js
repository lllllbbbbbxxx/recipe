const dishStore = require('../../utils/dish-store')
const fridgeStore = require('../../utils/fridge-store')
const matchUtils = require('../../utils/match-utils')
const freshnessUtils = require('../../utils/freshness-utils')

const TAGS = ['快手', '清淡', '下饭', '辣', '汤', '家常', '鲜香']
const MEAL_ROLES = ['可做', '荤菜', '素菜', '汤', '主食', '小吃']

Page({
  data: {
    dishes: [],
    fridgeItems: [],
    filteredDishes: [],
    categoryFilters: [],
    activeFilters: [],
    searchValue: '',
    cart: [],
    cartIngredients: [],
    cartIngredientText: '',
    cartCount: 0,
    cartCountText: '',
    cartHint: '先选几道想吃的菜',
    isDishListEmpty: false,
    isCartEmpty: true,
    showCart: false,
    openedDishId: '',
    touchStartX: 0,
    touchStartY: 0,
    fridgeReminderText: '',
    urgentFridgeNames: [],
  },

  onLoad() {
    this.loadDishes()
  },

  onShow() {
    this.loadDishes()
  },

  async loadDishes() {
    try {
      const cached = dishStore.getCachedDishes()
      const cachedFridgeItems = fridgeStore.getCachedItems()
      this.setData({
        dishes: this.normalizeDishes(cached),
        fridgeItems: cachedFridgeItems,
        ...this.buildFridgeReminderData(cachedFridgeItems),
      }, () => this.applyFilter())

      const dishes = await dishStore.getDishes()
      const fridgeItems = await fridgeStore.getItems()
      this.setData({
        dishes: this.normalizeDishes(dishes),
        fridgeItems,
        ...this.buildFridgeReminderData(fridgeItems),
      }, () => this.applyFilter())
    } catch (err) {
      console.error('load dishes failed', err)
      const cached = dishStore.getCachedDishes()
      const cachedFridgeItems = fridgeStore.getCachedItems()
      this.setData({
        dishes: this.normalizeDishes(cached),
        fridgeItems: cachedFridgeItems,
        ...this.buildFridgeReminderData(cachedFridgeItems),
      }, () => this.applyFilter())
    }
  },

  buildFridgeReminderData(fridgeItems) {
    const summary = freshnessUtils.buildFreshnessSummary(fridgeItems)
    const urgentFridgeNames = summary.urgentItems.slice(0, 3).map(item => item.name)
    let fridgeReminderText = ''
    if (urgentFridgeNames.length) {
      fridgeReminderText = `先消耗：${urgentFridgeNames.join('、')}`
    } else if (fridgeItems.length) {
      fridgeReminderText = '库存状态正常，推荐优先匹配现有食材'
    }
    return {
      fridgeReminderText,
      urgentFridgeNames,
    }
  },

  onSearch(e) {
    this.setData({ searchValue: e.detail.value, openedDishId: '' }, () => this.applyFilter())
  },

  toggleFilter(e) {
    const tag = e.currentTarget.dataset.tag
    const activeFilters = tag === '全部' ? [] : [tag]
    this.setData({ activeFilters, openedDishId: '' }, () => this.applyFilter())
  },

  applyFilter() {
    const { dishes, activeFilters, searchValue, cart } = this.data
    const selectedIds = cart.map(d => String(d.id))
    const keyword = searchValue.trim()
    let result = dishes
    if (keyword) {
      result = result.filter(d =>
        d.name.includes(keyword) ||
        d.ingredients.some(i => i.name.includes(keyword)) ||
        d.tags.some(t => t.includes(keyword)) ||
        d.mealRole.includes(keyword)
      )
    }
    if (activeFilters.length) {
      result = result.filter(d => (
        activeFilters.includes('可做') ? this.getDishMatch(d).canCook : activeFilters.includes(d.mealRole)
      ))
    }
    result = result.map(d => this.buildDishView(d, selectedIds))
    this.setData({
      filteredDishes: result,
      categoryFilters: this.buildCategoryFilters(dishes, activeFilters),
      isDishListEmpty: result.length === 0,
    })
  },

  toggleCart(e) {
    const id = String(e.currentTarget.dataset.id)
    let { cart, dishes } = this.data
    if (cart.find(d => String(d.id) === id)) {
      cart = cart.filter(d => String(d.id) !== id)
    } else {
      const dish = dishes.find(d => String(d.id) === id)
      if (dish) cart = [...cart, dish]
    }
    this.setData({
      ...this.buildCartData(cart),
      openedDishId: '',
    }, () => this.applyFilter())
  },

  pickRandomDish() {
    const candidates = this.getDrawableCandidates()
    if (!candidates.length) {
      wx.showToast({ title: '没有可抽的菜', icon: 'none' })
      return
    }

    const picked = matchUtils.pickWeightedDish(candidates, this.data.fridgeItems)
    const dish = picked.dish
    const cart = this.mergeCartDishes([...this.data.cart, dish])
    this.setData({
      ...this.buildCartData(cart),
      openedDishId: '',
      showCart: true,
    }, () => this.applyFilter())
    wx.showToast({ title: `今天吃${dish.name}`, icon: 'none' })
  },

  generateTodayMenu() {
    const candidates = this.sortByFridgeMatch(this.getDrawableCandidates()).map(item => item.dish)
    if (!candidates.length) {
      wx.showToast({ title: '没有可用菜谱', icon: 'none' })
      return
    }

    const picked = []
    this.pickByRule(candidates, picked, dish => dish.mealRole === '荤菜')
    this.pickByRule(candidates, picked, dish => dish.mealRole === '素菜')
    this.pickByRule(candidates, picked, dish => dish.mealRole === '汤')
    this.pickByRule(candidates, picked, dish => this.hasAnyTag(dish, ['下饭', '家常', '鲜香', '辣']))
    this.pickByRule(candidates, picked, dish => this.hasAnyTag(dish, ['清淡', '快手']))

    while (picked.length < Math.min(3, candidates.length)) {
      const rest = candidates.filter(dish => !picked.find(item => item.id === dish.id))
      if (!rest.length) break
      picked.push(rest[Math.floor(Math.random() * rest.length)])
    }

    const cart = this.mergeCartDishes(picked)
    this.setData({
      ...this.buildCartData(cart),
      openedDishId: '',
      showCart: true,
    }, () => this.applyFilter())
    wx.showToast({ title: `已生成 ${cart.length} 道菜`, icon: 'none' })
  },

  onDishTouchStart(e) {
    const touch = e.changedTouches[0]
    this.setData({
      touchStartX: touch.clientX,
      touchStartY: touch.clientY,
    })
  },

  onDishTouchEnd(e) {
    const touch = e.changedTouches[0]
    const deltaX = touch.clientX - this.data.touchStartX
    const deltaY = touch.clientY - this.data.touchStartY
    if (Math.abs(deltaY) > 40 || Math.abs(deltaX) < 50) {
      this.closeSwipe()
      return
    }

    const id = String(e.currentTarget.dataset.id)
    const openedDishId = deltaX < 0 ? id : ''
    this.setData({ openedDishId }, () => this.applyFilter())
  },

  onDishCardTap(e) {
    const id = String(e.currentTarget.dataset.id)
    if (this.data.openedDishId && this.data.openedDishId !== id) {
      this.closeSwipe()
    }
  },

  closeSwipe() {
    if (!this.data.openedDishId) return
    this.setData({ openedDishId: '' }, () => this.applyFilter())
  },

  editDish(e) {
    const id = String(e.currentTarget.dataset.id)
    this.setData({ openedDishId: '' }, () => this.applyFilter())
    wx.navigateTo({ url: `/pages/add/add?id=${id}` })
  },

  deleteDish(e) {
    const id = String(e.currentTarget.dataset.id)
    const dish = this.data.dishes.find(item => String(item.id) === id)
    wx.showModal({
      title: '删除菜谱',
      content: `确定删除「${dish ? dish.name : '这道菜'}」吗？`,
      confirmColor: '#E5534B',
      success: async res => {
        if (!res.confirm) return
        const dishes = await dishStore.deleteDish(id)
        const cart = this.data.cart.filter(item => String(item.id) !== id)
        this.setData({
          dishes: this.normalizeDishes(dishes),
          openedDishId: '',
          ...this.buildCartData(cart),
        }, () => this.applyFilter())
      },
    })
  },

  toggleCartPanel() {
    this.setData({ showCart: !this.data.showCart, openedDishId: '' }, () => this.applyFilter())
  },

  removeFromCart(e) {
    const id = String(e.currentTarget.dataset.id)
    const cart = this.data.cart.filter(d => String(d.id) !== id)
    this.setData({
      ...this.buildCartData(cart),
      openedDishId: '',
    }, () => this.applyFilter())
  },

  clearCart() {
    this.setData({
      ...this.buildCartData([]),
      openedDishId: '',
    }, () => this.applyFilter())
  },

  copyIngredients() {
    const text = this.data.cartIngredientText
    if (!text) {
      wx.showToast({ title: '暂无食材', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '已复制', icon: 'success' }),
    })
  },

  goAdd() {
    this.closeSwipe()
    wx.navigateTo({ url: '/pages/add/add' })
  },

  goFridge() {
    this.closeSwipe()
    wx.navigateTo({ url: '/pages/fridge/fridge' })
  },

  goDraw() {
    this.closeSwipe()
    wx.navigateTo({ url: '/pages/draw/draw' })
  },

  goBackup() {
    this.closeSwipe()
    wx.navigateTo({ url: '/pages/backup/backup' })
  },

  goOrders() {
    this.closeSwipe()
    wx.navigateTo({ url: '/pages/orders/orders' })
  },

  onShareAppMessage() {
    const app = getApp()
    const openid = app.globalData.openid || ''
    if (!openid) {
      // 身份还没拿到，后台再补一次，避免分享链接缺 chefId
      app.fetchOpenid && app.fetchOpenid()
    }
    return {
      title: '来看看我会做什么菜，帮我选几道！',
      path: `/pages/share/share?chefId=${openid}`,
    }
  },

  getDecisionCandidates() {
    const { activeFilters, searchValue } = this.data
    const keyword = searchValue.trim()
    let result = this.data.dishes
    if (keyword) {
      result = result.filter(dish =>
        dish.name.includes(keyword) ||
        dish.ingredients.some(ing => ing.name.includes(keyword)) ||
        dish.tags.some(tag => tag.includes(keyword)) ||
        dish.mealRole.includes(keyword)
      )
    }
    if (activeFilters.length) {
      result = result.filter(dish => (
        activeFilters.includes('可做') ? this.getDishMatch(dish).canCook : activeFilters.includes(dish.mealRole)
      ))
    }
    return result
  },

  getDrawableCandidates() {
    return this.getDecisionCandidates().filter(dish => this.getDishMatch(dish).canDraw)
  },

  sortByFridgeMatch(dishes) {
    return dishes
      .map(dish => ({
        dish,
        match: this.getDishMatch(dish),
        urgency: this.getDishUrgency(dish),
      }))
      .sort((a, b) => {
        if (a.urgency.expiredMatchedCount !== b.urgency.expiredMatchedCount) {
          return b.urgency.expiredMatchedCount - a.urgency.expiredMatchedCount
        }
        if (a.urgency.soonMatchedCount !== b.urgency.soonMatchedCount) {
          return b.urgency.soonMatchedCount - a.urgency.soonMatchedCount
        }
        if (a.match.canCook !== b.match.canCook) return a.match.canCook ? -1 : 1
        if (a.match.missingCount !== b.match.missingCount) return a.match.missingCount - b.match.missingCount
        return b.match.matchedCount - a.match.matchedCount
      })
  },

  getDishUrgency(dish) {
    const urgentItems = freshnessUtils.buildFreshnessSummary(this.data.fridgeItems).urgentItems
    const ingredientNames = (dish.ingredients || []).map(item => item.name || '').filter(Boolean)
    let expiredMatchedCount = 0
    let soonMatchedCount = 0
    urgentItems.forEach(item => {
      const matched = ingredientNames.some(name => (
        name === item.name || name.includes(item.name) || item.name.includes(name)
      ))
      if (!matched) return
      if (item.freshnessStatus === 'expired') expiredMatchedCount += 1
      else if (item.freshnessStatus === 'soon') soonMatchedCount += 1
    })
    return {
      expiredMatchedCount,
      soonMatchedCount,
    }
  },

  pickByRule(candidates, picked, matcher) {
    const matched = candidates.filter(dish =>
      matcher(dish) && !picked.find(item => item.id === dish.id)
    )
    if (!matched.length) return
    picked.push(matched[Math.floor(Math.random() * matched.length)])
  },

  hasAnyTag(dish, tags) {
    return dish.tags.some(tag => tags.includes(tag))
  },

  mergeCartDishes(dishes) {
    const map = {}
    dishes.forEach(dish => {
      map[String(dish.id)] = dish
    })
    return Object.keys(map).map(id => map[id])
  },

  normalizeDishes(dishes) {
    return dishes.map(dish => ({
      id: String(dish.id),
      cloudId: dish.cloudId || '',
      name: dish.name,
      coverImage: dish.coverImage || '',
      mealRole: dish.mealRole || this.inferMealRole(dish),
      tags: (dish.tags || []).slice(0, 2),
      ingredients: dish.ingredients || [],
      createdAt: dish.createdAt || 0,
      updatedAt: dish.updatedAt || 0,
    }))
  },

  buildDishView(dish, selectedIds) {
    const selected = selectedIds.includes(String(dish.id))
    const ingredientNames = dish.ingredients.map(i => i.name).filter(Boolean)
    const visibleIngredientNames = ingredientNames.slice(0, 4)
    const ingredientText = visibleIngredientNames.join('、') + (ingredientNames.length > 4 ? ' 等' : '')
    const thumb = this.buildThumbData(dish)
    const match = this.getDishMatch(dish)
    return {
      ...dish,
      ...thumb,
      viewKey: dish.cloudId || dish.id,
      tagViews: dish.tags.map((tag, index) => ({ key: `${dish.id}-${tag}-${index}`, name: tag })),
      matchText: match.text,
      missingText: this.buildDishHint(dish, match),
      matchClass: match.almostReady ? 'match-almost' : (match.canCook ? 'match-ready' : 'match-missing'),
      selected,
      swiped: String(dish.id) === this.data.openedDishId,
      selectedText: selected ? '✓' : '+',
      ingredientText,
    }
  },

  buildCartData(cart) {
    const ingredientMap = {}
    cart.forEach(dish => {
      dish.ingredients.forEach(ing => {
        if (!ing.name) return
        if (!ingredientMap[ing.name]) ingredientMap[ing.name] = []
        if (ing.amount) ingredientMap[ing.name].push(ing.amount)
      })
    })

    const cartIngredients = Object.keys(ingredientMap).map(name => ({
      name,
      amount: ingredientMap[name].join(' + '),
    }))
    const cartIngredientText = cartIngredients
      .map(item => `${item.name}：${item.amount || '适量'}`)
      .join('\n')

    return {
      cart: cart.map(dish => ({
        ...dish,
        viewKey: dish.cloudId || dish.id,
      })),
      cartIngredients,
      cartIngredientText,
      cartCount: cart.length,
      isCartEmpty: cart.length === 0,
      cartCountText: cart.length ? ` (${cart.length})` : '',
      cartHint: cart.length ? '查看食材清单' : '先选几道想吃的菜',
    }
  },

  buildCategoryFilters(dishes, activeFilters) {
    const roleNames = [...MEAL_ROLES]
    dishes.forEach(dish => {
      if (dish.mealRole && !roleNames.includes(dish.mealRole)) roleNames.push(dish.mealRole)
    })
    return ['全部', ...roleNames].map(name => ({
      name,
      active: name === '全部' ? activeFilters.length === 0 : activeFilters.includes(name),
    }))
  },

  getDishMatch(dish) {
    const match = matchUtils.getDishMatch(dish, this.data.fridgeItems)
    return {
      ...match,
      missingText: match.detail,
    }
  },

  buildDishHint(dish, match) {
    const urgency = this.getDishUrgency(dish)
    if (urgency.expiredMatchedCount || urgency.soonMatchedCount) {
      const count = urgency.expiredMatchedCount + urgency.soonMatchedCount
      return `优先消耗 ${count} 个临期食材`
    }
    return match.missingText
  },

  inferMealRole(dish) {
    const tags = dish.tags || []
    if (tags.includes('汤')) return '汤'
    if (tags.includes('清淡')) return '素菜'
    if (tags.includes('下饭') || tags.includes('辣') || tags.includes('鲜香')) return '荤菜'
    return ''
  },

  buildThumbData(dish) {
    const name = dish.name || '菜'
    let thumbClass = 'thumb-green'
    if (dish.tags.includes('辣')) thumbClass = 'thumb-red'
    if (dish.tags.includes('汤')) thumbClass = 'thumb-blue'
    if (dish.tags.includes('清淡')) thumbClass = 'thumb-light'
    if (dish.tags.includes('鲜香')) thumbClass = 'thumb-gold'
    return {
      thumbText: name.slice(0, 1),
      thumbClass,
    }
  },
})

const dishStore = require('../../utils/dish-store')
const fridgeStore = require('../../utils/fridge-store')
const matchUtils = require('../../utils/match-utils')
const freshnessUtils = require('../../utils/freshness-utils')
const { PRESET_DISHES } = require('../../utils/preset-dishes')
const track = require('../../utils/track')
const shareStore = require('../../utils/share-store')
const amountUtils = require('../../utils/amount-utils')

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
    showImportEntry: false,
    showDishGuide: false,
    dishGuideItems: [],
    showShareSheet: false,
    shareDishItems: [],
    shareAllOn: true,
    shareSelectedCount: 0,
    showConsume: false,
    consumeItems: [],
    fridgeReminderText: '',
    urgentFridgeNames: [],
  },

  onLoad() {
    this.loadDishes()
  },

  onShow() {
    track.track('page_view', { page: 'menu' })
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
      showImportEntry: dishes.length < 10,   // 菜谱少于 10 道时露出一键导入入口
    })
  },

  openDishGuide() {
    this.closeSwipe()
    const existing = new Set(this.data.dishes.map(d => d.name))
    const dishGuideItems = PRESET_DISHES.map(d => ({
      name: d.name,
      mealRole: d.mealRole,
      ingredientText: d.ingredients.map(i => i.name).slice(0, 4).join('、'),
      exists: existing.has(d.name),      // 已有的置灰不选
      selected: !existing.has(d.name),   // 未有的默认勾选
    }))
    this.setData({ showDishGuide: true, dishGuideItems })
  },

  closeDishGuide() {
    this.setData({ showDishGuide: false })
  },

  toggleDishGuideItem(e) {
    const index = Number(e.currentTarget.dataset.index)
    const dishGuideItems = this.data.dishGuideItems.map((item, i) =>
      (i === index && !item.exists) ? { ...item, selected: !item.selected } : item
    )
    this.setData({ dishGuideItems })
  },

  importDishes() {
    const picked = this.data.dishGuideItems.filter(item => item.selected && !item.exists)
    if (!picked.length) {
      wx.showToast({ title: '没有可导入的新菜', icon: 'none' })
      return
    }
    const byName = {}
    PRESET_DISHES.forEach(d => { byName[d.name] = d })
    const toAdd = picked.map(item => {
      const d = byName[item.name]
      return { id: 'd-' + d.name, name: d.name, mealRole: d.mealRole, tags: d.tags, ingredients: d.ingredients, coverImage: '' }
    })
    // 本地即时写入，云端后台同步
    const dishes = dishStore.saveDishesBatch(toAdd)
    track.track('dish_import_done', { count: toAdd.length })
    this.setData({ showDishGuide: false, dishes: this.normalizeDishes(dishes) }, () => this.applyFilter())
    wx.showToast({ title: `已导入 ${toAdd.length} 道菜`, icon: 'success' })
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

    track.track('generate_menu', { count: picked.length })
    track.track('recommend_view', { type: 'generate', count: picked.length })
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
    if (!this.data.showCart && this.data.cart.length) {
      track.track('meal_decided', { dishCount: this.data.cart.length })
    }
    this.setData({ showCart: !this.data.showCart, openedDishId: '' }, () => this.applyFilter())
  },

  // 从今日菜单的菜谱里，累加"这个食材、且单位一致"的用量；对不上返回 0
  recipeUsedForItem(name, unit) {
    let total = 0
    let found = false
    this.data.cart.forEach(dish => (dish.ingredients || []).forEach(ing => {
      const iname = String(ing.name || '').trim()
      if (!iname || !(iname.includes(name) || name.includes(iname))) return
      const p = amountUtils.parseAmount(ing.amount || '')
      if (p.qty && p.unit === unit) { total += parseFloat(p.qty) || 0; found = true }
    }))
    return found ? total : 0
  },

  // ── P0：做完菜 → 按量扣减库存 ──
  openConsume() {
    const ingNames = []
    this.data.cart.forEach(dish => (dish.ingredients || []).forEach(i => {
      const n = String(i.name || '').trim()
      if (n) ingNames.push(n)
    }))
    const seen = {}
    const consumeItems = []
    ;(this.data.fridgeItems || []).forEach(item => {
      if (item.staple) return
      const name = String(item.name || '').trim()
      const used = ingNames.some(ing => ing.includes(name) || name.includes(ing))
      if (!used || seen[item.id]) return
      seen[item.id] = true
      const qtyNum = parseFloat(item.qty) || 0
      let type = amountUtils.unitType(item.unit)
      // 填了数量但没填单位 → 按计数处理，仍可扣减
      if (type === 'none' && qtyNum > 0) type = 'count'
      const recipeUsed = this.recipeUsedForItem(name, item.unit || '')  // 菜谱里的用量（单位一致才有值）
      consumeItems.push({
        id: item.id, name, unit: item.unit || '', qtyNum, type,
        amountText: item.amount || '',
        // 计数：菜谱用量优先，对不上默认 1
        usedQty: type === 'count' ? String(recipeUsed > 0 ? recipeUsed : 1) : '',
        // 重量：菜谱有对得上的量就预填自定义，否则默认"用了一半"
        mode: type === 'weight' ? (recipeUsed > 0 ? 'custom' : 'half') : 'none',
        customQty: (type === 'weight' && recipeUsed > 0) ? String(recipeUsed) : '',
      })
    })
    this.setData({ showConsume: true, consumeItems })
  },

  closeConsume() {
    this.setData({ showConsume: false })
  },

  onConsumeUsed(e) {
    const i = Number(e.currentTarget.dataset.index)
    const v = e.detail.value
    this.setData({ consumeItems: this.data.consumeItems.map((it, idx) => idx === i ? { ...it, usedQty: v } : it) })
  },

  setConsumeMode(e) {
    const i = Number(e.currentTarget.dataset.index)
    const mode = e.currentTarget.dataset.mode
    this.setData({ consumeItems: this.data.consumeItems.map((it, idx) => idx === i ? { ...it, mode } : it) })
  },

  onConsumeCustom(e) {
    const i = Number(e.currentTarget.dataset.index)
    const v = e.detail.value
    this.setData({ consumeItems: this.data.consumeItems.map((it, idx) => idx === i ? { ...it, customQty: v, mode: 'custom' } : it) })
  },

  confirmConsume() {
    const ops = []
    this.data.consumeItems.forEach(it => {
      if (it.type === 'count') {
        const used = parseFloat(it.usedQty) || 0
        if (used <= 0) return
        const remain = it.qtyNum - used
        if (!it.qtyNum || remain <= 0) ops.push({ id: it.id, remove: true })
        else ops.push({ id: it.id, qty: String(remain), unit: it.unit })
      } else if (it.type === 'weight') {
        if (it.mode === 'none') return
        if (it.mode === 'all') { ops.push({ id: it.id, remove: true }); return }
        if (!it.qtyNum && it.mode !== 'custom') { ops.push({ id: it.id, remove: true }); return }
        let remain = null
        if (it.mode === 'half') remain = it.qtyNum / 2
        else if (it.mode === 'quarter') remain = it.qtyNum * 0.75
        else if (it.mode === 'custom') {
          const used = parseFloat(it.customQty) || 0
          if (used <= 0) return
          remain = it.qtyNum - used
        }
        if (remain == null) return
        remain = Math.round(remain * 100) / 100
        if (remain <= 0) ops.push({ id: it.id, remove: true })
        else ops.push({ id: it.id, qty: String(remain), unit: it.unit })
      }
      // vague / none：适量或没填量 → 不扣
    })
    if (ops.length) {
      const fridgeItems = fridgeStore.applyConsumption(ops)
      this.setData({ fridgeItems, ...this.buildFridgeReminderData(fridgeItems) })
    }
    // 给做过的菜写 lastCooked，供抽卡"不重复推荐"降权
    const cookedIds = this.data.cart.map(d => String(d.id))
    const dishes = dishStore.markCooked(cookedIds)
    track.track('meal_cooked', { dishCount: cookedIds.length, consumed: ops.length })
    this.setData({
      showConsume: false,
      showCart: false,
      dishes: this.normalizeDishes(dishes),
      ...this.buildCartData([]),
    }, () => this.applyFilter())
    wx.showToast({ title: ops.length ? `已扣减 ${ops.length} 样食材` : '已完成', icon: 'success' })
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

  // 打开"选择要分享的菜"面板（默认全选）
  openShareSheet() {
    this.closeSwipe()
    const app = getApp()
    if (!app.globalData.openid) app.fetchOpenid && app.fetchOpenid()
    const shareDishItems = this.data.dishes.map(d => ({
      id: String(d.id),
      name: d.name,
      mealRole: d.mealRole || '',
      selected: true,
    }))
    this.setData({
      showShareSheet: true,
      shareDishItems,
      shareAllOn: true,
      shareSelectedCount: shareDishItems.length,
    })
  },

  closeShareSheet() {
    this.setData({ showShareSheet: false })
  },

  toggleShareDish(e) {
    const index = Number(e.currentTarget.dataset.index)
    const shareDishItems = this.data.shareDishItems.map((it, i) =>
      i === index ? { ...it, selected: !it.selected } : it
    )
    this.setData({
      shareDishItems,
      shareAllOn: shareDishItems.every(it => it.selected),
      shareSelectedCount: shareDishItems.filter(it => it.selected).length,
    })
  },

  toggleShareAll() {
    const next = !this.data.shareAllOn
    const shareDishItems = this.data.shareDishItems.map(it => ({ ...it, selected: next }))
    this.setData({
      shareDishItems,
      shareAllOn: next,
      shareSelectedCount: next ? shareDishItems.length : 0,
    })
  },

  shareNoneTip() {
    wx.showToast({ title: '先勾选要分享的菜', icon: 'none' })
  },

  // 点"分享给朋友"（按钮 open-type=share）：同步生成 menuId + 后台建快照
  prepareShare() {
    const app = getApp()
    const openid = app.globalData.openid || ''
    const picked = this.data.shareDishItems.filter(it => it.selected)
    if (!openid || !picked.length) {
      this._shareMenuId = ''   // 兜底：回退到分享全部菜谱
      wx.showToast({ title: !openid ? '正在获取身份，请稍后重试' : '先勾选要分享的菜', icon: 'none' })
      return
    }
    const byId = {}
    this.data.dishes.forEach(d => { byId[String(d.id)] = d })
    const dishes = picked.map(it => {
      const d = byId[it.id] || {}
      return {
        id: String(it.id),
        name: d.name || it.name,
        mealRole: d.mealRole || '',
        tags: d.tags || [],
        ingredients: d.ingredients || [],
        coverImage: d.coverImage || '',
      }
    })
    const key = shareStore.genKey(openid)
    this._shareMenuId = key
    shareStore.createSharedMenu(key, openid, dishes)
    track.track('menu_share', { count: dishes.length })
    this.setData({ showShareSheet: false })
  },

  goShares() {
    this.closeShareSheet()
    wx.navigateTo({ url: '/pages/shares/shares' })
  },

  onShareAppMessage() {
    const app = getApp()
    const openid = app.globalData.openid || ''
    const menuId = this._shareMenuId || ''
    this._shareMenuId = ''   // 快照 id 用后即焚：右上角系统转发回退到全量，不带旧快照
    const path = menuId
      ? `/pages/share/share?menuId=${menuId}`
      : `/pages/share/share?chefId=${openid}`
    return { title: '来看看我给你准备的菜单，挑几道吧！', path }
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

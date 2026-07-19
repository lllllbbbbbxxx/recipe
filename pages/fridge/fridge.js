const fridgeStore = require('../../utils/fridge-store')
const ingredientClassifier = require('../../utils/ingredient-classifier')
const freshnessUtils = require('../../utils/freshness-utils')
const track = require('../../utils/track')
const amountUtils = require('../../utils/amount-utils')

const CATEGORIES = ['蔬菜', '肉蛋', '调料', '主食', '其他']
const GUIDE_STORAGE_KEY = 'fridge_basic_guide_done'

/* ── OCR 文本后处理 ───────────────────────────────
   把购物截图里的价格、时间、按钮文案等噪声剔除，
   抽出「菜名 + 重量/份数」，命中食材词库的默认勾选。
   ─────────────────────────────────────────────── */
// 一眼就是噪声的整段文字（按钮、状态、店铺、广告等）
const OCR_JUNK_WORDS = [
  '购物车', '管理', '配送', '门店', '已售罄', '售罄', '下单', '订单', '备注',
  '优惠', '满减', '满', '合计', '小计', '总计', '实付', '运费', '结算', '规格',
  '数量', '单价', '金额', '会员', '返现', '券', '折', '立即购买', '加入购物车',
  '收藏', '分享', '搜索', '首页', '分类', '我的', '评价', '详情', '推荐', '热销',
  '月销', '起送', '本店', '商家', '超出', '范围', '预计', '送达',
  '红包', '消息', '通知', '领取', '签到', '福利', '抽奖', '客服', '关注', '点赞',
]

// OCR 专用扩展食材词（分类器没覆盖的水果/乳制品/水产等冰箱常见品）
const OCR_FOOD_EXTRA = [
  // 水果
  '苹果', '香蕉', '橙', '橘', '柑', '葡萄', '提子', '西瓜', '哈密瓜', '甜瓜', '草莓',
  '蓝莓', '柠檬', '芒果', '桃', '梨', '枣', '猕猴桃', '火龙果', '柚', '菠萝', '凤梨',
  '樱桃', '荔枝', '龙眼', '椰', '杨梅', '李子', '杏', '石榴', '柿', '枇杷', '山楂',
  // 乳制品 / 蛋
  '奶', '酸奶', '牛奶', '黄油', '奶酪', '芝士', '奶油',
  // 水产 / 肉制品
  '丸', '肠', '培根', '火腿', '鱿鱼', '墨鱼', '章鱼', '扇贝', '生蚝', '蛤', '蛏',
  // 豆制品 / 菌藻 / 主食半成品
  '腐竹', '豆干', '豆皮', '腐乳', '海带', '紫菜', '海苔', '粉丝', '粉条', '年糕',
  '馄饨', '汤圆', '挂面', '意面', '燕麦', '麦片',
]
// 末尾重量/份数单位
const OCR_AMOUNT_RE = /^(.+?)[\s·]*?(\d+(?:\.\d+)?\s*(?:g|kg|ml|L|克|千克|斤|两|毫升|升|个|只|根|把|颗|包|袋|盒|份|条|片|块|瓶|罐|瓣|串|捆|棵|枚))$/i

// 清掉行内价格、前缀符号、首尾杂质
function ocrCleanLine(raw) {
  let s = String(raw || '').trim()
  s = s.replace(/[¥￥$]\s*\d+(\.\d+)?/g, '')   // 去价格 ¥6.8
  s = s.replace(/x\s*\d+\s*$/i, '')             // 去 “x2” 数量
  s = s.replace(/^[\sxX*✓·、,，.。:：]+/, '')   // 去前缀杂符
  s = s.replace(/[\s·、,，]+$/, '')             // 去尾部杂符
  return s.trim()
}

// 拆出 { name, amount }
function ocrSplitNameAmount(text) {
  const m = text.match(OCR_AMOUNT_RE)
  if (m) return { name: m[1].trim(), amount: m[2].replace(/\s+/g, '') }
  return { name: text, amount: '' }
}

// 是否是噪声（价格/时间/纯数字/纯符号/按钮词）
function ocrIsJunk(text) {
  if (!text) return true
  if (!/[一-龥]/.test(text)) return true               // 不含中文：价格/时间/数字/符号/英文都归噪声
  if (/\d{1,2}:\d{2}/.test(text)) return true          // 含时间戳 21:46
  if (OCR_JUNK_WORDS.some(w => text.includes(w))) return true
  return false
}

// 是否像菜名：命中分类器词库 或 OCR 扩展食材词 = 是；否则不是
function ocrIsFood(name) {
  if (!name || name.length > 14) return false
  if (ingredientClassifier.classifyIngredient(name) !== '其他') return true
  return OCR_FOOD_EXTRA.some(w => name.includes(w))
}
const BASIC_GROUPS = [
  {
    name: '常用调料',
    desc: '默认全选，按常备处理',
    items: [
      { name: '酱油', category: '调料', selected: true, staple: true },
      { name: '醋', category: '调料', selected: true, staple: true },
      { name: '盐', category: '调料', selected: true, staple: true },
      { name: '糖', category: '调料', selected: true, staple: true },
      { name: '食用油', category: '调料', selected: true, staple: true },
      { name: '蚝油', category: '调料', selected: true, staple: true },
      { name: '料酒', category: '调料', selected: true, staple: true },
      { name: '淀粉', category: '调料', selected: true, staple: true },
      { name: '豆瓣酱', category: '调料', selected: false, staple: true },
      { name: '番茄酱', category: '调料', selected: false, staple: true },
    ],
  },
  {
    name: '香料配菜',
    desc: '家里常放就勾上',
    items: [
      { name: '葱', category: '蔬菜', selected: false, staple: true },
      { name: '姜', category: '蔬菜', selected: false, staple: true },
      { name: '蒜', category: '蔬菜', selected: false, staple: true },
      { name: '辣椒', category: '蔬菜', selected: false, staple: true },
      { name: '香菜', category: '蔬菜', selected: false, staple: true },
      { name: '小米辣', category: '蔬菜', selected: false, staple: true },
      { name: '青椒', category: '蔬菜', selected: false, staple: false },
    ],
  },
  {
    name: '基础食材',
    desc: '按实际情况选择',
    items: [
      { name: '鸡蛋', category: '肉蛋', selected: false, staple: false },
      { name: '米', category: '主食', selected: false, staple: true },
      { name: '面', category: '主食', selected: false, staple: true },
      { name: '土豆', category: '蔬菜', selected: false, staple: false },
      { name: '番茄', category: '蔬菜', selected: false, staple: false },
      { name: '豆腐', category: '蔬菜', selected: false, staple: false },
      { name: '西兰花', category: '蔬菜', selected: false, staple: false },
      { name: '猪肉', category: '肉蛋', selected: false, staple: false },
      { name: '鸡胸肉', category: '肉蛋', selected: false, staple: false },
      { name: '虾仁', category: '肉蛋', selected: false, staple: false },
    ],
  },
]

function buildGuideGroups(groups) {
  return groups.map((group, groupIndex) => ({
    ...group,
    groupIndex,
    items: group.items.map((item, itemIndex) => ({
      ...item,
      groupIndex,
      itemIndex,
      viewKey: `${group.name}-${item.name}`,
    })),
  }))
}

Page({
  data: {
    name: '',
    qty: '',
    unit: '',
    category: '其他',
    categoryOptions: CATEGORIES.map(name => ({ name, active: name === '其他' })),
    items: [],
    itemGroups: [],
    collapsedGroups: { 调料: true },  // 调料默认收起，平常不常翻
    openedItemId: '',                 // 当前左滑展开删除的食材
    touchStartX: 0,
    touchStartY: 0,
    urgentItems: [],
    soonCount: 0,
    expiredCount: 0,
    reminderText: '',
    isEmpty: true,
    showGuide: false,
    guideGroups: buildGuideGroups(BASIC_GROUPS),
    showOcrModal: false,
    ocrResults: [],
  },

  onLoad() {
    this.loadItems(true)
  },

  onShow() {
    track.track('page_view', { page: 'fridge' })
    this.loadItems(false)
  },

  async loadItems(allowGuide) {
    const cached = fridgeStore.getCachedItems()
    this.setItems(cached)

    const items = await fridgeStore.getItems()
    this.setItems(items)

    // 库存为空 + 首次进入 + 没手动关过 → 自动弹快捷选择
    if (allowGuide && this.data.isEmpty && !wx.getStorageSync(GUIDE_STORAGE_KEY)) {
      this.setData({ showGuide: true })
    }
  },

  setItems(items) {
    const viewItems = fridgeStore.normalizeItems(items).map(item => ({
      ...item,
      viewKey: item.cloudId || item.id,
      freshnessClass: item.freshnessStatus === 'expired' ? 'expired-text' : (item.freshnessStatus === 'soon' ? 'soon-text' : ''),
      // 右侧只显示真实数量/重量，"常备" 这类状态归到下方保鲜行
      qtyText: (item.amount && item.amount !== '常备') ? item.amount : '',
    }))
    const summary = freshnessUtils.buildFreshnessSummary(viewItems)
    const urgentItems = summary.urgentItems.slice(0, 4).map(item => ({
      ...item,
      urgentClass: item.freshnessStatus === 'expired' ? 'urgent-expired' : 'urgent-soon',
    }))
    this.setData({
      items: viewItems,
      itemGroups: this.buildItemGroups(viewItems),
      urgentItems,
      soonCount: summary.soonCount,
      expiredCount: summary.expiredCount,
      reminderText: this.buildReminderText(summary),
      isEmpty: viewItems.length === 0,
    })
  },

  buildReminderText(summary) {
    if (summary.expiredCount) return `有 ${summary.expiredCount} 个食材已经过期，优先处理`
    if (summary.soonCount) return `有 ${summary.soonCount} 个食材这两天要先吃`
    return '库存状态正常，先从想吃的菜开始'
  },

  buildItemGroups(items) {
    const collapsed = this.data.collapsedGroups || {}
    return CATEGORIES.map(category => {
      const groupItems = items
        .filter(item => item.category === category)
        .sort((a, b) => (b.urgencyScore - a.urgencyScore) || ((a.daysLeft || 999) - (b.daysLeft || 999)))
      return {
        name: category,
        count: groupItems.length,
        items: groupItems,
        collapsed: !!collapsed[category],
      }
    }).filter(group => group.items.length)
  },

  onItemTouchStart(e) {
    const touch = e.changedTouches[0]
    this.setData({ touchStartX: touch.clientX, touchStartY: touch.clientY })
  },

  onItemTouchEnd(e) {
    const touch = e.changedTouches[0]
    const deltaX = touch.clientX - this.data.touchStartX
    const deltaY = touch.clientY - this.data.touchStartY
    // 竖向滑动或滑动距离不够，视为没操作 / 收起
    if (Math.abs(deltaY) > 40 || Math.abs(deltaX) < 50) {
      this.closeItemSwipe()
      return
    }
    const id = String(e.currentTarget.dataset.id)
    this.setData({ openedItemId: deltaX < 0 ? id : '' })
  },

  closeItemSwipe() {
    if (this.data.openedItemId) this.setData({ openedItemId: '' })
  },

  // 行内改数字
  onItemQtyNum(e) {
    const id = String(e.currentTarget.dataset.id)
    const qty = (e.detail.value || '').trim()
    const item = this.data.items.find(it => String(it.id) === id)
    if (!item || (item.qty || '') === qty) return
    const items = fridgeStore.updateAmount(id, qty, item.unit || '')
    track.track('fridge_qty_edit')
    this.setItems(items)
  },

  // 行内改单位
  onItemUnit(e) {
    const id = String(e.currentTarget.dataset.id)
    const unit = (e.detail.value || '').trim()
    const item = this.data.items.find(it => String(it.id) === id)
    if (!item || (item.unit || '') === unit) return
    const items = fridgeStore.updateAmount(id, item.qty || '', unit)
    this.setItems(items)
  },

  // 左滑切换是否常备
  toggleStaple(e) {
    const id = String(e.currentTarget.dataset.id)
    const staple = e.currentTarget.dataset.staple
    const items = fridgeStore.setStaple(id, !staple)
    this.setData({ openedItemId: '' })
    this.setItems(items)
  },

  toggleGroup(e) {
    this.closeItemSwipe()
    const name = e.currentTarget.dataset.name
    const collapsedGroups = {
      ...this.data.collapsedGroups,
      [name]: !this.data.collapsedGroups[name],
    }
    const itemGroups = this.data.itemGroups.map(g =>
      g.name === name ? { ...g, collapsed: !g.collapsed } : g
    )
    this.setData({ collapsedGroups, itemGroups })
  },

  openGuide() {
    this.setData({ showGuide: true })
  },

  closeGuide() {
    wx.setStorageSync(GUIDE_STORAGE_KEY, true)
    this.setData({ showGuide: false })
  },

  toggleGuideItem(e) {
    const groupIndex = Number(e.currentTarget.dataset.group)
    const itemIndex = Number(e.currentTarget.dataset.index)
    const guideGroups = this.data.guideGroups.map(group => ({
      ...group,
      items: group.items.map(item => ({ ...item })),
    }))
    const item = guideGroups[groupIndex].items[itemIndex]
    item.selected = !item.selected
    this.setData({ guideGroups })
  },

  async addBasicInventory() {
    const selected = []
    this.data.guideGroups.forEach(group => {
      group.items.forEach(item => {
        if (item.selected) selected.push(item)
      })
    })
    if (!selected.length) {
      wx.showToast({ title: '先勾选一些食材', icon: 'none' })
      return
    }

    const existing = new Set(fridgeStore.getCachedItems().map(item => item.name))
    const toAdd = []
    selected.forEach(item => {
      if (existing.has(item.name)) return
      existing.add(item.name)
      toAdd.push({
        id: 'f-' + item.name,
        name: item.name,
        qty: '',
        unit: '',
        category: item.category,
        staple: !!item.staple,
        source: 'guide',
      })
    })
    // 本地即时写入，云端后台同步
    const items = fridgeStore.saveItemsBatch(toAdd)
    if (toAdd.length) track.track('fridge_add', { source: 'guide', count: toAdd.length })
    wx.setStorageSync(GUIDE_STORAGE_KEY, true)
    this.setData({ showGuide: false })
    this.setItems(items)
    wx.showToast({ title: '已添加基础食材', icon: 'success' })
  },

  onNameInput(e) {
    const name = e.detail.value
    const category = ingredientClassifier.classifyIngredient(name)
    this.setData({
      name,
      category,
      categoryOptions: CATEGORIES.map(item => ({ name: item, active: item === category })),
    })
  },

  onQtyInput(e) {
    this.setData({ qty: e.detail.value })
  },
  onUnitInput(e) {
    this.setData({ unit: e.detail.value })
  },

  selectCategory(e) {
    const category = e.currentTarget.dataset.category
    this.setData({
      category,
      categoryOptions: CATEGORIES.map(name => ({ name, active: name === category })),
    })
  },

  async saveFridgeItem() {
    const name = this.data.name.trim()
    if (!name) {
      wx.showToast({ title: '请输入食材名', icon: 'none' })
      return
    }

    const items = fridgeStore.saveItemsBatch([{
      id: 'f-' + name,
      name,
      qty: this.data.qty.trim(),
      unit: this.data.unit.trim(),
      category: this.data.category,
      staple: this.data.category === '调料',
      source: 'manual',
    }])
    track.track('fridge_add', { source: 'manual', count: 1 })
    wx.showToast({ title: '已加入', icon: 'success' })
    this.setData({
      name: '',
      qty: '',
      unit: '',
      category: '其他',
      categoryOptions: CATEGORIES.map(item => ({ name: item, active: item === '其他' })),
    })
    this.setItems(items)
  },

  scanOcr() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: res => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file || !file.tempFilePath) return
        this.uploadAndOcr(file.tempFilePath)
      },
    })
  },

  async uploadAndOcr(tempFilePath) {
    wx.showLoading({ title: '识别中…' })
    try {
      const extMatch = tempFilePath.match(/\.([a-zA-Z0-9]+)(\?|$)/)
      const ext = extMatch ? extMatch[1] : 'jpg'
      const cloudPath = `ocr-tmp/${Date.now()}.${ext}`
      const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: tempFilePath })
      const fileID = uploadRes.fileID

      const callRes = await wx.cloud.callFunction({
        name: 'ocrFridge',
        data: { fileID },
      })
      wx.hideLoading()

      const blocks = (callRes.result && callRes.result.textDetections) || []
      const seen = new Set()
      const ocrResults = []
      blocks.forEach(b => {
        // 1) 先在整行上判噪声（保留括号里的“门店/市场”等信号）
        const cleaned = ocrCleanLine(b.DetectedText)
        if (!cleaned || ocrIsJunk(cleaned)) return
        // 2) 拆出重量/份数
        let { name, amount } = ocrSplitNameAmount(cleaned)
        // 3) 去括号备注、去“约/净重”等尾缀
        name = name.replace(/[(（][^)）]*[)）]\s*$/g, '').trim()
        name = name.replace(/[约重计]+$/, '').trim()
        if (!name || ocrIsJunk(name)) return
        // 4) 只保留命中食材词库的项
        if (!ocrIsFood(name)) return
        if (seen.has(name)) return
        seen.add(name)
        ocrResults.push({ text: name, amount, selected: true })
      })

      this.setData({ showOcrModal: true, ocrResults })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '识别失败，请重试', icon: 'none' })
      console.error('ocr failed', err)
    }
  },

  toggleOcrItem(e) {
    const index = Number(e.currentTarget.dataset.index)
    const ocrResults = this.data.ocrResults.map((item, i) =>
      i === index ? { ...item, selected: !item.selected } : item
    )
    this.setData({ ocrResults })
  },

  closeOcrModal() {
    this.setData({ showOcrModal: false, ocrResults: [] })
  },

  confirmOcrItems() {
    const selected = this.data.ocrResults.filter(item => item.selected)
    if (!selected.length) {
      wx.showToast({ title: '没有勾选任何食材', icon: 'none' })
      return
    }
    const existing = new Set(fridgeStore.getCachedItems().map(item => item.name))
    const toAdd = []
    selected.forEach(item => {
      const name = item.text
      if (existing.has(name)) return
      existing.add(name)
      const category = ingredientClassifier.classifyIngredient(name)
      const parsed = amountUtils.parseAmount(item.amount || '')
      toAdd.push({
        id: 'f-' + name,
        name,
        qty: parsed.qty,
        unit: parsed.unit,
        category,
        staple: category === '调料',
        source: 'ocr',
      })
    })
    // 本地即时写入，云端后台同步
    const items = fridgeStore.saveItemsBatch(toAdd)
    if (toAdd.length) track.track('fridge_add', { source: 'ocr', count: toAdd.length })
    this.setData({ showOcrModal: false, ocrResults: [] })
    this.setItems(items)
    wx.showToast({
      title: toAdd.length ? `已加入 ${toAdd.length} 个食材` : '这些食材冰箱里已有',
      icon: toAdd.length ? 'success' : 'none',
    })
  },

  deleteFridgeItem(e) {
    const id = String(e.currentTarget.dataset.id)
    wx.showModal({
      title: '删除食材',
      content: '确定从冰箱移除这个食材吗？',
      confirmColor: '#E5534B',
      success: async res => {
        if (!res.confirm) return
        const items = await fridgeStore.deleteItem(id)
        this.setItems(items)
      },
    })
  },
})

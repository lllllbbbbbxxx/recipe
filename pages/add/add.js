const dishStore = require('../../utils/dish-store')
const ingredientClassifier = require('../../utils/ingredient-classifier')
const track = require('../../utils/track')

const TAGS = ['快手', '清淡', '下饭', '辣', '汤', '家常', '鲜香']
const MEAL_ROLES = ['荤菜', '素菜', '汤', '主食', '小吃']
const COMMON_SEASONINGS = ['盐', '生抽', '老抽', '白糖', '糖', '醋', '料酒', '蚝油', '胡椒粉', '淀粉', '食用油', '姜', '蒜', '葱']

// 给食材行生成稳定 key（wx:key 用，避免头部插入/删除时输入框状态串位）
let ingRowSeq = 0
function withRowKeys(list) {
  return (list || []).map(item => item.rowKey ? item : { ...item, rowKey: 'r' + (++ingRowSeq) + '-' + Date.now() })
}
const DISH_TEMPLATES = {
  糖醋排骨: {
    mealRole: '荤菜',
    tags: ['下饭', '鲜香'],
    ingredients: [
      { name: '排骨', amount: '500g' },
      { name: '冰糖', amount: '适量' },
      { name: '生抽', amount: '2勺' },
      { name: '香醋', amount: '3勺' },
      { name: '料酒', amount: '1勺' },
      { name: '姜', amount: '适量' },
    ],
  },
  青椒肉丝: {
    mealRole: '荤菜',
    tags: ['快手', '下饭'],
    ingredients: [
      { name: '青椒', amount: '2个' },
      { name: '猪肉', amount: '200g' },
      { name: '生抽', amount: '1勺' },
      { name: '淀粉', amount: '适量' },
      { name: '蒜', amount: '适量' },
    ],
  },
  可乐鸡翅: {
    mealRole: '荤菜',
    tags: ['下饭', '鲜香'],
    ingredients: [
      { name: '鸡翅', amount: '8个' },
      { name: '可乐', amount: '1罐' },
      { name: '生抽', amount: '2勺' },
      { name: '姜', amount: '适量' },
    ],
  },
  鱼香肉丝: {
    mealRole: '荤菜',
    tags: ['下饭', '辣'],
    ingredients: [
      { name: '猪肉', amount: '200g' },
      { name: '木耳', amount: '适量' },
      { name: '胡萝卜', amount: '半根' },
      { name: '青椒', amount: '1个' },
      { name: '豆瓣酱', amount: '1勺' },
    ],
  },
  宫保鸡丁: {
    mealRole: '荤菜',
    tags: ['下饭', '辣'],
    ingredients: [
      { name: '鸡胸肉', amount: '250g' },
      { name: '花生米', amount: '适量' },
      { name: '黄瓜', amount: '半根' },
      { name: '干辣椒', amount: '适量' },
      { name: '生抽', amount: '1勺' },
    ],
  },
  清炒西兰花: {
    mealRole: '素菜',
    tags: ['快手', '清淡'],
    ingredients: [
      { name: '西兰花', amount: '1颗' },
      { name: '蒜', amount: '适量' },
      { name: '盐', amount: '适量' },
    ],
  },
  紫菜蛋花汤: {
    mealRole: '汤',
    tags: ['汤', '清淡'],
    ingredients: [
      { name: '紫菜', amount: '适量' },
      { name: '鸡蛋', amount: '2个' },
      { name: '葱花', amount: '适量' },
      { name: '盐', amount: '适量' },
    ],
  },
  土豆丝: {
    mealRole: '素菜',
    tags: ['快手', '家常'],
    ingredients: [
      { name: '土豆', amount: '2个' },
      { name: '青椒', amount: '1个' },
      { name: '醋', amount: '1勺' },
      { name: '盐', amount: '适量' },
    ],
  },
}

Page({
  data: {
    isEdit: false,
    editingId: '',
    name: '',
    coverImage: '',
    mealRole: '',
    mealRoleOptions: MEAL_ROLES.map(name => ({ name, active: false })),
    tags: [],
    customTagName: '',
    tagOptions: TAGS.map(name => ({ name, active: false })),
    ingredients: [{ name: '', amount: '' }],
    commonSeasonings: COMMON_SEASONINGS,
    autoFillText: '',
    hasUserEditedDetails: false,
    hasManualMealRole: false,
    hasManualTags: false,
    saveButtonText: '保存菜谱',
  },

  onLoad(options) {
    // 初始数据里的食材行补上稳定 rowKey
    this.setData({ ingredients: withRowKeys(this.data.ingredients) })
    const saved = dishStore.getCachedDishes()
    const tagNames = [...TAGS]
    saved.forEach(dish => {
      const tags = dish.tags || []
      tags.forEach(tag => {
        if (!tagNames.includes(tag)) tagNames.push(tag)
      })
    })

    const editingId = options && options.id ? String(options.id) : ''
    if (editingId) {
      const dish = saved.find(item => String(item.id) === editingId)
      if (dish) {
        const tags = dish.tags || []
        this.setData({
          isEdit: true,
          editingId,
          name: dish.name,
          coverImage: dish.coverImage || '',
          mealRole: dish.mealRole || '',
          tags,
          ingredients: withRowKeys(dish.ingredients && dish.ingredients.length ? dish.ingredients : [{ name: '', amount: '' }]),
          mealRoleOptions: this.buildMealRoleOptions(dish.mealRole || ''),
          tagOptions: this.buildTagOptions(tagNames, tags),
          hasUserEditedDetails: true,
          hasManualMealRole: true,
          hasManualTags: true,
          saveButtonText: '保存修改',
        })
        wx.setNavigationBarTitle({ title: '编辑菜谱' })
        return
      }
    }

    this.setData({ tagOptions: this.buildTagOptions(tagNames, this.data.tags) })
  },

  onNameInput(e) {
    const name = e.detail.value
    this.setData({ name }, () => this.tryAutoFillDish(name))
  },

  chooseCover() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: res => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file || !file.tempFilePath) return
        this.compressAndSaveCover(file.tempFilePath)
      },
    })
  },

  // 上传前再压一道：封面只当缩略图，缩到 800px 宽 + 降质量，省空间又加快加载
  compressAndSaveCover(tempFilePath) {
    wx.compressImage({
      src: tempFilePath,
      quality: 75,
      compressedWidth: 800,
      success: res => this.saveCoverFile(res.tempFilePath),
      fail: () => this.saveCoverFile(tempFilePath),
    })
  },

  saveCoverFile(tempFilePath) {
    wx.saveFile({
      tempFilePath,
      success: res => {
        this.setData({ coverImage: res.savedFilePath })
      },
      fail: () => {
        this.setData({ coverImage: tempFilePath })
      },
    })
  },

  removeCover() {
    this.setData({ coverImage: '' })
  },

  selectMealRole(e) {
    const role = e.currentTarget.dataset.role
    const mealRole = this.data.mealRole === role ? '' : role
    this.setData({
      mealRole,
      mealRoleOptions: this.buildMealRoleOptions(mealRole),
      hasUserEditedDetails: true,
      hasManualMealRole: true,
      autoFillText: '',
    })
  },

  toggleTag(e) {
    const tag = e.currentTarget.dataset.tag
    let tags = this.data.tags
    if (tags.includes(tag)) {
      tags = tags.filter(item => item !== tag)
    } else {
      if (tags.length >= 2) {
        wx.showToast({ title: '最多选择 2 个标签', icon: 'none' })
        return
      }
      tags = [...tags, tag]
    }
    this.setData({
      tags,
      tagOptions: this.buildTagOptions(this.data.tagOptions.map(item => item.name), tags),
      hasUserEditedDetails: true,
      hasManualTags: true,
      autoFillText: '',
    })
  },

  onCustomTagInput(e) {
    this.setData({ customTagName: e.detail.value })
  },

  addCustomTag() {
    const tag = this.data.customTagName.trim()
    if (!tag) {
      wx.showToast({ title: '请输入标签', icon: 'none' })
      return
    }
    const tagNames = this.data.tagOptions.map(item => item.name)
    if (tagNames.includes(tag)) {
      wx.showToast({ title: '标签已存在', icon: 'none' })
      this.setData({ customTagName: '' })
      return
    }
    if (this.data.tags.length >= 2) {
      wx.showToast({ title: '最多选择 2 个标签', icon: 'none' })
      return
    }
    const tags = [...this.data.tags, tag]
    this.setData({
      tags,
      customTagName: '',
      tagOptions: this.buildTagOptions([...tagNames, tag], tags),
      hasUserEditedDetails: true,
      hasManualTags: true,
      autoFillText: '',
    })
  },

  addIngredient() {
    // 新食材加在最上面，食材多时不用下翻
    this.setData({
      ingredients: withRowKeys([{ name: '', amount: '' }, ...this.data.ingredients]),
      hasUserEditedDetails: true,
      autoFillText: '',
    })
  },

  // 点常用调料 chip：已有则提示，没有就加到顶部（默认用量"适量"）
  quickAddSeasoning(e) {
    const name = e.currentTarget.dataset.name
    if (this.data.ingredients.some(i => (i.name || '').trim() === name)) {
      wx.showToast({ title: `已添加${name}`, icon: 'none' })
      return
    }
    // 若第一行是空行，直接填进去，避免留空行
    let ingredients
    const first = this.data.ingredients[0]
    if (first && !(first.name || '').trim() && !(first.amount || '').trim()) {
      ingredients = [{ name, amount: '适量' }, ...this.data.ingredients.slice(1)]
    } else {
      ingredients = [{ name, amount: '适量' }, ...this.data.ingredients]
    }
    this.setData({ ingredients: withRowKeys(ingredients), hasUserEditedDetails: true, autoFillText: '' })
  },

  removeIngredient(e) {
    const index = Number(e.currentTarget.dataset.index)
    const ingredients = this.data.ingredients.filter((_, i) => i !== index)
    this.setData({
      ingredients: withRowKeys(ingredients.length ? ingredients : [{ name: '', amount: '' }]),
      hasUserEditedDetails: true,
      autoFillText: '',
    })
  },

  onIngredientNameInput(e) {
    const index = Number(e.currentTarget.dataset.index)
    const ingredients = this.data.ingredients.map((item, i) => (
      i === index ? { ...item, name: e.detail.value } : item
    ))
    this.setData({
      ingredients,
      ...this.buildAutoMetaData(ingredients),
      hasUserEditedDetails: true,
      autoFillText: '',
    })
  },

  onIngredientAmountInput(e) {
    const index = Number(e.currentTarget.dataset.index)
    const ingredients = this.data.ingredients.map((item, i) => (
      i === index ? { ...item, amount: e.detail.value } : item
    ))
    this.setData({ ingredients, hasUserEditedDetails: true, autoFillText: '' })
  },

  async saveDish() {
    const name = this.data.name.trim()
    const ingredients = this.data.ingredients
      .map(item => ({ name: item.name.trim(), amount: item.amount.trim() }))
      .filter(item => item.name)

    if (!name) {
      wx.showToast({ title: '请输入菜名', icon: 'none' })
      return
    }
    if (!ingredients.length) {
      wx.showToast({ title: '请添加食材', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中' })

    const saved = dishStore.getCachedDishes()
    const oldDish = this.data.isEdit
      ? saved.find(item => String(item.id) === this.data.editingId)
      : null
    const now = Date.now()
    const dish = {
      id: this.data.isEdit ? this.data.editingId : String(Date.now()),
      cloudId: oldDish && oldDish.cloudId ? oldDish.cloudId : '',
      name,
      coverImage: this.data.coverImage,
      mealRole: this.data.mealRole,
      tags: this.data.tags,
      ingredients,
      createdAt: oldDish && oldDish.createdAt ? oldDish.createdAt : now,
      updatedAt: now,
    }

    try {
      await dishStore.saveDish(dish)
      if (!this.data.isEdit) track.track('dish_add_success', { source: 'manual' })
      wx.hideLoading()
      wx.showToast({ title: this.data.isEdit ? '已修改' : '已保存', icon: 'success' })
      this.backToMenu()
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '保存失败', icon: 'none' })
      console.error('save dish failed', err)
    }
  },

  buildTagOptions(tagNames, activeTags) {
    return tagNames.map(name => ({ name, active: activeTags.includes(name) }))
  },

  buildMealRoleOptions(activeRole) {
    return MEAL_ROLES.map(name => ({ name, active: name === activeRole }))
  },

  buildAutoMetaData(ingredients) {
    const meta = ingredientClassifier.inferDishMeta(ingredients)
    const data = {}
    if (!this.data.hasManualMealRole && meta.mealRole) {
      data.mealRole = meta.mealRole
      data.mealRoleOptions = this.buildMealRoleOptions(meta.mealRole)
    }
    if (!this.data.hasManualTags && meta.tags.length) {
      const tagNames = this.data.tagOptions.map(item => item.name)
      const nextTagNames = [...tagNames]
      meta.tags.forEach(tag => {
        if (!nextTagNames.includes(tag)) nextTagNames.push(tag)
      })
      data.tags = meta.tags
      data.tagOptions = this.buildTagOptions(nextTagNames, meta.tags)
    }
    return data
  },

  backToMenu() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack()
      return
    }
    wx.redirectTo({ url: '/pages/menu/menu' })
  },

  tryAutoFillDish(name) {
    if (this.data.isEdit || this.data.hasUserEditedDetails) return
    const dishName = name.trim()
    const template = DISH_TEMPLATES[dishName]
    if (!template) {
      this.setData({ autoFillText: '' })
      return
    }

    const currentTagNames = this.data.tagOptions.map(item => item.name)
    const tagNames = [...currentTagNames]
    template.tags.forEach(tag => {
      if (!tagNames.includes(tag)) tagNames.push(tag)
    })

    this.setData({
      mealRole: template.mealRole || '',
      mealRoleOptions: this.buildMealRoleOptions(template.mealRole || ''),
      tags: template.tags,
      ingredients: withRowKeys(template.ingredients.map(item => ({ ...item }))),
      tagOptions: this.buildTagOptions(tagNames, template.tags),
      autoFillText: '已根据菜名自动填充食材和标签，可继续修改',
    })
  },
})

Page({
  data: {
    chefId: '',
    dishes: [],
    selectedIds: [],
    guestName: '',
    note: '',
    loading: true,
    submitting: false,
    submitted: false,
    empty: false,
  },

  onLoad(options) {
    const chefId = options.chefId || ''
    this.setData({ chefId })
    if (!chefId) {
      this.setData({ loading: false, empty: true })
      return
    }
    this.loadDishes(chefId)
  },

  async loadDishes(chefId) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getChefDishes',
        data: { chefId },
      })
      const dishes = (res.result && res.result.dishes) || []
      this.setData({
        dishes: dishes.map(d => ({
          id: String(d.id || d._id),
          name: d.name,
          mealRole: d.mealRole || '',
          tags: (d.tags || []).slice(0, 2),
          ingredients: d.ingredients || [],
          coverImage: d.coverImage || '',
          ingredientText: (d.ingredients || []).map(i => i.name).slice(0, 3).join('、'),
        })),
        loading: false,
        empty: dishes.length === 0,
      })
    } catch (err) {
      console.error('loadDishes failed', err)
      this.setData({ loading: false, empty: true })
      wx.showToast({ title: '加载失败，请重试', icon: 'none' })
    }
  },

  toggleDish(e) {
    const id = String(e.currentTarget.dataset.id)
    let { selectedIds } = this.data
    if (selectedIds.includes(id)) {
      selectedIds = selectedIds.filter(i => i !== id)
    } else {
      selectedIds = [...selectedIds, id]
    }
    this.setData({ selectedIds })
  },

  onNameInput(e) {
    this.setData({ guestName: e.detail.value })
  },

  onNoteInput(e) {
    this.setData({ note: e.detail.value })
  },

  async submitOrder() {
    if (!this.data.guestName.trim()) {
      wx.showToast({ title: '先填一下你的名字', icon: 'none' })
      return
    }
    if (!this.data.selectedIds.length) {
      wx.showToast({ title: '先选几道菜', icon: 'none' })
      return
    }
    if (this.data.submitting) return

    const selectedDishes = this.data.dishes
      .filter(d => this.data.selectedIds.includes(d.id))
      .map(d => ({ id: d.id, name: d.name }))

    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中…' })
    try {
      const db = wx.cloud.database()
      await db.collection('orders').add({
        data: {
          chefOpenid: this.data.chefId,
          guestName: this.data.guestName.trim(),
          selectedDishes,
          note: this.data.note.trim(),
          status: 'pending',
          createdAt: Date.now(),
        },
      })
      wx.hideLoading()
      this.setData({ submitted: true, submitting: false })
    } catch (err) {
      wx.hideLoading()
      this.setData({ submitting: false })
      wx.showToast({ title: '提交失败，请重试', icon: 'none' })
      console.error('submitOrder failed', err)
    }
  },
})

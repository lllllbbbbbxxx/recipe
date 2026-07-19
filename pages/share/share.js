const shareStore = require('../../utils/share-store')
const track = require('../../utils/track')

Page({
  data: {
    chefId: '',
    menuId: '',
    dishes: [],
    selectedIds: [],
    guestName: '',
    guestAvatar: '',
    note: '',
    loading: true,
    empty: false,
    submitting: false,
    guestOpenid: '',
    myOrders: [],
    editingOrderId: '',
    showMyOrders: false,
  },

  openMyOrders() { this.setData({ showMyOrders: true }) },
  closeMyOrders() { this.setData({ showMyOrders: false }) },

  onLoad(options) {
    const menuId = options.menuId || ''
    const chefId = options.chefId || ''
    this.setData({ menuId, chefId })
    // 裂变漏斗第二环：分享链接被打开
    track.track('share_open', { menuId: menuId || '', mode: menuId ? 'snapshot' : 'chef' })
    if (menuId) {
      this.loadByMenuId(menuId)
    } else if (chefId) {
      this.loadDishes(chefId)
    } else {
      this.setData({ loading: false, empty: true })
    }
  },

  mapDish(d) {
    return {
      id: String(d.id || d._id),
      name: d.name,
      mealRole: d.mealRole || '',
      tags: (d.tags || []).slice(0, 2),
      ingredients: d.ingredients || [],
      coverImage: d.coverImage || '',
      ingredientText: (d.ingredients || []).map(i => i.name).slice(0, 3).join('、'),
      selected: false,
    }
  },

  // 按 menuId 读分享快照（好友只看到这一份）
  async loadByMenuId(menuId) {
    const snap = await shareStore.getSharedMenu(menuId)
    if (!snap) {
      this.setData({ loading: false, empty: true })
      return
    }
    const dishes = (snap.dishes || []).map(d => this.mapDish(d))
    this.setData({ chefId: snap.chefOpenid || '', dishes, loading: false, empty: dishes.length === 0 })
    this.loadMyOrders(true)
  },

  // 旧链接：按 chefId 拉全部菜谱
  async loadDishes(chefId) {
    try {
      const res = await wx.cloud.callFunction({ name: 'getChefDishes', data: { chefId } })
      const dishes = (res.result && res.result.dishes) || []
      this.setData({ dishes: dishes.map(d => this.mapDish(d)), loading: false, empty: dishes.length === 0 })
      this.loadMyOrders(true)
    } catch (err) {
      console.error('loadDishes failed', err)
      this.setData({ loading: false, empty: true })
      wx.showToast({ title: '加载失败，请重试', icon: 'none' })
    }
  },

  // 加载"我给这位厨师点过的单"；autoOpen=true 时若有单则自动弹出
  async loadMyOrders(autoOpen) {
    const chefId = this.data.chefId
    if (!chefId) return
    let openid = this.data.guestOpenid
    if (!openid && wx.cloud) {
      try {
        const r = await wx.cloud.callFunction({ name: 'getOpenid' })
        openid = r.result && r.result.openid
      } catch (e) {}
      this.setData({ guestOpenid: openid || '' })
    }
    if (!openid) return
    const menuId = this.data.menuId
    try {
      // 「我的点单」= 我的全部历史订单（跨厨师）
      const res = await wx.cloud.database().collection('orders')
        .where({ _openid: openid })
        .orderBy('createdAt', 'desc').limit(30).get()
      const myOrders = (res.data || []).map(o => ({
        id: o._id,
        guestName: o.guestName || '',
        dishNames: (o.selectedDishes || []).map(d => d.name).join('、'),
        selectedDishes: o.selectedDishes || [],
        note: o.note || '',
        status: o.status || 'pending',
        menuId: o.menuId || '',
        chefOpenid: o.chefOpenid || '',
        editable: (o.chefOpenid || '') === chefId,   // 只有当前菜单的单才能在此页修改
        timeText: this.formatTime(o.createdAt),
      }))
      this.setData({ myOrders })
      // 自动跳转只看"这个链接"点没点过：menuId 优先，旧链接按 chefId
      const orderedThisLink = myOrders.some(o => menuId ? o.menuId === menuId : o.chefOpenid === chefId)
      if (autoOpen && orderedThisLink) this.setData({ showMyOrders: true })
    } catch (e) {
      console.warn('load my orders failed', e)
    }
  },

  formatTime(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    const mo = d.getMonth() + 1
    const day = d.getDate()
    const h = String(d.getHours()).padStart(2, '0')
    const m = String(d.getMinutes()).padStart(2, '0')
    return `${mo}/${day} ${h}:${m}`
  },

  toggleDish(e) {
    const id = String(e.currentTarget.dataset.id)
    const dishes = this.data.dishes.map(d => d.id === id ? { ...d, selected: !d.selected } : d)
    this.setData({ dishes, selectedIds: dishes.filter(d => d.selected).map(d => d.id) })
  },

  onNameInput(e) { this.setData({ guestName: e.detail.value }) },
  onNoteInput(e) { this.setData({ note: e.detail.value }) },

  onChooseAvatar(e) {
    const url = e.detail && e.detail.avatarUrl
    if (url) this.setData({ guestAvatar: url })
  },

  async uploadAvatar() {
    const path = this.data.guestAvatar
    if (!path || path.indexOf('cloud://') === 0 || path.indexOf('http') === 0) return path || ''
    try {
      const ext = (path.match(/\.([a-zA-Z0-9]+)(\?|$)/) || [])[1] || 'png'
      const res = await wx.cloud.uploadFile({
        cloudPath: `order-avatars/${this.data.chefId}-${Date.now()}.${ext}`,
        filePath: path,
      })
      return res.fileID || ''
    } catch (err) {
      console.warn('avatar upload failed', err)
      return ''
    }
  },

  // 修改：把某条订单的选择载入编辑
  editOrder(e) {
    const id = e.currentTarget.dataset.id
    const order = this.data.myOrders.find(o => o.id === id)
    if (!order) return
    if (!order.editable) {
      wx.showToast({ title: '这是其他菜单的点单，无法在此修改', icon: 'none' })
      return
    }
    const ids = order.selectedDishes.map(d => String(d.id))
    const dishes = this.data.dishes.map(d => ({ ...d, selected: ids.includes(d.id) }))
    this.setData({
      dishes,
      selectedIds: dishes.filter(d => d.selected).map(d => d.id),
      guestName: order.guestName || this.data.guestName,
      note: order.note,
      editingOrderId: id,
      showMyOrders: false,
    })
    wx.pageScrollTo({ scrollTop: 0, duration: 200 })
    wx.showToast({ title: '已载入，改完点更新', icon: 'none' })
  },

  cancelEdit() {
    this.setData({
      editingOrderId: '',
      note: '',
      selectedIds: [],
      dishes: this.data.dishes.map(d => ({ ...d, selected: false })),
    })
  },

  deleteOrder(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除点单', content: '确定删除这条点单吗？', confirmColor: '#C0392B',
      success: async res => {
        if (!res.confirm) return
        try {
          const r = await wx.cloud.callFunction({ name: 'orderAction', data: { action: 'delete', id } })
          if (!r.result || !r.result.ok) throw new Error((r.result && r.result.error) || 'fail')
          track.track('order_delete')
          this.setData({ myOrders: this.data.myOrders.filter(o => o.id !== id) })
          if (this.data.editingOrderId === id) this.cancelEdit()
        } catch (err) {
          console.error('deleteOrder failed', err)
          wx.showToast({ title: '删除失败：' + ((err && err.message) || '请重试'), icon: 'none', duration: 3000 })
        }
      },
    })
  },

  async submitOrder() {
    if (!this.data.guestName.trim()) { wx.showToast({ title: '先填一下你的名字', icon: 'none' }); return }
    if (!this.data.selectedIds.length) { wx.showToast({ title: '先选几道菜', icon: 'none' }); return }
    if (this.data.submitting) return

    const isEdit = !!this.data.editingOrderId
    const selectedDishes = this.data.dishes
      .filter(d => this.data.selectedIds.includes(d.id))
      .map(d => ({ id: d.id, name: d.name }))

    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中…' })
    try {
      // 订单写操作统一走 orderAction 云函数（服务端校验 + 建单限频）
      if (isEdit) {
        const r = await wx.cloud.callFunction({
          name: 'orderAction',
          data: { action: 'update', id: this.data.editingOrderId, selectedDishes, note: this.data.note.trim() },
        })
        if (!r.result || !r.result.ok) throw new Error((r.result && r.result.error) || 'fail')
        track.track('order_edit', { menuId: this.data.menuId || '' })
      } else {
        const guestAvatar = await this.uploadAvatar()
        const r = await wx.cloud.callFunction({
          name: 'orderAction',
          data: {
            action: 'create',
            order: {
              chefOpenid: this.data.chefId,
              menuId: this.data.menuId || '',
              guestName: this.data.guestName.trim(),
              guestAvatar,
              selectedDishes,
              note: this.data.note.trim(),
            },
          },
        })
        if (!r.result || !r.result.ok) {
          if (r.result && r.result.error === 'rate_limited') {
            wx.hideLoading()
            this.setData({ submitting: false })
            wx.showToast({ title: '下单太频繁，稍后再试', icon: 'none' })
            return
          }
          throw new Error((r.result && r.result.error) || 'fail')
        }
        track.track('order_submit', { menuId: this.data.menuId || '', dishCount: selectedDishes.length })
      }
      wx.hideLoading()
      this.setData({
        submitting: false, editingOrderId: '', note: '',
        selectedIds: [], dishes: this.data.dishes.map(d => ({ ...d, selected: false })),
      })
      wx.showToast({ title: isEdit ? '已更新' : '已提交', icon: 'success' })
      this.loadMyOrders()
    } catch (err) {
      wx.hideLoading()
      this.setData({ submitting: false })
      wx.showToast({ title: '提交失败，请重试', icon: 'none' })
      console.error('submitOrder failed', err)
    }
  },
})

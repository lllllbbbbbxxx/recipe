const track = require('../../utils/track')

Page({
  data: {
    activeTab: 'received',   // received=收到的(我当厨师) / placed=我点的(我当食客)
    receivedOrders: [],
    placedOrders: [],
    loading: true,
    openid: '',
  },

  onShow() {
    track.track('page_view', { page: 'orders', tab: this.data.activeTab })
    this.loadAll()
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    track.track('page_view', { page: 'orders', tab })
    this.setData({ activeTab: tab })
  },

  async loadAll() {
    this.setData({ loading: true })
    let openid = this.data.openid
    if (!openid) {
      try {
        const r = await wx.cloud.callFunction({ name: 'getOpenid' })
        openid = r.result && r.result.openid
      } catch (e) {}
      this.setData({ openid: openid || '' })
    }
    if (!openid) {
      this.setData({ loading: false })
      return
    }
    const db = wx.cloud.database()
    try {
      const [recv, placed] = await Promise.all([
        db.collection('orders').where({ chefOpenid: openid }).orderBy('createdAt', 'desc').limit(50).get(),
        db.collection('orders').where({ _openid: openid }).orderBy('createdAt', 'desc').limit(50).get(),
      ])
      this.setData({
        receivedOrders: (recv.data || []).map(o => this.mapReceived(o)),
        placedOrders: (placed.data || []).map(o => this.mapPlaced(o)),
        loading: false,
      })
    } catch (err) {
      console.error('loadAll failed', err)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  mapReceived(o) {
    const guestName = o.guestName || '匿名'
    return {
      id: o._id,
      guestName,
      guestAvatar: o.guestAvatar || '',
      guestInitial: guestName.trim().charAt(0) || '匿',
      selectedDishes: o.selectedDishes || [],
      note: o.note || '',
      status: o.status || 'pending',
      dishNames: (o.selectedDishes || []).map(d => d.name).join('、'),
      timeText: this.formatTime(o.createdAt),
    }
  },

  mapPlaced(o) {
    return {
      id: o._id,
      note: o.note || '',
      status: o.status || 'pending',
      dishNames: (o.selectedDishes || []).map(d => d.name).join('、'),
      timeText: this.formatTime(o.createdAt),
    }
  },

  formatTime(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    const now = new Date()
    const sameDay = d.toDateString() === now.toDateString()
    const h = String(d.getHours()).padStart(2, '0')
    const m = String(d.getMinutes()).padStart(2, '0')
    if (sameDay) return `今天 ${h}:${m}`
    return `${d.getMonth() + 1}/${d.getDate()} ${h}:${m}`
  },

  async markDone(e) {
    const id = e.currentTarget.dataset.id
    try {
      const res = await wx.cloud.callFunction({ name: 'orderAction', data: { action: 'done', id } })
      if (!res.result || !res.result.ok) throw new Error((res.result && res.result.error) || 'fail')
      track.track('order_mark_done')
      this.setData({
        receivedOrders: this.data.receivedOrders.map(o => o.id === id ? { ...o, status: 'done' } : o),
      })
    } catch (err) {
      console.error('markDone failed', err)
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  // 收到的订单 → 一键加入今日菜单
  addToMenu(e) {
    const id = e.currentTarget.dataset.id
    const order = this.data.receivedOrders.find(o => o.id === id)
    if (!order || !order.selectedDishes.length) return

    const pages = getCurrentPages()
    const menuPage = pages.find(p => p.route === 'pages/menu/menu')
    if (!menuPage) {
      wx.showToast({ title: '请从菜单页进入再试', icon: 'none' })
      return
    }
    const lib = menuPage.data.dishes || []
    const picked = []
    order.selectedDishes.forEach(sd => {
      const dish = lib.find(d => String(d.id) === String(sd.id)) || lib.find(d => d.name === sd.name)
      if (dish && !picked.find(p => String(p.id) === String(dish.id))) picked.push(dish)
    })
    if (!picked.length) {
      wx.showToast({ title: '菜谱库里找不到这些菜', icon: 'none' })
      return
    }
    const cart = menuPage.mergeCartDishes([...menuPage.data.cart, ...picked])
    menuPage.setData(menuPage.buildCartData(cart), () => menuPage.applyFilter())
    track.track('order_accept_to_menu', { dishCount: picked.length })
    wx.showToast({ title: `已加入 ${picked.length} 道菜`, icon: 'success' })
    setTimeout(() => wx.navigateBack(), 600)
  },

  // 我点的订单 → 删除
  deletePlaced(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除点单', content: '确定删除这条点单吗？', confirmColor: '#C0392B',
      success: async res => {
        if (!res.confirm) return
        try {
          const r = await wx.cloud.callFunction({ name: 'orderAction', data: { action: 'delete', id } })
          if (!r.result || !r.result.ok) throw new Error((r.result && r.result.error) || 'fail')
          this.setData({ placedOrders: this.data.placedOrders.filter(o => o.id !== id) })
        } catch (err) {
          console.error('deletePlaced failed', err)
          wx.showToast({ title: '删除失败：' + ((err && err.message) || '请重试'), icon: 'none', duration: 3000 })
        }
      },
    })
  },
})

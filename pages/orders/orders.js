Page({
  data: {
    orders: [],
    loading: true,
    empty: false,
  },

  onLoad() {
    this.loadOrders()
  },

  onShow() {
    this.loadOrders()
  },

  async loadOrders() {
    this.setData({ loading: true })
    try {
      const openidRes = await wx.cloud.callFunction({ name: 'getOpenid' })
      const openid = openidRes.result && openidRes.result.openid
      if (!openid) {
        this.setData({ loading: false, empty: true })
        return
      }

      const db = wx.cloud.database()
      const res = await db.collection('orders')
        .where({ chefOpenid: openid })
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get()

      const orders = (res.data || []).map(o => ({
        id: o._id,
        guestName: o.guestName || '匿名',
        selectedDishes: o.selectedDishes || [],
        note: o.note || '',
        status: o.status || 'pending',
        createdAt: o.createdAt || 0,
        dishNames: (o.selectedDishes || []).map(d => d.name).join('、'),
        timeText: this.formatTime(o.createdAt),
      }))

      this.setData({ orders, loading: false, empty: orders.length === 0 })
    } catch (err) {
      console.error('loadOrders failed', err)
      this.setData({ loading: false, empty: true })
      wx.showToast({ title: '加载失败', icon: 'none' })
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
    const mo = d.getMonth() + 1
    const day = d.getDate()
    return `${mo}/${day} ${h}:${m}`
  },

  async markDone(e) {
    const id = e.currentTarget.dataset.id
    try {
      const db = wx.cloud.database()
      await db.collection('orders').doc(id).update({ data: { status: 'done' } })
      const orders = this.data.orders.map(o =>
        o.id === id ? { ...o, status: 'done' } : o
      )
      this.setData({ orders })
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },
})

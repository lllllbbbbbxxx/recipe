const shareStore = require('../../utils/share-store')

Page({
  data: {
    shares: [],
    loading: true,
    empty: false,
  },

  onShow() {
    this.loadShares()
  },

  async loadShares() {
    this.setData({ loading: true })
    const app = getApp()
    let openid = app.globalData.openid
    if (!openid && wx.cloud) {
      try {
        const res = await wx.cloud.callFunction({ name: 'getOpenid' })
        openid = res.result && res.result.openid
        if (openid) app.globalData.openid = openid
      } catch (e) {}
    }
    if (!openid) {
      this.setData({ loading: false, empty: true })
      return
    }
    const raw = await shareStore.getMyShares(openid)
    const shares = raw.map(s => ({
      key: s.key,
      count: s.count || (s.dishes || []).length,
      names: (s.dishes || []).map(d => d.name).slice(0, 4).join('、') + ((s.dishes || []).length > 4 ? ' 等' : ''),
      timeText: this.formatTime(s.createdAt),
    }))
    this.setData({ shares, loading: false, empty: shares.length === 0 })
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

  // 点某条记录的"再分享"：把该快照的 key 设为本次分享目标
  onReShare(e) {
    this._shareMenuId = e.currentTarget.dataset.key
  },

  onShareAppMessage() {
    const menuId = this._shareMenuId || ''
    this._shareMenuId = ''   // 用后即焚，避免系统转发误带旧快照
    return {
      title: '来看看我给你准备的菜单，挑几道吧！',
      path: menuId ? `/pages/share/share?menuId=${menuId}` : '/pages/menu/menu',
    }
  },
})

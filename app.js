const dishStore = require('./utils/dish-store')

App({
  onLaunch() {
    try {
      dishStore.initCloud()
    } catch (err) {
      console.warn('cloud init skipped', err)
    }
    this.fetchOpenid()
  },
  globalData: {
    cloudEnv: dishStore.CLOUD_ENV,
    openid: '',
  },
  async fetchOpenid() {
    if (!wx.cloud) return
    try {
      const res = await wx.cloud.callFunction({ name: 'getOpenid' })
      if (res && res.result && res.result.openid) {
        this.globalData.openid = res.result.openid
      }
    } catch (err) {
      console.warn('getOpenid failed', err)
    }
  },
})

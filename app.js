const dishStore = require('./utils/dish-store')
const fridgeStore = require('./utils/fridge-store')
const track = require('./utils/track')

const FIRST_OPEN_KEY = 'ttcs_first_open_done'

App({
  onLaunch() {
    try {
      dishStore.initCloud()
    } catch (err) {
      console.warn('cloud init skipped', err)
    }
    this.fetchOpenid()
  },

  onShow() {
    track.startSession()
    const firstOpenDone = wx.getStorageSync(FIRST_OPEN_KEY)
    if (!firstOpenDone) wx.setStorageSync(FIRST_OPEN_KEY, true)
    let dishCount = 0
    let fridgeCount = 0
    try {
      dishCount = dishStore.getCachedDishes().length
      fridgeCount = fridgeStore.getCachedItems().length
    } catch (e) {}
    track.track('app_open', { isFirstOpen: !firstOpenDone, dishCount, fridgeCount })
  },

  onHide() {
    const s = track.getSessionInfo()
    track.track('app_hide', {
      durationMs: Date.now() - (s.sessionStart || Date.now()),
      actedThisSession: s.actedThisSession,
    })
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

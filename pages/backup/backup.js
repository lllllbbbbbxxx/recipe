const backupStore = require('../../utils/backup-store')

Page({
  data: {
    dishCount: 0,
    fridgeItemCount: 0,
    exportedText: '',
    importText: '',
    lastBackupText: '还没有创建备份',
  },

  onLoad() {
    this.refreshSummary()
  },

  async refreshSummary() {
    const backup = await backupStore.buildBackup()
    this.setData({
      dishCount: backup.dishes.length,
      fridgeItemCount: backup.fridgeItems.length,
    })
  },

  async copyExport() {
    wx.showLoading({ title: '生成中' })
    try {
      const backup = await backupStore.buildBackup()
      const text = backupStore.stringifyBackup(backup)
      this.setData({ exportedText: text })
      wx.setClipboardData({
        data: text,
        success: () => wx.showToast({ title: '已复制', icon: 'success' }),
      })
    } catch (err) {
      wx.showToast({ title: '导出失败', icon: 'none' })
      console.error('copy backup failed', err)
    } finally {
      wx.hideLoading()
    }
  },

  async saveCloudBackup() {
    wx.showLoading({ title: '备份中' })
    try {
      const res = await backupStore.saveCloudBackup()
      this.setData({
        lastBackupText: `已云端备份：${res.backup.dishes.length} 道菜，${res.backup.fridgeItems.length} 个库存`,
      })
      wx.showToast({ title: '已备份', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: '云端备份失败', icon: 'none' })
      console.error('cloud backup failed', err)
    } finally {
      wx.hideLoading()
    }
  },

  onImportInput(e) {
    this.setData({ importText: e.detail.value })
  },

  restoreBackup() {
    const text = this.data.importText.trim()
    if (!text) {
      wx.showToast({ title: '先粘贴备份文本', icon: 'none' })
      return
    }

    wx.showModal({
      title: '恢复数据',
      content: '会把备份里的菜谱和库存写回当前账号，不会清空现有数据。',
      confirmColor: '#0f8b63',
      success: async res => {
        if (!res.confirm) return
        wx.showLoading({ title: '恢复中' })
        try {
          const backup = await backupStore.restoreFromText(text)
          wx.hideLoading()
          wx.showToast({ title: '已恢复', icon: 'success' })
          this.setData({
            importText: '',
            dishCount: backup.dishes.length,
            fridgeItemCount: backup.fridgeItems.length,
          })
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: '备份文本不正确', icon: 'none' })
          console.error('restore backup failed', err)
        }
      },
    })
  },
})

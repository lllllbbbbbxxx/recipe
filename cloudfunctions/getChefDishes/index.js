const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  const { chefId } = event
  if (!chefId) return { dishes: [] }

  const db = cloud.database()
  try {
    const res = await db.collection('dishes')
      .where({ _openid: chefId })
      .orderBy('updatedAt', 'desc')
      .limit(100)
      .get()
    return { dishes: res.data || [] }
  } catch (err) {
    console.error('getChefDishes failed', err)
    return { dishes: [], error: String(err) }
  }
}

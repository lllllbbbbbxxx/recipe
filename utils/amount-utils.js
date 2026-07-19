// 数量 = 数字 + 单位。用于库存的结构化数量与消耗扣减。
const COUNT_UNITS = ['个', '只', '根', '把', '颗', '包', '袋', '盒', '份', '条', '片', '块', '瓶', '罐', '瓣', '串', '捆', '棵', '枚', '杯', '碗', '勺']
const WEIGHT_UNITS = ['g', 'kg', '克', '千克', '斤', '两', 'ml', '毫升', '升', 'l']

// 把自由文本拆成 { qty, unit }：'200g'→{200,g}，'2个'→{2,个}，'适量'→{'','适量'}
function parseAmount(text) {
  const s = String(text || '').trim()
  if (!s || s === '常备') return { qty: '', unit: '' }
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(.*)$/)
  if (m) return { qty: m[1], unit: (m[2] || '').trim() }
  return { qty: '', unit: s }
}

function formatAmount(qty, unit) {
  const q = (qty == null ? '' : String(qty)).trim()
  const u = (unit == null ? '' : String(unit)).trim()
  if (q && u) return q + u
  return q || u || ''
}

// count=可按个数扣 / weight=可按重量扣 / vague=适量等不扣 / none=没填
function unitType(unit) {
  const u = String(unit || '').trim().toLowerCase()
  if (!u) return 'none'
  if (COUNT_UNITS.some(x => u === x.toLowerCase())) return 'count'
  if (WEIGHT_UNITS.some(x => u === x.toLowerCase())) return 'weight'
  return 'vague'
}

module.exports = { COUNT_UNITS, WEIGHT_UNITS, parseAmount, formatAmount, unitType }

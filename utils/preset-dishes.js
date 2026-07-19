// 一键导入的家常菜模板（覆盖荤/素/汤/主食/小吃，用于快速建立菜谱库）
const PRESET_DISHES = [
  // ── 荤菜 ──
  { name: '红烧肉',     mealRole: '荤菜', tags: ['下饭', '鲜香'], ingredients: [{ name: '五花肉', amount: '500g' }, { name: '生抽', amount: '3勺' }, { name: '老抽', amount: '1勺' }, { name: '冰糖', amount: '1勺' }] },
  { name: '麻婆豆腐',   mealRole: '荤菜', tags: ['辣', '下饭'],   ingredients: [{ name: '豆腐', amount: '1块' }, { name: '猪肉末', amount: '50g' }, { name: '豆瓣酱', amount: '2勺' }] },
  { name: '可乐鸡翅',   mealRole: '荤菜', tags: ['下饭', '家常'], ingredients: [{ name: '鸡翅', amount: '8个' }, { name: '可乐', amount: '1听' }, { name: '生抽', amount: '2勺' }] },
  { name: '青椒炒肉',   mealRole: '荤菜', tags: ['下饭', '家常'], ingredients: [{ name: '猪肉', amount: '200g' }, { name: '青椒', amount: '3个' }, { name: '生抽', amount: '2勺' }] },
  { name: '糖醋里脊',   mealRole: '荤菜', tags: ['下饭', '鲜香'], ingredients: [{ name: '里脊肉', amount: '300g' }, { name: '番茄酱', amount: '3勺' }, { name: '糖', amount: '2勺' }, { name: '醋', amount: '2勺' }] },
  { name: '宫保鸡丁',   mealRole: '荤菜', tags: ['辣', '下饭'],   ingredients: [{ name: '鸡胸肉', amount: '250g' }, { name: '花生', amount: '50g' }, { name: '干辣椒', amount: '适量' }, { name: '葱', amount: '2根' }] },
  { name: '红烧排骨',   mealRole: '荤菜', tags: ['下饭', '鲜香'], ingredients: [{ name: '排骨', amount: '500g' }, { name: '生抽', amount: '3勺' }, { name: '冰糖', amount: '1勺' }, { name: '姜', amount: '3片' }] },
  { name: '回锅肉',     mealRole: '荤菜', tags: ['辣', '下饭'],   ingredients: [{ name: '五花肉', amount: '300g' }, { name: '青蒜', amount: '2根' }, { name: '豆瓣酱', amount: '2勺' }] },
  { name: '红烧鱼',     mealRole: '荤菜', tags: ['下饭', '鲜香'], ingredients: [{ name: '草鱼', amount: '1条' }, { name: '姜', amount: '3片' }, { name: '葱', amount: '2根' }, { name: '生抽', amount: '2勺' }] },
  { name: '蒜蓉虾',     mealRole: '荤菜', tags: ['快手', '鲜香'], ingredients: [{ name: '虾', amount: '400g' }, { name: '大蒜', amount: '1头' }, { name: '盐', amount: '适量' }] },
  { name: '土豆炖牛肉', mealRole: '荤菜', tags: ['下饭', '家常'], ingredients: [{ name: '牛肉', amount: '400g' }, { name: '土豆', amount: '2个' }, { name: '胡萝卜', amount: '1根' }, { name: '生抽', amount: '2勺' }] },
  { name: '辣子鸡',     mealRole: '荤菜', tags: ['辣', '下饭'],   ingredients: [{ name: '鸡腿', amount: '3个' }, { name: '干辣椒', amount: '一把' }, { name: '花椒', amount: '适量' }] },

  // ── 素菜 ──
  { name: '番茄炒蛋',   mealRole: '素菜', tags: ['快手', '家常'], ingredients: [{ name: '鸡蛋', amount: '3个' }, { name: '番茄', amount: '2个' }, { name: '盐', amount: '适量' }] },
  { name: '蒜蓉菜心',   mealRole: '素菜', tags: ['快手', '清淡'], ingredients: [{ name: '菜心', amount: '300g' }, { name: '大蒜', amount: '5瓣' }, { name: '盐', amount: '适量' }] },
  { name: '青椒土豆丝', mealRole: '素菜', tags: ['快手', '家常'], ingredients: [{ name: '土豆', amount: '2个' }, { name: '青椒', amount: '1个' }, { name: '醋', amount: '1勺' }] },
  { name: '干煸豆角',   mealRole: '素菜', tags: ['下饭', '家常'], ingredients: [{ name: '豆角', amount: '300g' }, { name: '肉末', amount: '50g' }, { name: '蒜', amount: '3瓣' }] },
  { name: '清炒时蔬',   mealRole: '素菜', tags: ['快手', '清淡'], ingredients: [{ name: '生菜', amount: '1把' }, { name: '蒜', amount: '2瓣' }, { name: '盐', amount: '适量' }] },
  { name: '地三鲜',     mealRole: '素菜', tags: ['下饭', '家常'], ingredients: [{ name: '茄子', amount: '1个' }, { name: '土豆', amount: '1个' }, { name: '青椒', amount: '1个' }] },
  { name: '手撕包菜',   mealRole: '素菜', tags: ['快手', '家常'], ingredients: [{ name: '包菜', amount: '半颗' }, { name: '干辣椒', amount: '适量' }, { name: '蒜', amount: '3瓣' }] },
  { name: '西兰花炒虾仁', mealRole: '素菜', tags: ['清淡', '快手'], ingredients: [{ name: '西兰花', amount: '1颗' }, { name: '虾仁', amount: '150g' }, { name: '盐', amount: '适量' }] },
  { name: '凉拌黄瓜',   mealRole: '素菜', tags: ['快手', '清淡'], ingredients: [{ name: '黄瓜', amount: '2根' }, { name: '蒜', amount: '3瓣' }, { name: '醋', amount: '1勺' }] },
  { name: '麻婆茄子',   mealRole: '素菜', tags: ['辣', '下饭'],   ingredients: [{ name: '茄子', amount: '2个' }, { name: '蒜', amount: '3瓣' }, { name: '豆瓣酱', amount: '1勺' }] },

  // ── 汤 ──
  { name: '西红柿鸡蛋汤', mealRole: '汤', tags: ['汤', '清淡'],   ingredients: [{ name: '番茄', amount: '1个' }, { name: '鸡蛋', amount: '2个' }, { name: '盐', amount: '适量' }] },
  { name: '冬瓜排骨汤', mealRole: '汤',   tags: ['汤', '清淡'],   ingredients: [{ name: '排骨', amount: '400g' }, { name: '冬瓜', amount: '300g' }, { name: '姜', amount: '3片' }] },
  { name: '紫菜蛋花汤', mealRole: '汤',   tags: ['汤', '快手'],   ingredients: [{ name: '紫菜', amount: '一小把' }, { name: '鸡蛋', amount: '1个' }, { name: '虾皮', amount: '适量' }] },
  { name: '玉米排骨汤', mealRole: '汤',   tags: ['汤', '清淡'],   ingredients: [{ name: '排骨', amount: '400g' }, { name: '玉米', amount: '2根' }, { name: '胡萝卜', amount: '1根' }] },
  { name: '酸辣汤',     mealRole: '汤',   tags: ['汤', '辣'],     ingredients: [{ name: '豆腐', amount: '半块' }, { name: '木耳', amount: '适量' }, { name: '鸡蛋', amount: '1个' }, { name: '醋', amount: '2勺' }] },

  // ── 主食 ──
  { name: '蛋炒饭',     mealRole: '主食', tags: ['快手', '家常'], ingredients: [{ name: '米饭', amount: '1碗' }, { name: '鸡蛋', amount: '2个' }, { name: '葱', amount: '1根' }] },
  { name: '阳春面',     mealRole: '主食', tags: ['快手', '清淡'], ingredients: [{ name: '面条', amount: '1把' }, { name: '葱', amount: '1根' }, { name: '酱油', amount: '1勺' }] },
  { name: '西红柿打卤面', mealRole: '主食', tags: ['家常', '快手'], ingredients: [{ name: '面条', amount: '1把' }, { name: '番茄', amount: '2个' }, { name: '鸡蛋', amount: '2个' }] },
  { name: '扬州炒饭',   mealRole: '主食', tags: ['家常', '快手'], ingredients: [{ name: '米饭', amount: '1碗' }, { name: '火腿', amount: '50g' }, { name: '豌豆', amount: '适量' }, { name: '鸡蛋', amount: '2个' }] },
  { name: '葱油拌面',   mealRole: '主食', tags: ['快手', '家常'], ingredients: [{ name: '面条', amount: '1把' }, { name: '葱', amount: '3根' }, { name: '生抽', amount: '2勺' }] },

  // ── 小吃 ──
  { name: '煎饺',       mealRole: '小吃', tags: ['快手', '家常'], ingredients: [{ name: '饺子', amount: '10个' }, { name: '油', amount: '适量' }] },
  { name: '土豆饼',     mealRole: '小吃', tags: ['快手', '家常'], ingredients: [{ name: '土豆', amount: '2个' }, { name: '面粉', amount: '适量' }, { name: '盐', amount: '适量' }] },
]

module.exports = { PRESET_DISHES }

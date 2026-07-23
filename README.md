# 今天吃什么 🍳

一个帮你决定"今天吃什么"、管理菜谱与冰箱库存、还能把菜单分享给朋友点单的微信小程序。

> **项目状态：MVP / 朋友小范围可用性测试。** 已实现库存管理、OCR 入库、库存匹配推荐与菜单分享主链路；当前未公开发布，原生微信转发仍依赖小程序认证。测试中已识别库存录入成本高、抽卡反馈不清晰等问题，后续迭代以降低使用成本为重点。

> Copyright © 2026 lllllbbbbbxxx. All Rights Reserved.
> 本项目仅供学习与作品展示，未经作者书面许可，禁止复制、修改、分发或商用。详见 [LICENSE](LICENSE)。

---

## ✨ 功能

| 模块 | 说明 |
|---|---|
| 📖 菜谱管理 | 新增/编辑/删除菜谱，支持封面图、类型、标签、食材清单 |
| 🎲 今天抽一顿 | 从菜谱里随机抽一道，主料优先，缺调料也能抽 |
| 🥬 冰箱库存 | 按分类分区（调料默认折叠）、左滑删除、非常备可填数量、临期提醒 |
| 📷 OCR 识别 | 拍照/截图自动识别食材，过滤价格、店名等噪声，保留「菜名+重量」 |
| 🔗 菜单分享接单 | 把会做的菜分享给好友，好友选菜下单，你在「接单」页查看并标记完成 |
| ☁️ 数据备份 | 菜谱与库存优先存云端，支持导出文本手动备份/恢复 |

## 🎨 设计

- iOS 暖灰风格：`#F2F2F7` 系统灰底、纯白卡片、橄榄绿主色
- 统一四级间距规范（8/16/24/36rpx）与三级圆角
- 顶部手绘描线食材插画（SVG）

## 🛠 技术栈

- 微信小程序原生（WXML / WXSS / JS）
- 微信云开发：云数据库 + 云函数 + 云存储
- 腾讯云 OCR（通用印刷体识别，TC3-HMAC-SHA256 手写签名，无第三方 SDK）

## 📁 目录结构

```
├── app.js / app.json / app.wxss     # 全局逻辑 / 配置 / 设计 Token
├── pages/
│   ├── menu/      # 首页：菜单、搜索、分类、购物车、分享
│   ├── add/       # 新增 / 编辑菜谱
│   ├── fridge/    # 冰箱库存 + OCR
│   ├── draw/      # 今天抽一顿
│   ├── share/     # 好友选菜下单页
│   ├── orders/    # 接单页
│   └── backup/    # 数据备份 / 恢复
├── utils/
│   ├── dish-store.js            # 菜谱存储（本地缓存 + 云端）
│   ├── fridge-store.js          # 冰箱存储
│   ├── backup-store.js          # 备份
│   ├── ingredient-classifier.js # 食材分类词库
│   ├── freshness-utils.js       # 保鲜/临期计算
│   └── match-utils.js           # 菜谱与库存匹配
└── cloudfunctions/
    ├── getOpenid/       # 获取用户 openid
    ├── getChefDishes/   # 按 chefId 查菜谱（供分享页）
    └── ocrFridge/       # 调用腾讯云 OCR
```

## 🚀 本地运行

1. 用**微信开发者工具**打开项目
2. 在 `utils/dish-store.js` 顶部把 `CLOUD_ENV` 改成你自己的云开发环境 ID
3. 开通云开发，创建数据库集合：
   | 集合 | 权限 |
   |---|---|
   | `dishes` / `fridge_items` / `data_backups` | 仅创建者可读写 |
   | `orders` | 自定义规则（见下方） |
4. 部署三个云函数（右键 → 上传并部署：云端安装依赖）
5. 给 `ocrFridge` 配置环境变量 `TC_SECRET_ID` / `TC_SECRET_KEY`（腾讯云 OCR 密钥）

### orders 集合自定义安全规则

```json
{
  "read": "doc.chefOpenid == auth.openid",
  "create": "auth.openid != null",
  "update": "doc.chefOpenid == auth.openid",
  "delete": "doc.chefOpenid == auth.openid"
}
```

## 📝 备注

- 分享给好友点单功能需小程序**完成微信认证**后方可使用原生转发
- OCR 走腾讯云服务，通用印刷体识别每月有免费额度

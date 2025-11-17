# 旅行线路 API 配置指南

本文档提供了接入真实企业开放API进行票务和旅行线路数据查询的配置指南。

## 目录
- [概述](#概述)
- [API 服务架构](#api-服务架构)
- [环境配置](#环境配置)
- [API 端点说明](#api-端点说明)
- [数据模型](#数据模型)
- [错误处理](#错误处理)
- [降级策略](#降级策略)
- [集成第三方API](#集成第三方api)
- [安全注意事项](#安全注意事项)

## 概述

当前项目已经实现了与API服务集成的基本架构。主要文件包括：

- `src/services/routeService.js` - 线路服务API封装
- `src/views/RoutesView.vue` - 线路视图组件，已集成API调用

这些文件已经包含了完整的API调用逻辑和降级策略，当API不可用时会自动使用模拟数据，确保应用的基本功能正常运行。

## API 服务架构

我们采用分层架构处理API调用：

1. **服务层**：封装所有API调用逻辑
2. **视图层**：通过服务层获取数据并更新UI
3. **降级机制**：API失败时自动切换到模拟数据

## 环境配置

### 配置API基础URL

在项目根目录创建或编辑 `.env` 文件，配置API基础URL：

```
# API基础URL
VITE_APP_API_BASE_URL=https://api.your-company.com/v1

# 可选：API密钥（如果需要）
VITE_API_KEY=your_api_key_here
```

### 安装依赖

确保项目已安装必要的依赖：

```bash
npm install axios
```

## API 端点说明

以下是当前实现中使用的API端点：

| 端点 | 方法 | 描述 | 参数 |
|------|------|------|------|
| `/routes` | `GET` | 获取用户线路列表 | `{ page, limit, search, sort }` |
| `/routes/recommendations` | `POST` | 获取智能推荐线路 | `{ preferences }` |
| `/routes` | `POST` | 创建新线路 | `{ routeData }` |
| `/routes/:id` | `GET` | 获取线路详情 | `{ id }` |
| `/routes/:id` | `PUT` | 更新线路 | `{ id, routeData }` |
| `/routes/:id` | `DELETE` | 删除线路 | `{ id }` |
| `/routes/:id/favorite` | `PATCH` | 切换收藏状态 | `{ id }` |
| `/attractions/:id` | `GET` | 获取景点详情 | `{ id }` |

## 数据模型

### 线路数据结构

```javascript
{
  id: String/Number,          // 线路ID
  title: String,              // 线路名称
  startDate: String,          // 开始日期 (YYYY-MM-DD)
  endDate: String,            // 结束日期 (YYYY-MM-DD)
  coverImage: String,         // 封面图片URL
  themes: Array<String>,      // 主题标签
  companion: String,          // 同行人员类型
  preferences: {
    culture: Number,          // 文化历史偏好 (0-100)
    relaxation: Number,       // 轻松休闲偏好 (0-100)
    budget: Number            // 经济预算偏好 (0-100)
  },
  progress: Number,           // 规划进度 (0-100)
  isFavorite: Boolean,        // 是否收藏
  createdAt: String,          // 创建日期
  description: String         // 线路描述（可选）
}
```

### 推荐线路数据结构

```javascript
{
  id: String,                 // 推荐ID
  title: String,              // 标题
  description: String,        // 描述
  difficulty: String,         // 难度 (easy, medium, challenging)
  duration: Number,           // 天数
  distance: Number,           // 距离 (公里)
  attractions: Array<{
    name: String,             // 景点名称
    time: String,             // 建议游览时间
    rating: Number,           // 评分
    image: String,            // 图片URL (可选)
    description: String       // 描述 (可选)
  }>,
  tags: Array<String>,        // 标签
  coverImage: String          // 封面图片URL
}
```

## 错误处理

系统实现了全面的错误处理机制：

1. **API错误捕获**：所有API调用都有try-catch处理
2. **错误状态显示**：错误信息会存储在`error`变量中
3. **控制台日志**：详细错误信息记录到控制台
4. **降级策略**：API失败时自动切换到本地数据

## 降级策略

为确保应用在API不可用时仍能正常运行，我们实现了多层降级策略：

1. **第一层降级**：单个API调用失败时使用模拟数据
2. **第二层降级**：全部加载失败时使用默认模拟数据集
3. **操作降级**：无法通过API完成的操作在前端模拟完成

## 集成第三方API

要集成特定的企业开放API，请按照以下步骤进行：

1. **修改API基础URL**：在`.env`文件中设置正确的API地址
2. **更新认证方式**：根据第三方API要求修改`routeService.js`中的认证逻辑
3. **调整数据转换**：确保第三方API返回的数据格式与应用期望的格式匹配

### 示例：集成美团门票API

```javascript
// 修改 routeService.js 中的 API 配置
const API_BASE_URL = process.env.VUE_APP_API_BASE_URL || 'https://api.meituan.com/v1/ticket'

// 修改认证逻辑
api.interceptors.request.use(
  config => {
    // 美团API通常使用appKey和secret进行认证
    const appKey = import.meta.env.VITE_APP_MEITUAN_APP_KEY
    const secret = import.meta.env.VITE_APP_MEITUAN_SECRET
    
    // 生成签名等认证信息
    const timestamp = Date.now()
    const sign = generateSign(config, appKey, secret, timestamp)
    
    config.headers['appkey'] = appKey
    config.headers['timestamp'] = timestamp
    config.headers['sign'] = sign
    
    return config
  },
  error => {
    return Promise.reject(error)
  }
)

// 添加数据转换逻辑，确保与应用期望的格式匹配
function transformMeituanData(rawData) {
  // 转换美团API返回的数据为应用内部格式
  return {
    id: rawData.productId,
    title: rawData.productName,
    // 其他字段转换...
  }
}
```

## 安全注意事项

1. **不要硬编码API密钥**：所有敏感信息应通过环境变量配置
2. **使用HTTPS**：确保API通信使用加密连接
3. **适当的错误处理**：不要在前端暴露敏感的错误信息
4. **请求限制**：实现合理的请求频率限制，避免API滥用
5. **数据验证**：在发送数据到API前进行适当的验证

## 测试建议

1. **使用API测试工具**（如Postman）验证API端点可用性
2. **模拟网络错误**测试降级策略
3. **检查浏览器控制台**查看API调用日志和错误信息

## 常见问题

### Q: API调用失败怎么办？
A: 系统会自动使用模拟数据作为降级方案，确保基本功能可用。检查控制台获取详细错误信息。

### Q: 如何配置不同环境的API？
A: 使用`.env`、`.env.development`、`.env.production`文件分别配置不同环境的API地址。

### Q: API返回的数据格式与应用期望不符怎么办？
A: 在`routeService.js`中添加数据转换函数，将API返回的数据格式转换为应用内部使用的格式。

### Q: 如何处理认证和授权？
A: 在请求拦截器中添加认证信息，如token、API密钥等。根据API提供商的要求实现。

---

通过以上配置和实现，您的应用已经可以与真实的企业开放API集成，获取票务和旅行线路数据。如需进一步自定义或集成特定API，请参考相应API提供商的文档。
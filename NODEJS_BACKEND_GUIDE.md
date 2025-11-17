# Node.js后端服务使用指南

本指南将帮助您设置和运行Node.js后端服务，用于转发AI模型请求。

## 功能说明

- 安全转发AI模型请求，避免前端暴露API密钥
- 集中管理API配置，便于更新和维护
- 支持多种AI模型的切换
- 提供健康检查和模型列表查询功能

## 前提条件

- 已安装Node.js 14.x或更高版本
- 已安装npm 6.x或更高版本

## 安装步骤

1. 在项目根目录下，安装后端依赖：

```bash
npm install --prefix . express node-fetch cors
# 可选：安装nodemon用于开发环境
npm install --prefix . --save-dev nodemon
```

## 配置说明

后端服务的配置在`server.js`文件中：

```javascript
const config = {
  aiModelApiEndpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  aiModelApiKey: 'sk-bedaf461740545a089676d781769daeb',
  // 可以配置不同的模型
  models: {
    'open-source-llm': 'qwen-plus',
    'qwen-turbo': 'qwen-turbo',
    'llama3-8b-instruct': 'llama3-8b-instruct'
  }
};
```

**注意**：在生产环境中，建议将敏感信息（如API密钥）存放在环境变量中，而不是直接硬编码在代码里。

## 运行后端服务

### 生产环境

```bash
node server.js
```

### 开发环境（使用nodemon自动重启）

```bash
npx nodemon server.js
```

服务启动后，将在端口3001上监听请求。

## API端点

后端服务提供以下API端点：

1. **AI聊天接口**
   - URL: `http://localhost:3001/api/ai/chat`
   - 方法: POST
   - 请求体: 
     ```json
     {
       "message": "用户消息内容",
       "model": "open-source-llm",
       "systemPrompt": "系统提示词"
     }
     ```
   - 响应: AI模型的回复内容

2. **模型列表查询**
   - URL: `http://localhost:3001/api/ai/models`
   - 方法: GET
   - 响应: 可用的模型列表

3. **健康检查**
   - URL: `http://localhost:3001/api/health`
   - 方法: GET
   - 响应: 服务健康状态

## 前端配置

前端已经修改为调用本地后端服务，无需额外配置。确保在使用AI客服功能时，后端服务已经启动。

## 常见问题排查

1. **前端显示"后端服务未启动"**
   - 确认Node.js后端服务是否已成功启动
   - 检查服务是否在端口3001上运行
   - 尝试访问健康检查接口: `http://localhost:3001/api/health`

2. **AI服务认证失败**
   - 检查`server.js`中的API密钥是否正确
   - 确认API密钥是否过期

3. **请求超时**
   - 检查网络连接是否稳定
   - 可以考虑调整`server.js`中的超时设置

## 部署建议

在生产环境中，建议：

1. 使用环境变量存储敏感信息
2. 配置HTTPS安全连接
3. 设置请求频率限制防止滥用
4. 部署到稳定的服务器或云服务平台

## 注意事项

- 本后端服务仅作为API转发使用，不包含复杂的业务逻辑
- 请确保在使用前已经阅读并理解相关API的使用条款
- 定期更新依赖包以确保安全性
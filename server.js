import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import { Readable } from 'stream';

const app = express();
const PORT = 3001;

// 中间件配置
app.use(cors());
app.use(express.json());

// 配置文件 - 建议将敏感信息存放在环境变量中
const config = {
  // 修正阿里云DashScope兼容模式的完整API端点
  aiModelApiEndpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  aiModelApiKey: 'sk-bedaf461740545a089676d781769daeb',
  // 可以配置不同的模型
  models: {
    'open-source-llm': 'qwen3-max',
    'qwen-turbo': 'qwen-turbo',
    'llama3-8b-instruct': 'llama3-8b-instruct',
    'qwen3-max': 'qwen3-max'
  }
};

/**
 * 转发AI模型请求的API端点 - 支持流式输出和结构化输出
 */
app.post('/api/ai/chat', async (req, res) => {
  try {
    const {
      message, // 用户消息
      model = 'open-source-llm', // 使用的模型
      systemPrompt = '你是一个专业的旅行客服AI助手，需要帮助用户解决旅行相关的问题。其他的日常问题也可以回答', // 系统提示词
      stream = true, // 默认启用流式输出
      structured = true // 默认启用结构化输出
    } = req.body;

    if (!message) {
      return res.status(400).json({ error: '消息内容不能为空' });
    }

    // 获取实际的模型名称
    const actualModel = config.models[model] || config.models['open-source-llm'];

    // 构建请求体 - 支持流式输出和结构化输出
    const requestBody = {
      model: actualModel,
      messages: [
        {
          role: 'system',
          content: typeof systemPrompt === 'string' ? systemPrompt : JSON.stringify(systemPrompt)
        },
        {
          role: 'user',
          content: typeof message === 'string' ? message : JSON.stringify(message)
        }
      ],
      max_tokens: 500,
      temperature: 0.7,
      stream: stream
    };

    console.log('转发AI请求:', {
      endpoint: config.aiModelApiEndpoint,
      model: actualModel,
      messageLength: message.length
    });

    // 发送请求到AI模型API
    const response = await fetch(config.aiModelApiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.aiModelApiKey}`
      },
      body: JSON.stringify(requestBody),
      timeout: 30000
    });

    // 检查响应状态
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`API请求失败: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
    }

    // 获取响应数据
    const data = await response.json();
    console.log('AI模型响应成功');

    // 提取回复内容
    let responseText = '';
    if (data.choices && data.choices[0]) {
      responseText = data.choices[0].message?.content || data.choices[0].text || '';
    }

    // 生成结构化信息
    let structuredInfo = null;
    if (structured && responseText) {
      structuredInfo = analyzeAndStructureResponse(responseText);
    }

    // 无论是否请求了流式，都按照前端期望的格式返回结构化信息
    res.json({
      ...data,
      structuredInfo: structuredInfo
    });
  } catch (error) {
    console.error('转发AI请求时出错:', error.message);
    
    // 根据错误类型返回友好提示
    let errorMessage = '抱歉，AI服务暂时不可用，请稍后再试。';
    let statusCode = 500;
    
    if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
      errorMessage = '抱歉，AI服务响应超时，请稍后再试。';
    } else if (error.message.includes('401')) {
      errorMessage = 'AI服务认证失败，请检查API密钥。';
      statusCode = 401;
    } else if (error.message.includes('429')) {
      errorMessage = '当前请求过多，请稍后再试。';
      statusCode = 429;
    } else if (error.message.includes('404')) {
      errorMessage = '请求的API端点不存在，请检查URL是否正确。';
      statusCode = 404;
    }

    res.status(statusCode).json({
      error: errorMessage
    });
  }
});

// 获取可用模型列表
app.get('/api/ai/models', (req, res) => {
  res.json({
    models: Object.keys(config.models)
  });
});

/**
 * 分析响应文本并生成结构化信息
 */
function analyzeAndStructureResponse(responseText) {
  const structuredInfo = {
    categories: [],
    hasContactInfo: false,
    keyPoints: []
  };

  // 分析内容类别
  if (responseText.includes('订单') || responseText.includes('booking') || responseText.includes('预订')) {
    structuredInfo.categories.push('order');
  }
  if (responseText.includes('退款') || responseText.includes('refund') || responseText.includes('退订')) {
    structuredInfo.categories.push('refund');
  }
  if (responseText.includes('酒店') || responseText.includes('hotel') || responseText.includes('住宿')) {
    structuredInfo.categories.push('hotel');
  }
  if (responseText.includes('机票') || responseText.includes('flight') || responseText.includes('航班')) {
    structuredInfo.categories.push('flight');
  }
  if (responseText.includes('服务') || responseText.includes('客服') || responseText.includes('帮助')) {
    structuredInfo.categories.push('service');
  }
  if (responseText.includes('信息') || responseText.includes('info') || responseText.includes('详情')) {
    structuredInfo.categories.push('info');
  }

  // 分析关键点
  if (responseText.includes('步骤') || responseText.includes('流程') || responseText.includes('steps')) {
    structuredInfo.keyPoints.push('steps_info');
  }
  
  // 检测是否包含联系信息建议
  if (responseText.includes('客服') || responseText.includes('电话') || responseText.includes('联系')) {
    structuredInfo.hasContactInfo = true;
  }
  
  return structuredInfo;
}

// 健康检查端点
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`Node.js后端服务器已启动，监听端口 ${PORT}`);
  console.log(`- 健康检查: http://localhost:${PORT}/api/health`);
  console.log(`- 模型列表: http://localhost:${PORT}/api/ai/models`);
  console.log(`- AI聊天接口: http://localhost:${PORT}/api/ai/chat (支持流式输出和结构化输出)`);
});
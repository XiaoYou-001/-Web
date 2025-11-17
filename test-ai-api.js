import fetch from 'node-fetch';

async function testAIChat() {
  try {
    const response = await fetch('http://localhost:3001/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: '你好',
        model: 'open-source-llm',
        systemPrompt: '你是一个专业的旅行客服AI助手'
      })
    });

    const data = await response.json();
    console.log('API响应状态码:', response.status);
    console.log('API响应数据:', data);
  } catch (error) {
    console.error('测试AI接口时出错:', error);
  }
}

testAIChat();
import fetch from 'node-fetch';

async function testApi() {
  try {
    const response = await fetch('http://localhost:3001/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: '你好',
        model: 'open-source-llm',
        systemPrompt: '你是一个专业的旅行客服AI助手',
        stream: true,
        structured: true
      })
    });

    console.log('响应状态码:', response.status);
    console.log('响应头部:', response.headers.raw());

    // 直接获取JSON数据而不是尝试流式处理
    const data = await response.json();
    console.log('完整的响应数据:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('测试出错:', error);
  }
}

testApi();
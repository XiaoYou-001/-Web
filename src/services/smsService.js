// 短信验证码服务
// 支持多个短信服务商API

const SMS_PROVIDERS = {
  ALIYUN: 'aliyun',
  TENCENT: 'tencent',
  YUNPIAN: 'yunpian'
};

// 配置短信服务商（实际使用时需要替换为真实的API密钥）
const SMS_CONFIG = {
  provider: SMS_PROVIDERS.ALIYUN, // 默认使用阿里云
  apiKey: import.meta.env.VITE_SMS_API_KEY || 'your-api-key-here',
  apiSecret: import.meta.env.VITE_SMS_API_SECRET || 'your-api-secret-here',
  signName: import.meta.env.VITE_SMS_SIGN_NAME || '智游旅行',
  templateCode: import.meta.env.VITE_SMS_TEMPLATE_CODE || 'SMS_123456789'
};

// 验证码存储（生产环境应该使用Redis等持久化存储）
const codeStorage = new Map();

// 生成随机验证码
function generateVerificationCode(length = 6) {
  const chars = '0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// 验证手机号格式
function validatePhoneNumber(phone) {
  const phoneRegex = /^1[3-9]\d{9}$/;
  return phoneRegex.test(phone);
}

// 发送验证码（模拟实现）
async function sendVerificationCode(phone) {
  // 验证手机号格式
  if (!validatePhoneNumber(phone)) {
    throw new Error('手机号格式不正确');
  }

  // 生成验证码
  const code = generateVerificationCode();
  const timestamp = Date.now();
  const expiresAt = timestamp + 10 * 60 * 1000; // 10分钟有效期

  // 存储验证码信息
  codeStorage.set(phone, {
    code,
    timestamp,
    expiresAt,
    attempts: 0
  });

  // 模拟发送到第三方短信服务
  try {
    // 这里模拟调用真实的短信API
    console.log(`[SMS Service] 发送验证码到 ${phone}: ${code}`);
    
    // 实际集成时，这里应该调用真实的短信API
    // 以下是各服务商的示例代码：
    
    /*
    // 阿里云短信示例
    if (SMS_CONFIG.provider === SMS_PROVIDERS.ALIYUN) {
      const result = await sendAliyunSMS(phone, code);
      return result;
    }
    
    // 腾讯云短信示例
    if (SMS_CONFIG.provider === SMS_PROVIDERS.TENCENT) {
      const result = await sendTencentSMS(phone, code);
      return result;
    }
    
    // 云片短信示例
    if (SMS_CONFIG.provider === SMS_PROVIDERS.YUNPIAN) {
      const result = await sendYunpianSMS(phone, code);
      return result;
    }
    */
    
    // 模拟成功发送
    return {
      success: true,
      message: '验证码发送成功',
      code: code, // 实际生产环境不应该返回验证码
      provider: SMS_CONFIG.provider
    };
    
  } catch (error) {
    console.error('发送验证码失败:', error);
    throw new Error('验证码发送失败，请稍后重试');
  }
}

// 验证验证码
function verifyCode(phone, inputCode) {
  const storedData = codeStorage.get(phone);
  
  if (!storedData) {
    return { success: false, message: '验证码已过期或未发送' };
  }
  
  // 检查是否过期
  if (Date.now() > storedData.expiresAt) {
    codeStorage.delete(phone);
    return { success: false, message: '验证码已过期' };
  }
  
  // 检查尝试次数
  if (storedData.attempts >= 5) {
    codeStorage.delete(phone);
    return { success: false, message: '验证失败次数过多，请重新获取验证码' };
  }
  
  // 验证验证码
  if (storedData.code === inputCode) {
    codeStorage.delete(phone); // 验证成功后删除
    return { success: true, message: '验证成功' };
  } else {
    storedData.attempts += 1;
    codeStorage.set(phone, storedData);
    return { 
      success: false, 
      message: `验证码不正确，还剩${5 - storedData.attempts}次尝试机会` 
    };
  }
}

// 获取剩余时间
function getRemainingTime(phone) {
  const storedData = codeStorage.get(phone);
  if (!storedData) return 0;
  
  const remaining = storedData.expiresAt - Date.now();
  return Math.max(0, Math.floor(remaining / 1000));
}

// 清除过期的验证码（定时任务）
function cleanupExpiredCodes() {
  const now = Date.now();
  for (const [phone, data] of codeStorage.entries()) {
    if (now > data.expiresAt) {
      codeStorage.delete(phone);
    }
  }
}

// 每5分钟清理一次过期验证码
setInterval(cleanupExpiredCodes, 5 * 60 * 1000);

// 各短信服务商的具体实现（需要根据实际API文档实现）
async function sendAliyunSMS(phone, code) {
  // 阿里云短信API实现
  // 需要安装 @alicloud/dysmsapi20170525
  /*
  const Dysmsapi = require('@alicloud/dysmsapi20170525');
  const { Config, DefaultRuntimeOptions } = require('@alicloud/openapi');
  
  const config = new Config({
    accessKeyId: SMS_CONFIG.apiKey,
    accessKeySecret: SMS_CONFIG.apiSecret,
  });
  
  const client = new Dysmsapi(config);
  const result = await client.sendSms({
    phoneNumbers: phone,
    signName: SMS_CONFIG.signName,
    templateCode: SMS_CONFIG.templateCode,
    templateParam: JSON.stringify({ code: code })
  });
  
  return result;
  */
  
  // 模拟实现
  return { success: true };
}

async function sendTencentSMS(phone, code) {
  // 腾讯云短信API实现
  // 需要安装 tencentcloud-sdk-nodejs
  /*
  const tencentcloud = require("tencentcloud-sdk-nodejs");
  const SmsClient = tencentcloud.sms.v20210111.Client;
  
  const client = new SmsClient({
    credential: {
      secretId: SMS_CONFIG.apiKey,
      secretKey: SMS_CONFIG.apiSecret,
    },
    region: "ap-guangzhou",
  });
  
  const result = await client.SendSms({
    PhoneNumberSet: [phone],
    TemplateID: SMS_CONFIG.templateCode,
    Sign: SMS_CONFIG.signName,
    TemplateParamSet: [code]
  });
  
  return result;
  */
  
  // 模拟实现
  return { success: true };
}

async function sendYunpianSMS(phone, code) {
  // 云片短信API实现
  /*
  const response = await fetch('https://sms.yunpian.com/v2/sms/single_send.json', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      apikey: SMS_CONFIG.apiKey,
      mobile: phone,
      text: `【${SMS_CONFIG.signName}】您的验证码是${code}。如非本人操作，请忽略本短信`
    })
  });
  
  return await response.json();
  */
  
  // 模拟实现
  return { success: true };
}

export {
  sendVerificationCode,
  verifyCode,
  validatePhoneNumber,
  getRemainingTime,
  SMS_PROVIDERS,
  SMS_CONFIG
};
export const validatePhoneNumber = phone => typeof phone === 'string' && /^1[3-9]\d{9}$/.test(phone)
export const validatePassword = password => typeof password === 'string' && password.length >= 6 && password.length <= 20

// 页面校验与账号服务复用基础规则；只修剪手机号，不更改密码内容。
export function validateAccountFields(values, { registration = false, requireTerms = false } = {}) {
  const errors = {}
  const phone = typeof values.phone === 'string' ? values.phone.trim() : ''
  if (!phone) errors.phone = '请输入手机号'
  else if (!validatePhoneNumber(phone)) errors.phone = '请输入正确的11位手机号'
  if (!values.password) errors.password = registration ? '请设置密码' : '请输入密码'
  else if (!validatePassword(values.password)) errors.password = '密码长度应为6-20位'
  if (registration && !values.confirmPassword) errors.confirmPassword = '请再次输入密码'
  else if (registration && values.password !== values.confirmPassword) errors.confirmPassword = '两次输入的密码不一致'
  if (requireTerms && !values.agreeToTerms) errors.agreeToTerms = '请阅读并同意用户协议和隐私政策'
  return errors
}

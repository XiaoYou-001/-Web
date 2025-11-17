// 用户认证服务

// 用户数据存储（在实际生产环境中应该使用后端数据库）
let users = JSON.parse(localStorage.getItem('users')) || [];

// 保存用户数据到本地存储
function saveUsers() {
  localStorage.setItem('users', JSON.stringify(users));
}

// 注册新用户（支持手机号注册）
function registerUser(phone, password) {
  // 检查用户是否已存在
  const existingUser = users.find(user => user.phone === phone);
  if (existingUser) {
    return { success: false, message: '该手机号已注册' };
  }
  
  // 创建新用户
  const newUser = {
    id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    phone,
    password, // 注意：实际生产环境中应该使用加密存储密码
    createdAt: new Date().toISOString(),
    isWechatUser: false
  };
  
  users.push(newUser);
  saveUsers();
  
  return { success: true, message: '注册成功', user: newUser };
}

// 手机号密码登录
function loginUser(phone, password) {
  // 查找用户
  const user = users.find(user => user.phone === phone);
  
  if (!user) {
    return { success: false, message: '未找到该用户' };
  }
  
  // 验证密码
  if (user.password !== password) {
    return { success: false, message: '密码错误' };
  }
  
  // 登录成功，记录认证状态
  localStorage.setItem('isAuthenticated', 'true');
  localStorage.setItem('currentUser', JSON.stringify({
    id: user.id,
    phone: user.phone,
    nickname: user.nickname || `用户${phone.substring(7)}`,
    avatar: user.avatar || '',
    loggedInAt: new Date().toISOString(),
    loginType: 'phone'
  }));
  
  return { 
    success: true, 
    message: '登录成功', 
    user: {
      id: user.id,
      phone: user.phone,
      nickname: user.nickname || `用户${phone.substring(7)}`,
      avatar: user.avatar || ''
    } 
  };
}

// 微信登录
function loginWithWechat(wxUserInfo) {
  // 查找是否已存在该微信用户
  let user = users.find(user => 
    user.openId === wxUserInfo.openId || 
    (user.unionId && wxUserInfo.unionId && user.unionId === wxUserInfo.unionId)
  );
  
  // 如果不存在，则创建新用户
  if (!user) {
    user = {
      id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      openId: wxUserInfo.openId,
      unionId: wxUserInfo.unionId || '',
      nickname: wxUserInfo.nickname,
      avatar: wxUserInfo.avatar,
      gender: wxUserInfo.gender,
      isWechatUser: true,
      createdAt: new Date().toISOString(),
      phone: '' // 微信登录的用户初始可能没有绑定手机号
    };
    
    users.push(user);
    saveUsers();
  } else {
    // 更新用户信息
    user.nickname = wxUserInfo.nickname;
    user.avatar = wxUserInfo.avatar;
    saveUsers();
  }
  
  // 登录成功，记录认证状态
  localStorage.setItem('isAuthenticated', 'true');
  localStorage.setItem('currentUser', JSON.stringify({
    id: user.id,
    phone: user.phone,
    nickname: user.nickname,
    avatar: user.avatar,
    loggedInAt: new Date().toISOString(),
    loginType: 'wechat'
  }));
  
  return {
    success: true,
    message: '微信登录成功',
    user: {
      id: user.id,
      phone: user.phone,
      nickname: user.nickname,
      avatar: user.avatar
    }
  };
}

// 绑定手机号到微信用户
function bindPhoneToWechatUser(openId, phone, password = '') {
  const user = users.find(user => user.openId === openId);
  
  if (!user) {
    return { success: false, message: '未找到该微信用户' };
  }
  
  // 检查手机号是否已被其他用户绑定
  const existingUserWithPhone = users.find(u => u.phone === phone && u.id !== user.id);
  if (existingUserWithPhone) {
    return { success: false, message: '该手机号已被其他账号绑定' };
  }
  
  // 绑定手机号
  user.phone = phone;
  if (password) {
    user.password = password;
  }
  saveUsers();
  
  return { success: true, message: '手机号绑定成功' };
}

// 检查是否已登录
function isLoggedIn() {
  return localStorage.getItem('isAuthenticated') === 'true';
}

// 获取当前登录用户
function getCurrentUser() {
  const userStr = localStorage.getItem('currentUser');
  return userStr ? JSON.parse(userStr) : null;
}

// 用户登出
function logout() {
  localStorage.removeItem('isAuthenticated');
  localStorage.removeItem('currentUser');
  localStorage.removeItem('authToken');
  localStorage.removeItem('userInfo');
}

// 重置密码
function resetPassword(phone, newPassword) {
  const userIndex = users.findIndex(user => user.phone === phone);
  
  if (userIndex === -1) {
    return { success: false, message: '未找到该用户' };
  }
  
  users[userIndex].password = newPassword;
  saveUsers();
  
  return { success: true, message: '密码重置成功' };
}

export {
  registerUser,
  loginUser,
  loginWithWechat,
  bindPhoneToWechatUser,
  isLoggedIn,
  getCurrentUser,
  logout,
  resetPassword
};
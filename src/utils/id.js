// 本地演示 ID；在不提供 randomUUID 的 HTTP 开发环境中仍可注册。
export function createId() {
  return globalThis.crypto?.randomUUID?.() || `user_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

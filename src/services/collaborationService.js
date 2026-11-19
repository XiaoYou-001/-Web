import { ApiError, apiErrorMessage } from './apiClient.js'
import { apiConfig } from '../config/api.js'

// 同行协商的服务端会话按本机账号隔离保存；它只保存随机令牌，不保存服务端密码。
export const COLLAB_SESSION_PREFIX = 'collab_session:v1:'
export const COLLAB_REQUEST_TIMEOUT_MS = 15000

const serverCodes = new Set([
  'ACCOUNT_EXISTS', 'ACCOUNT_NOT_FOUND', 'INVALID_CREDENTIALS', 'AUTH_REQUIRED',
  'INVITE_INVALID', 'TRIP_EXISTS', 'VERSION_CONFLICT', 'TASK_ALREADY_CLAIMED',
  'TASK_COMPLETED', 'MEMBER_LIMIT', 'INVITE_LIMIT', 'TASK_LIMIT', 'OWNER_CANNOT_LEAVE',
  'OWNER_PROTECTED', 'CHAT_NOT_CONFIGURED', 'STORAGE_UNAVAILABLE'
])

export function collabSessionKey(ownerId) {
  return `${COLLAB_SESSION_PREFIX}${encodeURIComponent(String(ownerId ?? ''))}`
}

// 同行人的本机旅行 id 与组织者创建的协作空间 id 可能不同；加入后记住对应关系，
// 刷新或轮询仍然能找到同一个协商空间，而不是把它当成未创建。
export const COLLAB_TRIP_PREFIX = 'collab_trip:v1:'

export function collabTripKey(ownerId, localTripId) {
  return `${COLLAB_TRIP_PREFIX}${encodeURIComponent(String(ownerId ?? ''))}:${encodeURIComponent(String(localTripId ?? ''))}`
}

function storageOrNull(storage) {
  try { return storage || globalThis.localStorage || null } catch { return null }
}

export function readCollabSession(ownerId, { storage, now = Date.now } = {}) {
  const at = typeof now === 'function' ? Number(now()) : Number(now)
  const store = storageOrNull(storage)
  if (!store) return null
  let raw
  try { raw = store.getItem(collabSessionKey(ownerId)) } catch { return null }
  if (!raw) return null
  let session
  try { session = JSON.parse(raw) } catch { return null }
  if (!session || typeof session.token !== 'string' || !session.token || !Number.isFinite(session.expiresAt) || session.expiresAt <= at) {
    try { store.removeItem(collabSessionKey(ownerId)) } catch { /* 存储不可用时忽略 */ }
    return null
  }
  return session
}

function writeCollabSession(ownerId, session, { storage } = {}) {
  const store = storageOrNull(storage)
  if (!store) throw new ApiError('SERVICE_UNAVAILABLE', { message: '浏览器存储不可用，无法保存协作登录状态' })
  try {
    store.setItem(collabSessionKey(ownerId), JSON.stringify(session))
  } catch {
    throw new ApiError('SERVICE_UNAVAILABLE', { message: '协作登录状态保存失败，请释放浏览器存储空间后重试' })
  }
}

function clearCollabSession(ownerId, { storage } = {}) {
  const store = storageOrNull(storage)
  try { store?.removeItem(collabSessionKey(ownerId)) } catch { /* 忽略 */ }
}

export function readTripBinding(ownerId, localTripId, { storage } = {}) {
  const store = storageOrNull(storage)
  if (!store) return ''
  try {
    const value = store.getItem(collabTripKey(ownerId, localTripId))
    return typeof value === 'string' && value ? value : ''
  } catch {
    return ''
  }
}

export function writeTripBinding(ownerId, localTripId, remoteTripId, { storage } = {}) {
  const store = storageOrNull(storage)
  if (!store) return false
  try {
    store.setItem(collabTripKey(ownerId, localTripId), String(remoteTripId))
    return true
  } catch {
    return false
  }
}

export function clearTripBinding(ownerId, localTripId, { storage } = {}) {
  const store = storageOrNull(storage)
  try { store?.removeItem(collabTripKey(ownerId, localTripId)) } catch { /* 忽略 */ }
}

function statusCode(status) {
  if (status === 401) return 'AUTH_REQUIRED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'NOT_FOUND'
  if (status === 409) return 'CONFLICT'
  if (status === 429) return 'RATE_LIMIT'
  if (status === 400 || status === 422) return 'VALIDATION'
  if (status >= 500) return 'SERVICE_UNAVAILABLE'
  return 'HTTP_ERROR'
}

export function createCollaborationService({
  baseUrl = apiConfig.baseUrl,
  fetchImpl = (...args) => globalThis.fetch(...args),
  storage,
  timeoutMs = COLLAB_REQUEST_TIMEOUT_MS,
  timers = globalThis
} = {}) {
  const root = String(baseUrl || '/api').replace(/\/+$/, '')
  const authUrl = `${root}/auth`
  const collabUrl = `${root}/collaboration`

  async function request(path, { method = 'GET', body, token, signal } = {}) {
    if (signal?.aborted) throw new ApiError('CANCELLED')
    const controller = new AbortController()
    let timedOut = false
    const timer = timers.setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
    const cancel = () => controller.abort()
    signal?.addEventListener('abort', cancel, { once: true })
    try {
      const response = await fetchImpl(path, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(token ? { 'X-Travel-Authorization': `Bearer ${token}` } : {})
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        credentials: 'same-origin',
        signal: controller.signal
      })
      if (timedOut) throw new ApiError('TIMEOUT')
      const raw = await response.text()
      let data = null
      if (raw) {
        try { data = JSON.parse(raw) } catch { data = null }
      }
      if (!response.ok) {
        const code = typeof data?.code === 'string' && (serverCodes.has(data.code) || data.code === 'FORBIDDEN' || data.code === 'NOT_FOUND' || data.code === 'VALIDATION' || data.code === 'RATE_LIMIT' || data.code === 'SERVICE_UNAVAILABLE')
          ? data.code
          : statusCode(response.status)
        throw new ApiError(code, {
          status: response.status,
          message: typeof data?.error === 'string' && data.error ? data.error : undefined
        })
      }
      if (response.status === 204) return null
      if (data === null) throw new ApiError('INVALID_RESPONSE', { status: response.status })
      return data
    } catch (error) {
      if (error instanceof ApiError) throw error
      if (timedOut) throw new ApiError('TIMEOUT')
      if (signal?.aborted) throw new ApiError('CANCELLED')
      throw new ApiError('NETWORK', { message: '无法连接协作服务，请检查网络后重试' })
    } finally {
      timers.clearTimeout(timer)
      signal?.removeEventListener('abort', cancel)
    }
  }

  function session(ownerId) {
    return readCollabSession(ownerId, { storage })
  }

  function save(ownerId, data) {
    const next = {
      token: data.token,
      expiresAt: Number(data.expiresAt),
      user: data.user
    }
    writeCollabSession(ownerId, next, { storage })
    return next
  }

  async function bind(ownerId, { phone, password, nickname } = {}) {
    // 先尝试注册：服务端登录不再区分“手机号未注册”和“密码错误”，避免被用来探测账号是否存在。
    // 手机号已存在时注册返回 ACCOUNT_EXISTS，再走登录校验密码。
    let data
    try {
      data = await request(`${authUrl}/register`, { method: 'POST', body: { phone, password, nickname } })
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== 'ACCOUNT_EXISTS') throw error
      data = await request(`${authUrl}/login`, { method: 'POST', body: { phone, password } })
    }
    const saved = save(ownerId, data)
    const displayName = typeof nickname === 'string' ? nickname.trim() : ''
    if (displayName && displayName !== saved.user?.nickname) {
      try {
        const updated = await request(`${authUrl}/me`, { method: 'PATCH', token: saved.token, body: { nickname: displayName } })
        if (updated?.user) {
          saved.user = updated.user
          writeCollabSession(ownerId, saved, { storage })
        }
      } catch {
        // 昵称同步失败不影响已经建立的服务端会话。
      }
    }
    return saved
  }

  async function restore(ownerId) {
    const saved = session(ownerId)
    if (!saved) return null
    try {
      const data = await request(`${authUrl}/me`, { token: saved.token })
      const next = { ...saved, user: data.user }
      writeCollabSession(ownerId, next, { storage })
      return next
    } catch (error) {
      if (error instanceof ApiError && (error.code === 'AUTH_REQUIRED' || error.status === 401)) {
        clearCollabSession(ownerId, { storage })
        return null
      }
      throw error
    }
  }

  async function logout(ownerId) {
    const saved = session(ownerId)
    clearCollabSession(ownerId, { storage })
    if (!saved) return
    try { await request(`${authUrl}/logout`, { method: 'POST', token: saved.token }) } catch { /* 本地已清除 */ }
  }

  async function withSession(ownerId, action) {
    const saved = session(ownerId)
    if (!saved) throw new ApiError('AUTH_REQUIRED', { message: '请先连接协作服务' })
    try {
      return await action(saved.token)
    } catch (error) {
      if (error instanceof ApiError && (error.code === 'AUTH_REQUIRED' || error.status === 401)) {
        clearCollabSession(ownerId, { storage })
      }
      throw error
    }
  }

  function tripPath(tripId, suffix = '') {
    return `${collabUrl}/trips/${encodeURIComponent(String(tripId))}${suffix}`
  }

  // 已加入他人协作空间时，所有 trips/:id 请求都要换成组织者的空间 id。
  function remoteTripId(ownerId, tripId) {
    const bound = readTripBinding(ownerId, tripId, { storage })
    return bound || tripId
  }

  async function status() {
    return request(`${collabUrl}/status`)
  }

  async function createTrip(ownerId, { id, title, candidates } = {}) {
    return withSession(ownerId, async token => {
      const data = await request(`${collabUrl}/trips`, { method: 'POST', token, body: { id, title, candidates } })
      if (typeof data.trip?.id === 'string' && data.trip.id) writeTripBinding(ownerId, id, data.trip.id, { storage })
      return data.trip
    })
  }

  async function getTrip(ownerId, tripId) {
    return withSession(ownerId, async token => {
      try {
        const data = await request(tripPath(remoteTripId(ownerId, tripId)), { token })
        return data.trip
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null
        throw error
      }
    })
  }

  async function updateTrip(ownerId, tripId, patch) {
    return withSession(ownerId, async token => {
      const data = await request(tripPath(remoteTripId(ownerId, tripId)), { method: 'PUT', token, body: patch })
      return data.trip
    })
  }

  async function createInvite(ownerId, tripId, invite) {
    return withSession(ownerId, async token => {
      const data = await request(tripPath(remoteTripId(ownerId, tripId), '/invites'), { method: 'POST', token, body: invite })
      return { code: data.code, invite: data.invite, trip: data.trip }
    })
  }

  async function cancelInvite(ownerId, tripId, inviteId) {
    return withSession(ownerId, async token => {
      const data = await request(tripPath(remoteTripId(ownerId, tripId), `/invites/${encodeURIComponent(inviteId)}`), { method: 'DELETE', token })
      return data.trip
    })
  }

  async function acceptInvite(ownerId, code, { localTripId } = {}) {
    return withSession(ownerId, async token => {
      const data = await request(`${collabUrl}/invites/accept`, { method: 'POST', token, body: { code } })
      const incoming = typeof data.trip?.id === 'string' ? data.trip.id : ''
      if (incoming) {
        const local = typeof localTripId === 'string' && localTripId ? localTripId : incoming
        writeTripBinding(ownerId, local, incoming, { storage })
      }
      return data.trip
    })
  }

  async function patchMember(ownerId, tripId, accountId, patch) {
    return withSession(ownerId, async token => {
      const data = await request(tripPath(remoteTripId(ownerId, tripId), `/members/${encodeURIComponent(accountId)}`), { method: 'PATCH', token, body: patch })
      return data.trip
    })
  }

  async function removeMember(ownerId, tripId, accountId) {
    return withSession(ownerId, async token => {
      const data = await request(tripPath(remoteTripId(ownerId, tripId), `/members/${encodeURIComponent(accountId)}`), { method: 'DELETE', token })
      return data.trip
    })
  }

  async function leaveTrip(ownerId, tripId) {
    return withSession(ownerId, async token => {
      await request(tripPath(remoteTripId(ownerId, tripId), '/leave'), { method: 'POST', token })
      // 退出后不再保留旧映射，否则下次打开会把新空间或空结果当成已加入。
      clearTripBinding(ownerId, tripId, { storage })
    })
  }

  async function vote(ownerId, tripId, candidateId, value) {
    return withSession(ownerId, async token => {
      const data = await request(tripPath(remoteTripId(ownerId, tripId), '/votes'), { method: 'POST', token, body: { candidateId, value } })
      return data.trip
    })
  }

  async function addComment(ownerId, tripId, comment) {
    return withSession(ownerId, async token => {
      const data = await request(tripPath(remoteTripId(ownerId, tripId), '/comments'), { method: 'POST', token, body: comment })
      return data.trip
    })
  }

  async function deleteComment(ownerId, tripId, commentId) {
    return withSession(ownerId, async token => {
      const data = await request(tripPath(remoteTripId(ownerId, tripId), `/comments/${encodeURIComponent(commentId)}`), { method: 'DELETE', token })
      return data.trip
    })
  }

  async function addTask(ownerId, tripId, task) {
    return withSession(ownerId, async token => {
      const data = await request(tripPath(remoteTripId(ownerId, tripId), '/tasks'), { method: 'POST', token, body: task })
      return data.trip
    })
  }

  async function taskAction(ownerId, tripId, taskId, action, body) {
    return withSession(ownerId, async token => {
      const data = await request(tripPath(remoteTripId(ownerId, tripId), `/tasks/${encodeURIComponent(taskId)}/${action}`), { method: 'POST', token, body })
      return data.trip
    })
  }

  async function deleteTask(ownerId, tripId, taskId) {
    return withSession(ownerId, async token => {
      const data = await request(tripPath(remoteTripId(ownerId, tripId), `/tasks/${encodeURIComponent(taskId)}`), { method: 'DELETE', token })
      return data.trip
    })
  }

  async function chatToken(ownerId, tripId) {
    return withSession(ownerId, async token => {
      return request(tripPath(remoteTripId(ownerId, tripId), '/chat-token'), { method: 'POST', token })
    })
  }

  return {
    baseUrl: root,
    status,
    session,
    bind,
    restore,
    logout,
    createTrip,
    getTrip,
    updateTrip,
    createInvite,
    cancelInvite,
    acceptInvite,
    patchMember,
    removeMember,
    leaveTrip,
    vote,
    addComment,
    deleteComment,
    addTask,
    claimTask: (ownerId, tripId, taskId) => taskAction(ownerId, tripId, taskId, 'claim'),
    releaseTask: (ownerId, tripId, taskId) => taskAction(ownerId, tripId, taskId, 'release'),
    completeTask: (ownerId, tripId, taskId, completed = true) => taskAction(ownerId, tripId, taskId, 'complete', { completed }),
    deleteTask,
    chatToken
  }
}

export const collaborationService = createCollaborationService()

export { apiErrorMessage }

<template>
<section class="collab" aria-label="同行协商">
  <div class="collab-head">
    <h3>同行协商</h3>
    <span v-if="trip" class="pill">{{ roleLabel(trip.myRole) }} · v{{ trip.version }}</span>
    <span v-else-if="session" class="pill">已连接</span>
  </div>
  <p class="hint">同行协商使用服务端账号与成员权限：组织者、成员和只读访客看到的操作不同。未加入或被移除的账号无法读取协商内容。组织者可为成员开启共享资料编辑权限。成员分别编辑的活动可在同步时合并。</p>

  <p v-if="!boundPhone" class="warning" role="alert">
    当前登录账号没有手机号和密码，无法启用服务端协作身份。请先在个人中心绑定手机号并设置密码。
  </p>

  <div v-else-if="!session" class="gate">
    <form class="row" @submit.prevent="bind">
      <label>手机号<input :value="boundPhone" readonly></label>
      <label>登录密码<input v-model="password" type="password" minlength="6" maxlength="20" autocomplete="current-password" required placeholder="用于验证服务端身份"></label>
      <button :disabled="binding">{{ binding ? '连接中…' : '连接协作服务' }}</button>
    </form>
    <p class="hint">首次连接会用当前手机号创建协作账号；其他设备使用同一手机号和密码连接，即可看到同一旅行协商空间。密码只用于本次验证，浏览器只保存随机会话令牌。</p>
  </div>

  <template v-else>
    <div class="identity">
      <span>协作身份：{{ session.user?.nickname || '成员' }} · {{ session.user?.phone || boundPhone }}</span>
      <button class="link" @click="disconnect">退出协作身份</button>
    </div>
    <p v-if="loading" class="hint">正在读取协作空间…</p>
    <p v-if="error" class="error" role="alert">{{ error }} <button class="link" @click="load()">重试</button></p>
    <p v-if="notice" class="ok" role="status">{{ notice }}</p>
    <p v-if="accessLost" class="error" role="alert">你已不在该旅行的协作空间中，无法继续读取或修改协商内容。</p>

    <div v-if="!trip && !accessLost" class="gate">
      <p>当前旅行还没有协作空间。</p>
      <div class="row">
        <button :disabled="creating" @click="createSpace">{{ creating ? '创建中…' : '创建协作空间' }}</button>
        <form class="row" @submit.prevent="join">
          <label>已有邀请码<input v-model="joinCode" maxlength="64" placeholder="输入邀请码加入"></label>
          <button :disabled="joining">{{ joining ? '加入中…' : '加入' }}</button>
        </form>
      </div>
    </div>

    <template v-if="trip">
      <div v-if="conflict" class="warning" role="alert">
        {{ conflict }} <button class="link" @click="resolveConflict">刷新云端内容</button>
      </div>

      <div class="row actions">
        <button :disabled="busy" @click="refresh">刷新</button>
        <button v-if="trip.myCanEdit" :disabled="busy" @click="syncCandidates">同步本地候选地点</button>
        <button v-if="canChat" :disabled="busy" @click="openChat">打开同行聊天室</button>
        <span v-else-if="trip.myRole === 'viewer'" class="hint">只读访客不能进入聊天室</span>
        <span v-else class="hint">聊天室需服务端配置 CHAT_AUTH_SECRET 后才能使用</span>
        <button v-if="trip.myRole !== 'owner'" :disabled="busy" @click="leaveSpace">退出协作空间</button>
      </div>
      <p class="hint">云端版本 {{ trip.version }} · 最后更新 {{ formatTime(trip.updatedAt) }} · 编辑共享资料需要组织者开启权限。</p>
      <SharedLedger v-if="session?.user?.id" :key="contextKey" :trip="trip" :local-trip-id="route.id"
        :owner-id="ownerId" :account-id="session.user.id" @updated="acceptUpdate" @access-error="handleFailure" />

      <details open>
        <summary>共享每日行程（{{ sharedDays.length }} 天 / {{ sharedActivityCount }} 项）</summary>
        <p class="hint">共享日期、活动、地点、当日预算与用餐信息。同步会合并各自改动的活动，同一活动发生冲突时由你选择。个人账本、准备清单和手记保存在各自账号。</p>
        <p v-if="trip.daysUpdatedAt" class="hint" data-testid="shared-days-meta">最近同步：{{ formatTime(trip.daysUpdatedAt) }} · {{ trip.daysUpdatedByName || '成员' }}</p>
        <p v-else class="hint">云端还没有共享行程。有编辑权限的成员可以把本机每日行程同步上来。</p>
        <ul v-if="sharedDays.length" class="shared-days">
          <li v-for="day in sharedDays" :key="day.date">
            <strong>{{ day.date }}</strong>
            <span class="counts">{{ (day.activities || []).length }} 项<template v-if="day.budget != null"> · 预算 ¥{{ day.budget }}</template></span>
            <span class="hint">{{ daySummary(day) }}</span>
          </li>
        </ul>
        <div class="row actions">
          <button v-if="trip.myCanEdit" :disabled="busy || (!localDays.length && !baseline)" @click="syncItinerary">同步本地行程到云端</button>
          <button :disabled="busy || (!sharedDays.length && !baseline)" @click="applySharedItinerary">把云端行程写回本机</button>
        </div>
        <form v-if="review && review.context === contextKey" class="itinerary-conflicts warning" @submit.prevent="submitReview">
          <strong>请选择要保留的修改</strong>
          <p>各自改动的其他字段会一并保留。</p>
          <fieldset v-for="item in review.conflicts" :key="item.key">
            <legend>{{ item.label }}</legend>
            <label v-for="side in ['local', 'remote']" :key="side">
              <input v-model="resolutions[item.key]" type="radio" :name="item.key" :value="side" required>
              {{ side === 'local' ? '本机' : '云端' }} · {{ conflictText(item, side) }}
            </label>
          </fieldset>
          <button :disabled="busy">{{ review.mode === 'push' ? '确认选择并同步' : '确认选择并写回' }}</button>
          <button type="button" :disabled="busy" @click="review = null">取消</button>
        </form>
        <p v-if="trip.myCanEdit && !localDays.length" class="hint">本机还没有每日行程可同步。</p>
        <p v-else-if="!trip.myCanEdit" class="hint">你没有共享资料编辑权限，只能把云端共享行程写回本机查看。</p>
      </details>

      <details open>
        <summary>成员（{{ trip.members.length }}）</summary>
        <ul class="members">
          <li v-for="member in trip.members" :key="member.id">
            <span class="name">{{ member.name }}<span v-if="member.isMe">（我）</span></span>
            <span class="pill">{{ roleLabel(member.role) }}</span>
            <span v-if="member.role === 'member'" class="hint">{{ member.canEdit ? '可编辑共享资料' : '仅参与协商' }}</span>
            <template v-if="trip.myRole === 'owner' && member.role !== 'owner'">
              <label v-if="member.role === 'member'" class="inline">
                <input type="checkbox" :checked="member.canEdit" :disabled="busy" @change="toggleEdit(member, $event)">允许编辑共享资料
              </label>
              <button class="danger-link" :disabled="busy" @click="removeMember(member)">移除</button>
            </template>
          </li>
        </ul>

        <template v-if="trip.myRole === 'owner'">
          <form class="row invite-form" @submit.prevent="createInvite">
            <label>邀请角色
              <select v-model="inviteForm.role">
                <option value="member">成员</option>
                <option value="viewer">只读访客</option>
              </select>
            </label>
            <label v-if="inviteForm.role === 'member'" class="inline">
              <input v-model="inviteForm.canEdit" type="checkbox">允许编辑共享资料
            </label>
            <label>有效期（天）<input v-model.number="inviteForm.expiresInDays" type="number" min="1" max="30"></label>
            <button :disabled="busy">生成邀请码</button>
          </form>
          <div v-if="inviteCode" class="invite-code">
            <span>新邀请码：<code>{{ inviteCode }}</code></span>
            <button class="link" @click="copyInvite">复制</button>
            <span class="hint">邀请码可重复使用，过期或被取消后失效。</span>
          </div>
          <div v-if="trip.invites.length">
            <p>有效邀请：</p>
            <ul>
              <li v-for="invite in trip.invites" :key="invite.id">
                {{ roleLabel(invite.role) }} · 尾号 {{ invite.codePreview }} · {{ formatDate(invite.expiresAt) }} 到期
                <button class="danger-link" :disabled="busy" @click="cancelInvite(invite)">取消</button>
              </li>
            </ul>
          </div>
        </template>
      </details>

      <details open>
        <summary>候选地点投票（{{ trip.candidates.length }}）</summary>
        <p class="hint">投票只影响协商结论，不会自动改动日程。每位成员对同一候选地点只有一票，可改投或撤回。</p>
        <p v-if="!trip.candidates.length" class="hint">协作空间还没有候选地点。{{ trip.myCanEdit ? '先在下方待安排候选池添加地点，再点“同步本地候选地点”。' : '等待有编辑权限的成员同步候选地点。' }}</p>
        <ul class="votes">
          <li v-for="candidate in trip.candidates" :key="candidate.id">
            <span class="name">{{ candidate.title }}</span>
            <span class="counts">支持 {{ voteOf(candidate.id).support.length }} · 反对 {{ voteOf(candidate.id).oppose.length }}</span>
            <template v-if="trip.myRole !== 'viewer'">
              <button :class="{ active: voteOf(candidate.id).myVote === 'support' }" :disabled="busy" @click="vote(candidate.id, 'support')">支持</button>
              <button :class="{ active: voteOf(candidate.id).myVote === 'oppose' }" :disabled="busy" @click="vote(candidate.id, 'oppose')">反对</button>
              <button v-if="voteOf(candidate.id).myVote" :disabled="busy" @click="vote(candidate.id, 'withdraw')">撤回</button>
            </template>
          </li>
        </ul>
      </details>

      <details open>
        <summary>按天留言（{{ trip.comments.length }}）</summary>
        <form v-if="trip.myRole !== 'viewer'" class="comment-form" @submit.prevent="addComment">
          <div class="row">
            <label>日期
              <select v-model="commentDraft.dayDate">
                <option value="">不指定</option>
                <option v-for="day in route.days" :key="day.date" :value="day.date">{{ day.date }}</option>
              </select>
            </label>
            <label>活动（可选）
              <select v-model="commentDraft.activityId">
                <option value="">当天整体</option>
                <option v-for="activity in commentActivities" :key="activity.id" :value="activity.id">{{ activity.time }} {{ activity.title }}</option>
              </select>
            </label>
          </div>
          <label>留言内容<textarea v-model="commentDraft.content" maxlength="500" rows="2" placeholder="例如：第二天下午想改成室内展馆"></textarea></label>
          <button :disabled="busy || !commentDraft.content.trim()">发布留言</button>
        </form>
        <p v-else class="hint">只读访客可以查看留言，不能发布或删除。</p>
        <p v-if="!trip.comments.length" class="hint">还没有留言。</p>
        <ul class="comments">
          <li v-for="comment in trip.comments" :key="comment.id">
            <div>
              <strong>{{ comment.authorName }}</strong>
              <span class="hint"> · {{ formatTime(comment.createdAt) }}</span>
              <span v-if="comment.dayDate" class="pill">{{ comment.dayDate }}</span>
              <span v-if="comment.activityId" class="pill">{{ activityTitle(comment.activityId) }}</span>
            </div>
            <p>{{ comment.content }}</p>
            <button v-if="canDeleteComment(comment)" class="danger-link" :disabled="busy" @click="deleteComment(comment)">删除</button>
          </li>
        </ul>
      </details>

      <details open>
        <summary>任务认领（{{ trip.tasks.length }}）</summary>
        <p class="hint">任务只能被一人认领；多人同时认领时服务端只接受一个，其他人会看到已被认领。</p>
        <form v-if="trip.myRole !== 'viewer'" class="row" @submit.prevent="addTask">
          <label>任务<input v-model="taskDraft.title" maxlength="120" required placeholder="例如：预订民宿"></label>
          <label>备注<input v-model="taskDraft.note" maxlength="500" placeholder="可选"></label>
          <label>日期
            <select v-model="taskDraft.dayDate">
              <option value="">不指定</option>
              <option v-for="day in route.days" :key="day.date" :value="day.date">{{ day.date }}</option>
            </select>
          </label>
          <button :disabled="busy || !taskDraft.title.trim()">添加任务</button>
        </form>
        <p v-if="!trip.tasks.length" class="hint">还没有任务。</p>
        <ul class="tasks">
          <li v-for="task in trip.tasks" :key="task.id">
            <div>
              <strong :class="{ done: task.completedAt }">{{ task.title }}</strong>
              <span v-if="task.dayDate" class="pill">{{ task.dayDate }}</span>
              <span v-if="task.note" class="hint"> · {{ task.note }}</span>
            </div>
            <p class="hint">
              创建：{{ task.creatorName }}
              <template v-if="task.claimedBy"> · 认领：{{ task.claimedByName }}</template>
              <template v-else> · 待认领</template>
              <template v-if="task.completedAt"> · 已完成 {{ formatTime(task.completedAt) }}</template>
            </p>
            <div v-if="trip.myRole !== 'viewer'" class="row">
              <button v-if="!task.claimedBy && !task.completedAt" :disabled="busy" @click="claimTask(task)">认领</button>
              <button v-if="task.claimedBy && !task.completedAt && (task.claimedBy === session.user?.id || trip.myRole === 'owner')" :disabled="busy" @click="completeTask(task)">确认完成</button>
              <button v-if="task.claimedBy && !task.completedAt && (task.claimedBy === session.user?.id || trip.myRole === 'owner')" :disabled="busy" @click="releaseTask(task)">释放</button>
              <button v-if="task.completedAt && (task.claimedBy === session.user?.id || trip.myRole === 'owner')" :disabled="busy" @click="reopenTask(task)">重新打开</button>
              <button v-if="task.createdBy === session.user?.id || trip.myRole === 'owner'" class="danger-link" :disabled="busy" @click="deleteTask(task)">删除</button>
            </div>
          </li>
        </ul>
      </details>
    </template>
  </template>
</section>
</template>

<script setup>
import SharedLedger from './SharedLedger.vue'
import { canonicalDays, conflictText, identifyActivities, mergeItineraries } from '../utils/mergeItineraries.js'
import { reconcileTravelEstimates } from '../services/mapPlaces.js'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { collaborationService } from '../services/collaborationService.js'
import { useAuthStore } from '../stores/auth.js'
import { useTravelStore } from '../stores/travel.js'
import { useFeedback } from '../composables/useFeedback.js'

const props = defineProps({
  route: { type: Object, required: true },
  savePlan: { type: Function, default: null }
})
const auth = useAuthStore()
const travel = useTravelStore()
const feedback = useFeedback()
const router = useRouter()

const session = ref(null)
const trip = ref(null)
const loading = ref(false)
const busy = ref(false)
const binding = ref(false)
const creating = ref(false)
const joining = ref(false)
const password = ref('')
const joinCode = ref('')
const inviteCode = ref('')
const error = ref('')
const notice = ref('')
const conflict = ref('')
const accessLost = ref(false)
const status = ref(null)
const inviteForm = reactive({ role: 'member', canEdit: false, expiresInDays: 7 })
const commentDraft = reactive({ dayDate: '', activityId: '', content: '' })
const taskDraft = reactive({ title: '', note: '', dayDate: '' })

const ownerId = computed(() => travel.ownerId)
const boundPhone = computed(() => auth.user?.phone || '')
const canChat = computed(() => Boolean(trip.value?.chat?.configured) && trip.value?.myRole !== 'viewer')

let pollTimer = null
let disposed = false
let pollDelay = 20000

const candidates = computed(() => (props.route.pendingActivities || []).map((activity, index) => {
  const raw = typeof activity.id === 'string' ? activity.id : ''
  return {
    id: /^[A-Za-z0-9_-]{1,128}$/.test(raw) ? raw : `pending-${index}`,
    title: String(activity.title || '未命名地点').slice(0, 200)
  }
}))

const localDays = computed(() => (Array.isArray(props.route.days) ? props.route.days : []))
const sharedDays = computed(() => (Array.isArray(trip.value?.days) ? trip.value.days : []))
const sharedActivityCount = computed(() => sharedDays.value.reduce((total, day) => total + (Array.isArray(day.activities) ? day.activities.length : 0), 0))

const contextKey = computed(() => JSON.stringify([ownerId.value, props.route.id, session.value?.user?.id, trip.value?.id]))
const baseline = computed(() => {
  const value = props.route.collaborationBaseline
  return value?.context === contextKey.value && Array.isArray(value.days) ? value.days : null
})
const review = ref(null)
const resolutions = ref({})
const clone = value => JSON.parse(JSON.stringify(value))

const commentActivities = computed(() => {
  if (!commentDraft.dayDate) return []
  const day = (props.route.days || []).find(item => item.date === commentDraft.dayDate)
  return (day?.activities || []).filter(activity => activity && activity.id)
})

// 切换日期或日程变化后，清掉已不属于当天的活动，避免把留言挂到错误的行程项上。
watch([() => commentDraft.dayDate, () => props.route.days], () => {
  if (commentDraft.activityId && !commentActivities.value.some(activity => activity.id === commentDraft.activityId)) {
    commentDraft.activityId = ''
  }
  if (commentDraft.dayDate && !(props.route.days || []).some(day => day.date === commentDraft.dayDate)) {
    commentDraft.dayDate = ''
  }
}, { deep: true })

function roleLabel(role) {
  return { owner: '组织者', member: '成员', viewer: '只读访客' }[role] || '成员'
}

function formatTime(value) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleString('zh-CN', { hour12: false })
  } catch { return '' }
}

function formatDate(value) {
  if (!value) return ''
  try { return new Date(value).toLocaleDateString('zh-CN') } catch { return '' }
}

function voteOf(candidateId) {
  return trip.value?.votes?.find(item => item.candidateId === candidateId) || { support: [], oppose: [], myVote: '' }
}

function activityTitle(activityId) {
  for (const day of props.route.days || []) {
    const found = (day.activities || []).find(activity => activity.id === activityId)
    if (found) return found.title || '活动'
  }
  return '活动'
}

function daySummary(day) {
  const titles = (day?.activities || []).map(activity => activity?.title).filter(Boolean)
  if (!titles.length) return '暂无活动'
  return titles.slice(0, 3).join('、') + (titles.length > 3 ? ` 等 ${titles.length} 项` : '')
}

function canDeleteComment(comment) {
  return Boolean(session.value?.user?.id) && (comment.accountId === session.value.user.id || trip.value?.myRole === 'owner')
}

function messageOf(failure) {
  return failure?.message || '协作服务暂时不可用，请稍后重试'
}

function stopPoll() {
  if (pollTimer !== null) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}

function acceptUpdate(next) {
  if (trip.value?.id === next.id && next.version >= trip.value.version) trip.value = next
}

function schedulePoll(delay = pollDelay) {
  stopPoll()
  // 服务端渲染与单元测试没有 document，不启动轮询计时器。
  if (disposed || typeof document === 'undefined' || !session.value || !trip.value || accessLost.value) return
  pollTimer = setTimeout(async () => {
    pollTimer = null
    if (disposed || !session.value || !trip.value) return
    if (document.hidden) { schedulePoll(); return }
    try {
      const next = await collaborationService.getTrip(ownerId.value, props.route.id)
      if (disposed) return
      if (!next) {
        trip.value = null
        notice.value = '协作空间已被删除。'
        return
      }
      acceptUpdate(next)
      error.value = ''
      schedulePoll()
    } catch (failure) {
      if (disposed) return
      handleFailure(failure)
      if (!accessLost.value && session.value) schedulePoll(5000)
    }
  }, delay)
}

function handleFailure(failure) {
  error.value = messageOf(failure)
  const code = failure?.code
  if (code === 'FORBIDDEN') {
    accessLost.value = true
    trip.value = null
    stopPoll()
  } else if (code === 'AUTH_REQUIRED') {
    session.value = null
    trip.value = null
    stopPoll()
  } else if (code === 'CHAT_NOT_CONFIGURED') {
    notice.value = failure.message
  }
}

async function load({ quiet = false } = {}) {
  if (!ownerId.value) return
  if (!quiet) loading.value = true
  error.value = ''
  accessLost.value = false
  try {
    if (!session.value) session.value = await collaborationService.restore(ownerId.value)
    if (!session.value) return
    if (!status.value) {
      try { status.value = await collaborationService.status() } catch { status.value = null }
    }
    if (trip.value) {
      // 刷新时保留已有内容，失败时仍可查看上一次同步结果。
      try {
        const previousId = trip.value.id
        const next = await collaborationService.getTrip(ownerId.value, props.route.id)
        if (disposed || trip.value?.id !== previousId) return
        if (next) acceptUpdate(next)
        else trip.value = null
      } catch (failure) { handleFailure(failure); return }
    } else {
      trip.value = await collaborationService.getTrip(ownerId.value, props.route.id)
    }
    if (!trip.value) notice.value = notice.value || '尚未创建协作空间。'
    schedulePoll()
  } catch (failure) {
    handleFailure(failure)
  } finally {
    loading.value = false
  }
}

async function bind() {
  error.value = ''
  notice.value = ''
  if (!boundPhone.value) { error.value = '请先在个人中心绑定手机号'; return }
  const passwordValue = password.value
  if (passwordValue.length < 6 || passwordValue.length > 20) {
    error.value = '密码长度应为6-20位'
    return
  }
  binding.value = true
  try {
    session.value = await collaborationService.bind(ownerId.value, {
      phone: boundPhone.value,
      password: passwordValue,
      nickname: auth.user?.nickname || ''
    })
    password.value = ''
    notice.value = '已连接协作服务。'
    await load({ quiet: true })
  } catch (failure) {
    error.value = messageOf(failure)
  } finally {
    binding.value = false
  }
}

async function disconnect() {
  stopPoll()
  if (ownerId.value) await collaborationService.logout(ownerId.value)
  session.value = null
  trip.value = null
  inviteCode.value = ''
  notice.value = '已退出协作身份，本机旅行数据不受影响。'
}

async function createSpace() {
  error.value = ''
  notice.value = ''
  creating.value = true
  try {
    try {
      trip.value = await collaborationService.createTrip(ownerId.value, {
        id: props.route.id,
        title: props.route.title || '未命名旅行',
        candidates: candidates.value
      })
    } catch (failure) {
      if (failure?.code !== 'TRIP_EXISTS') throw failure
      trip.value = await collaborationService.getTrip(ownerId.value, props.route.id)
    }
    notice.value = '协作空间已创建。把邀请码发给同行人即可加入。'
    schedulePoll()
  } catch (failure) {
    handleFailure(failure)
  } finally {
    creating.value = false
  }
}

async function join() {
  error.value = ''
  notice.value = ''
  const code = joinCode.value.trim()
  if (!code) { error.value = '请输入邀请码'; return }
  joining.value = true
  try {
    trip.value = await collaborationService.acceptInvite(ownerId.value, code, { localTripId: props.route.id })
    joinCode.value = ''
    notice.value = '已加入协作空间。'
    schedulePoll()
  } catch (failure) {
    handleFailure(failure)
  } finally {
    joining.value = false
  }
}

async function refresh() {
  await load({ quiet: true })
}

async function syncCandidates() {
  if (!trip.value) return
  error.value = ''
  conflict.value = ''
  busy.value = true
  try {
    trip.value = await collaborationService.updateTrip(ownerId.value, props.route.id, {
      version: trip.value.version,
      candidates: candidates.value
    })
    notice.value = candidates.value.length ? '已同步本地候选地点。' : '候选池为空，已清空云端候选地点。'
  } catch (failure) {
    if (failure?.code === 'VERSION_CONFLICT') {
      conflict.value = failure.message
    } else {
      handleFailure(failure)
    }
  } finally {
    busy.value = false
  }
}

function showReview(mode, conflicts, previous) {
  const choices = { ...previous }
  resolutions.value = {}
  review.value = { mode, context: contextKey.value, conflicts, choices }
}

async function submitReview() {
  if (!review.value || review.value.context !== contextKey.value) return
  const { mode, conflicts, choices } = review.value
  for (const item of conflicts) {
    const side = resolutions.value[item.key]
    if (!['local', 'remote'].includes(side)) return
    choices[item.key] = { side, signature: item.signature }
  }
  await synchronizeDays(mode, choices)
}

function syncItinerary() {
  return synchronizeDays('push')
}

async function applySharedItinerary() {
  if (!trip.value || busy.value) return
  const context = contextKey.value
  const description = baseline.value
    ? '写回时将保留本机独立修改，并保存合并后的每日安排。'
    : '首次写回将用云端行程替换本机的每日安排。'
  if (!await feedback.confirm(description, { title: '写回本机行程', confirmLabel: '写回本机', danger: !baseline.value })) return
  if (context === contextKey.value) await synchronizeDays('pull')
}

async function synchronizeDays(mode, choices = {}) {
  if (!trip.value || busy.value || (mode === 'push' && !trip.value.myCanEdit)) return
  const context = contextKey.value
  const active = () => !disposed && context === contextKey.value
  error.value = ''
  conflict.value = ''
  notice.value = ''
  review.value = null
  busy.value = true
  try {
    // Polling is only for display. Start every merge, including a submitted
    // resolution, with a fresh authorized read before showing any differences.
    let current = await collaborationService.getTrip(ownerId.value, props.route.id)
    if (!active()) return
    if (!current) throw new Error('协作空间已删除')
    trip.value = current
    if (mode === 'push' && !current.myCanEdit) throw new Error('共享行程编辑权限已变更')
    const base = baseline.value || []
    const firstImport = mode === 'pull' && !baseline.value
    // A first import explicitly replaces the draft. Incomplete local rows
    // should not prevent downloading the shared itinerary.
    if (!firstImport) identifyActivities(localDays.value, { local: true, legacyCloud: sharedDays.value })
    const local = firstImport ? [] : canonicalDays(localDays.value)
    for (let attempt = 0; attempt < 3; attempt++) {
      const cloud = canonicalDays(current.days || [])
      const result = firstImport
        ? { days: cloud, conflicts: [] }
        : mergeItineraries(base, local, cloud, choices)
      if (result.conflicts.length) {
        showReview(mode, result.conflicts, choices)
        return
      }
      // Merged order or coordinates may invalidate a previously queried transfer.
      const days = clone(result.days)
      reconcileTravelEstimates(days)
      if (mode === 'pull') {
        // Keep private local activity fields when importing a matching shared row.
        const rawLocal = new Map(localDays.value.flatMap(day => day.activities || []).map(item => [item.id, item]))
        const projected = new Map(local.flatMap(day => day.activities).map(item => [item.id, item]))
        for (const day of days) {
          day.activities = day.activities.map(item => {
            const raw = rawLocal.get(item.id)
            if (!raw || !projected.has(item.id)) return item
            if (JSON.stringify(projected.get(item.id)) === JSON.stringify(item)) return raw
            const extras = { ...raw }
            for (const key of Object.keys(projected.get(item.id))) delete extras[key]
            return { ...extras, ...item }
          })
        }
        props.route.days = days
        props.route.collaborationBaseline = { context, days: cloud }
        if (props.savePlan && !await props.savePlan()) {
          if (active()) error.value = '每日行程已写入本机草稿，但保存旅行失败，请处理后重试。'
          return
        }
        if (active()) notice.value = props.savePlan
          ? `已把云端 ${cloud.length} 天共享行程写回本机并保存。`
          : '已写回本机草稿，请保存旅行。'
        return
      }
      try {
        const updated = await collaborationService.updateTrip(ownerId.value, props.route.id, { version: current.version, days })
        if (!active()) return
        trip.value = updated
        // Track exactly what this draft submitted. A remote-only change missing
        // from the draft must stay remote-only on subsequent pushes and reloads.
        props.route.collaborationBaseline = { context, days: local }
        notice.value = `已同步本机 ${local.length} 天每日行程。写回可查看合并后的安排。`
        return
      } catch (failure) {
        if (!active()) return
        if (failure?.code !== 'VERSION_CONFLICT' || attempt === 2) throw failure
        current = await collaborationService.getTrip(ownerId.value, props.route.id)
        if (!active()) return
        if (!current) throw new Error('协作空间已删除')
        trip.value = current
        if (!current.myCanEdit) throw new Error('共享行程编辑权限已变更')
      }
    }
  } catch (failure) {
    if (active()) handleFailure(failure)
  } finally {
    busy.value = false
  }
}

async function resolveConflict() {
  conflict.value = ''
  await load({ quiet: true })
}

async function createInvite() {
  error.value = ''
  inviteCode.value = ''
  busy.value = true
  try {
    const result = await collaborationService.createInvite(ownerId.value, props.route.id, {
      role: inviteForm.role,
      canEdit: inviteForm.role === 'member' ? inviteForm.canEdit : false,
      expiresInDays: inviteForm.expiresInDays
    })
    trip.value = result.trip
    inviteCode.value = result.code
    notice.value = '邀请码已生成，有效期至 ' + formatDate(result.invite.expiresAt) + '。'
  } catch (failure) {
    handleFailure(failure)
  } finally {
    busy.value = false
  }
}

async function copyInvite() {
  try {
    await navigator.clipboard.writeText(inviteCode.value)
    notice.value = '邀请码已复制。'
  } catch {
    notice.value = '自动复制未完成，请手动选择邀请码复制。'
  }
}

async function cancelInvite(invite) {
  if (!await feedback.confirm(`确定取消尾号 ${invite.codePreview} 的邀请吗？`, { title: '取消邀请', confirmLabel: '取消邀请', danger: true })) return
  busy.value = true
  try {
    trip.value = await collaborationService.cancelInvite(ownerId.value, props.route.id, invite.id)
    notice.value = '邀请已取消。'
  } catch (failure) {
    handleFailure(failure)
  } finally {
    busy.value = false
  }
}

async function toggleEdit(member, event) {
  // 先记下“目标状态”：服务端返回后 trip 会被整体替换，再读 member.canEdit 拿到的是旧值。
  const next = !member.canEdit
  busy.value = true
  error.value = ''
  try {
    trip.value = await collaborationService.patchMember(ownerId.value, props.route.id, member.id, { canEdit: next })
    notice.value = next ? `已允许 ${member.name} 编辑共享旅行资料。` : `已收回 ${member.name} 的共享资料编辑权限。`
  } catch (failure) {
    handleFailure(failure)
    // 权限没有改成功时把复选框回滚，避免界面看起来已经生效。
    if (event?.target) event.target.checked = Boolean(member.canEdit)
  } finally {
    busy.value = false
  }
}

async function removeMember(member) {
  // 未配置聊天服务管理员密钥时，Go 服务端无法立即吊销令牌，不能承诺“立即无法聊天”。
  const chatNote = trip.value?.chat?.configured
    ? (trip.value.chat.revokeConfigured
      ? '移除后该账号将立即无法读取协商内容和聊天室。'
      : '移除后该账号将立即无法读取协商内容；聊天室令牌最多还会在 15 分钟内有效（未配置聊天服务管理员密钥）。')
    : ''
  if (!await feedback.confirm(`确定把 ${member.name} 移出协作空间吗？${chatNote}`, { title: '移除成员', confirmLabel: '移除', danger: true })) return
  busy.value = true
  try {
    trip.value = await collaborationService.removeMember(ownerId.value, props.route.id, member.id)
    notice.value = `已移除 ${member.name}，旧邀请码同时失效。`
  } catch (failure) {
    handleFailure(failure)
  } finally {
    busy.value = false
  }
}

async function leaveSpace() {
  if (!await feedback.confirm('确定退出该旅行的协作空间吗？退出后需要新的邀请码才能重新加入。', { title: '退出协作空间', confirmLabel: '退出', danger: true })) return
  busy.value = true
  try {
    await collaborationService.leaveTrip(ownerId.value, props.route.id)
    stopPoll()
    trip.value = null
    notice.value = '已退出协作空间。'
  } catch (failure) {
    handleFailure(failure)
  } finally {
    busy.value = false
  }
}

async function vote(candidateId, value) {
  busy.value = true
  error.value = ''
  try {
    trip.value = await collaborationService.vote(ownerId.value, props.route.id, candidateId, value)
    notice.value = value === 'withdraw' ? '已撤回投票。' : '投票已更新。'
  } catch (failure) {
    handleFailure(failure)
  } finally {
    busy.value = false
  }
}

async function addComment() {
  const content = commentDraft.content.trim()
  if (!content) return
  busy.value = true
  error.value = ''
  try {
    trip.value = await collaborationService.addComment(ownerId.value, props.route.id, {
      content,
      dayDate: commentDraft.dayDate,
      activityId: commentDraft.activityId
    })
    commentDraft.content = ''
    notice.value = '留言已发布。'
  } catch (failure) {
    handleFailure(failure)
  } finally {
    busy.value = false
  }
}

async function deleteComment(comment) {
  if (!await feedback.confirm('确定删除这条留言吗？', { title: '删除留言', confirmLabel: '删除', danger: true })) return
  busy.value = true
  try {
    trip.value = await collaborationService.deleteComment(ownerId.value, props.route.id, comment.id)
    notice.value = '留言已删除。'
  } catch (failure) {
    handleFailure(failure)
  } finally {
    busy.value = false
  }
}

async function addTask() {
  const title = taskDraft.title.trim()
  if (!title) return
  busy.value = true
  error.value = ''
  try {
    trip.value = await collaborationService.addTask(ownerId.value, props.route.id, {
      title,
      note: taskDraft.note,
      dayDate: taskDraft.dayDate
    })
    taskDraft.title = ''
    taskDraft.note = ''
    notice.value = '任务已添加。'
  } catch (failure) {
    handleFailure(failure)
  } finally {
    busy.value = false
  }
}

async function claimTask(task) {
  busy.value = true
  error.value = ''
  try {
    trip.value = await collaborationService.claimTask(ownerId.value, props.route.id, task.id)
    notice.value = '任务已认领。'
  } catch (failure) {
    const message = messageOf(failure)
    handleFailure(failure)
    if (failure?.code === 'TASK_ALREADY_CLAIMED') {
      await load({ quiet: true })
      error.value = message
    }
  } finally {
    busy.value = false
  }
}

async function releaseTask(task) {
  busy.value = true
  try {
    trip.value = await collaborationService.releaseTask(ownerId.value, props.route.id, task.id)
    notice.value = '已释放任务。'
  } catch (failure) {
    handleFailure(failure)
  } finally {
    busy.value = false
  }
}

async function completeTask(task) {
  busy.value = true
  try {
    trip.value = await collaborationService.completeTask(ownerId.value, props.route.id, task.id, true)
    notice.value = '任务已完成。'
  } catch (failure) {
    handleFailure(failure)
  } finally {
    busy.value = false
  }
}

async function reopenTask(task) {
  busy.value = true
  try {
    trip.value = await collaborationService.completeTask(ownerId.value, props.route.id, task.id, false)
    notice.value = '任务已重新打开。'
  } catch (failure) {
    handleFailure(failure)
  } finally {
    busy.value = false
  }
}

async function deleteTask(task) {
  if (!await feedback.confirm('确定删除这个任务吗？', { title: '删除任务', confirmLabel: '删除', danger: true })) return
  busy.value = true
  try {
    trip.value = await collaborationService.deleteTask(ownerId.value, props.route.id, task.id)
    notice.value = '任务已删除。'
  } catch (failure) {
    handleFailure(failure)
  } finally {
    busy.value = false
  }
}

function openChat() {
  if (!canChat.value) return
  // 加入他人空间后，本机旅行 id 与服务端协作空间 id 可能不同；房间必须以服务端 id 为准。
  const tripId = trip.value?.id || props.route.id
  router.push({ name: 'chat', query: { room: `trip-${tripId}`, name: props.route.title || '同行聊天室' } })
}

function handleOnline() { if (session.value) load({ quiet: true }) }
function handleVisibility() { if (!document.hidden && session.value) load({ quiet: true }) }

onMounted(() => {
  disposed = false
  load()
  window.addEventListener('online', handleOnline)
  document.addEventListener('visibilitychange', handleVisibility)
})

onBeforeUnmount(() => {
  disposed = true
  stopPoll()
  window.removeEventListener('online', handleOnline)
  document.removeEventListener('visibilitychange', handleVisibility)
})
</script>

<style scoped>
.collab{margin:20px 0;padding:18px;border:1px solid #d7e1eb;border-radius:12px;background:#fff;color:#243449}
.collab-head{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
.collab-head h3{margin:0;font-size:18px}
.hint{color:#5b6b7d;font-size:13px;line-height:1.6}
.warning{border-left:4px solid #d69e2e;background:#fffbea;padding:10px 12px;border-radius:6px}
.error{border-left:4px solid #c53030;background:#fff5f5;padding:10px 12px;border-radius:6px;color:#8a1c1c}
.ok{color:#1f6f43;background:#edf9f1;padding:8px 10px;border-radius:6px}
.gate{margin:10px 0;padding:12px;background:#f7fafc;border-radius:8px}
.identity{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin:10px 0;color:#4a5a6a;font-size:14px}
.row{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin:10px 0}
form.row label,.comment-form label,.invite-form label{display:flex;flex-direction:column;gap:4px;font-size:13px;min-width:120px;flex:1}
label.inline{flex-direction:row;align-items:center;min-width:0}
input,select,textarea,button{padding:8px;border:1px solid #c9d5e1;border-radius:7px;font:inherit;max-width:100%}
textarea{resize:vertical}
button{cursor:pointer;background:#fff}
button:disabled{opacity:.55;cursor:not-allowed}
button.link,.danger-link{border:0;background:none;padding:2px 4px;text-decoration:underline}
.danger-link{color:#b42318}
button.active{background:#1f6f43;color:#fff;border-color:#1f6f43}
.pill{display:inline-block;padding:2px 8px;border-radius:999px;background:#e8f0fa;color:#31587a;font-size:12px;white-space:nowrap}
.actions button{min-width:110px}
details{margin:14px 0;border-top:1px solid #e5edf4;padding-top:8px}
summary{cursor:pointer;font-weight:600;padding:6px 0}
ul{padding-left:20px}
li{margin:8px 0;line-height:1.6}
.members li,.votes li,.tasks li,.shared-days li{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.members .name,.votes .name{font-weight:600}
.shared-days{padding-left:20px}
.shared-days .hint{flex-basis:100%}
.counts{color:#5b6b7d;font-size:13px}
.invite-form{margin:8px 0}
.invite-code{padding:10px;background:#f3f8fc;border-radius:8px;margin:8px 0;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
code{background:#0f2740;color:#fff;padding:2px 6px;border-radius:4px;word-break:break-all}
.comment-form{display:flex;flex-direction:column;gap:6px}
.comments li{background:#f8fbfd;padding:10px;border-radius:8px}
.itinerary-conflicts fieldset{margin:10px 0;min-width:0}.itinerary-conflicts label{display:block;overflow-wrap:anywhere}
.comments p{margin:6px 0;white-space:pre-wrap;overflow-wrap:anywhere}
.tasks li{background:#f8fbfd;padding:10px;border-radius:8px;display:block}
.tasks .done{text-decoration:line-through;color:#5b6b7d}
@media (max-width:640px){
  .collab{padding:12px}
  .row,form.row{flex-direction:column;align-items:stretch}
  form.row label{min-width:0}
  .actions button{width:100%}
}
</style>

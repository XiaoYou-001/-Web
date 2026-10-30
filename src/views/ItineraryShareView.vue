<template>
  <div class="share-container">
    <div class="share-card">
      <div v-if="readError" class="share-empty">
        <p role="alert">{{ readError }}</p>
        <div class="share-actions"><button class="btn-copy" @click="loadItinerary">重试</button><button class="btn-home" @click="goHome">返回主页</button></div>
      </div>
      <div v-else-if="notFound" class="share-empty">
        <h1>未找到该行程</h1>
        <p>该旧链接只读取当前浏览器账号的历史记录，记录可能不存在或已被删除。跨设备分享请在旅行工作台创建只读链接。</p>
        <button class="btn-home" @click="goHome">返回主页</button>
      </div>

      <template v-else-if="itinerary">
        <div class="share-header">
          <h1>{{ itinerary.name }}</h1>
          <p class="share-dates">{{ itinerary.startDate }} 至 {{ itinerary.endDate }}</p>
          <p v-if="itinerary.budget != null" class="share-budget">预算：¥{{ itinerary.budget }}</p>
        </div>

        <div v-if="itinerary.days && itinerary.days.length" class="share-days">
          <div v-for="(day, index) in itinerary.days" :key="index" class="share-day">
            <h2>第{{ index + 1 }}天 <span v-if="day.date">{{ day.date }}</span></h2>
            <ul class="activity-list">
              <li v-for="(activity, i) in day.activities" :key="i" class="activity">
                <span class="activity-time">{{ activity.time || '' }}</span>
                <div class="activity-body">
                  <span class="activity-title">{{ activity.title }}</span>
                  <span v-if="activity.description" class="activity-desc">{{ activity.description }}</span>
                </div>
              </li>
            </ul>
            <p v-if="day.budget != null" class="day-budget">当日预算：¥{{ day.budget }}</p>
          </div>
        </div>

        <div v-else class="share-hint">该行程暂无每日安排。</div>

        <div class="share-actions">
          <button class="btn-home" @click="goHome">返回主页</button>
          <button class="btn-copy" @click="copyPlan">复制行程计划</button>
        </div>
        <div v-if="manualCopyText" class="manual-copy">
          <label for="legacy-copy-text">自动复制未完成，可选中下方文本手动复制</label>
          <textarea id="legacy-copy-text" ref="copyField" :value="manualCopyText" readonly rows="10"></textarea>
        </div>
        <p class="share-note">本地历史行程预览 · 仅当前浏览器账号可见，此地址不是公开分享链接。</p>
      </template>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import itineraryService from '../services/itineraryService.js'
import { useFeedback } from '../composables/useFeedback.js'

export default {
  name: 'ItineraryShareView',
  setup() {
    const route = useRoute()
    const router = useRouter()
    const feedback = useFeedback()
    const itinerary = ref(null)
    const notFound = ref(false)
    const readError = ref('')
    const manualCopyText = ref('')
    const copyField = ref(null)

    const goHome = () => { router.replace('/') }

    const copyPlan = async () => {
      if (!itinerary.value) return
      const text = itineraryService.exportRoute({ ...itinerary.value, title: itinerary.value.name || itinerary.value.title })
      if (!text) { feedback.error('该行程暂无可复制的计划文本'); return }
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(text)
          manualCopyText.value = ''
          feedback.success('行程计划已复制到剪贴板')
          return
        } catch { /* fall through to fallback */ }
      }
      manualCopyText.value = text
      feedback.info('自动复制未完成，已显示可手动复制的计划文本。')
      await nextTick()
      copyField.value?.focus()
      copyField.value?.select()
    }

    const loadItinerary = () => {
      itinerary.value = null
      notFound.value = false
      readError.value = ''
      const id = route.params.id
      try {
        const found = itineraryService.getItinerary(String(id))
        if (found) itinerary.value = found
        else notFound.value = true
      } catch {
        readError.value = '本浏览器的行程数据暂时无法读取，原始记录未被修改，请稍后重试。'
      }
    }
    onMounted(loadItinerary)

    return { itinerary, notFound, readError, manualCopyText, copyField, goHome, copyPlan, loadItinerary }
  }
}
</script>

<style scoped>
.share-container {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 40px 20px;
  display: flex;
  justify-content: center;
}

.share-card {
  background: white;
  border-radius: 20px;
  padding: 40px;
  max-width: 720px;
  width: 100%;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
}

.share-empty {
  text-align: center;
  color: #666;
  padding: 40px 0;
}

.share-empty h1 { color: #333; margin-bottom: 12px; }
.share-empty p { line-height: 1.7; margin-bottom: 24px; }

.share-header {
  text-align: center;
  margin-bottom: 28px;
  padding-bottom: 20px;
  border-bottom: 2px solid #f0f0f0;
}

.share-header h1 { color: #333; margin: 0 0 8px; }
.share-dates { color: #888; margin: 4px 0; }
.share-budget { color: #667eea; font-weight: 500; margin: 6px 0 0; }

.share-day {
  padding: 16px 0;
  border-bottom: 1px solid #f0f0f0;
}

.share-day h2 { color: #667eea; font-size: 1.1rem; margin: 0 0 12px; }
.share-day h2 span { color: #999; font-weight: normal; font-size: 0.9rem; }

.activity-list { list-style: none; padding: 0; margin: 0; }

.activity {
  display: flex;
  gap: 14px;
  padding: 10px 0;
  align-items: flex-start;
}

.activity-time {
  flex-shrink: 0;
  min-width: 60px;
  color: #667eea;
  font-weight: 500;
  padding-top: 2px;
}

.activity-body { display: flex; flex-direction: column; min-width: 0; overflow-wrap: anywhere; }
.activity-title { color: #333; }
.activity-desc { color: #888; font-size: 0.9rem; margin-top: 4px; }

.day-budget { color: #b06ab3; font-size: 0.9rem; margin-top: 8px; }

.share-hint { color: #999; text-align: center; padding: 20px 0; }

.share-actions {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 28px;
}

.btn-home, .btn-copy {
  padding: 12px 24px;
  border: none;
  border-radius: 25px;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.3s ease;
}

.btn-home {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-copy {
  background: #eef0ff;
  color: #667eea;
  border: 2px solid #667eea;
}

.btn-home:hover, .btn-copy:hover { transform: translateY(-2px); }

.share-note {
  text-align: center;
  color: #bbb;
  font-size: 0.8rem;
  margin-top: 20px;
}

.manual-copy { margin-top: 20px; text-align: left; }
.manual-copy textarea { display: block; width: 100%; box-sizing: border-box; margin-top: 8px; padding: 10px; }
.share-card { overflow-wrap: anywhere; }
@media (max-width: 480px) { .share-card { padding: 20px; } }
</style>

function minutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value || '')
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null
  return Number(match[1]) * 60 + Number(match[2])
}

export function inspectPlan(route) {
  const issues = []
  for (const [dayIndex, day] of (route.days || []).entries()) {
    const dayLabel = `第${dayIndex + 1}天`
    if (!day.activities?.length) {
      issues.push({ message: `${dayLabel}尚未安排活动`, dayIndex, field: 'quickTitle' })
    }
    let previousEnd = 0
    for (const [activityIndex, activity] of (day.activities || []).entries()) {
      const add = (message, field) => issues.push({
        message: `${dayLabel}「${activity.title}」${message}`, dayIndex, activityIndex, field
      })
      const start = minutes(activity.time)
      const durationKnown = Number.isFinite(activity.durationMinutes) && activity.durationMinutes >= 0
      if (start === null) add('时间待确认', 'time')
      if (!durationKnown) add('停留时长待确认', 'durationMinutes')
      if (start === null) continue
      if (start < previousEnd) add('与前一活动重叠或未留交通缓冲', 'time')
      const duration = durationKnown ? activity.durationMinutes : 0
      const transfer = Number.isFinite(activity.travelMinutes) && activity.travelMinutes >= 0 ? activity.travelMinutes : 0
      const open = minutes(activity.opensAt), close = minutes(activity.closesAt)
      if (open !== null && start < open) add('早于填写的开放时间', 'time')
      if (close !== null && start + duration > close) add('超出填写的关闭时间', start > close ? 'time' : 'durationMinutes')
      previousEnd = start + duration + transfer
      if (previousEnd > 21 * 60) add('结束较晚，请检查体力与开放时间', 'time')
    }
  }
  const expenses = route.expenses || []
  if (!expenses.length) issues.push({message: '尚未录入预计费用', field: 'newExpense'})
  for (const [expenseIndex, expense] of expenses.entries()) {
    if (expense.estimate == null || expense.estimate === '') {
      issues.push({message: `「${expense.title || '费用记录'}」预计费用尚未录入`, expenseIndex, field: 'estimate'})
    }
  }
  const total = expenses.reduce((sum, expense) => sum + (Number(expense.estimate) || 0), 0)
  if (Number.isFinite(route.budget) && total > route.budget) {
    issues.push({message: `预计费用超过预算上限 ¥${(total - route.budget).toFixed(2)}`, field: 'budget'})
  }
  return issues
}

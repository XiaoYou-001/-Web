import { feedback } from '../../src/services/feedbackService.js';

// 业务回归测试只观察提示和动作；对话框本身由独立测试验证。
export function mockFeedback(t, notices = []) {
  feedback.reset();
  for (const method of ['success', 'error', 'info', 'warning']) t.mock.method(feedback, method, message => notices.push(message));
  t.mock.method(feedback, 'confirm', async () => true);
  t.after(() => feedback.reset());
  return notices;
}

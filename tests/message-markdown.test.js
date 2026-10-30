import assert from 'node:assert/strict';
import test from 'node:test';
import { renderMessageMarkdown as render } from '../src/services/messageMarkdown.js';
test('reply markdown renders headings, emphasis, paragraphs, lists and line breaks', () => {
 const html = render('## 行程建议\n\n**第一天**\n游览故宫\n\n- 提前预约\n- 带好证件');
 assert.match(html, /<h2>行程建议<\/h2>/);
 assert.match(html, /<strong>第一天<\/strong><br>/);
 assert.match(html, /<li>提前预约<\/li>/);
});
test('model HTML, unsafe links and remote images stay inert, including partial markdown', () => {
 for (const input of ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '[点我](javascript:alert(1))', '![图片](https://example.com/tracker.png)']) {
  assert.doesNotMatch(render(input), /<script|<img|href="javascript:/i);
 }
 assert.match(render('## 标题\n\n**未完'), /<h2>标题/);
});

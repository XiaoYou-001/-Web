<template>
  <section class="not-found" aria-labelledby="not-found-title">
    <div class="error-code" aria-hidden="true">404</div>
    <p class="eyebrow">旅途中的小岔路</p>
    <h1 id="not-found-title">这个目的地暂时找不到</h1>
    <p>链接可能已经失效，或地址输入有误。回到首页，继续探索下一段旅程。</p>
    <router-link class="btn btn-primary" to="/">返回首页</router-link>
  </section>
</template>

<script>
export default { name: 'NotFoundView' }
</script>

<style scoped>
.not-found { min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px 20px; text-align: center; background: radial-gradient(ellipse at top, #e9edff, var(--bg-page) 70%); }
.error-code { font-size: clamp(80px, 20vw, 160px); font-weight: 800; line-height: 1; color: var(--primary); opacity: .2; }
.eyebrow { color: var(--primary); letter-spacing: .15em; }
h1 { font-size: clamp(24px, 5vw, 36px); margin: 12px 0; }
p { max-width: 480px; color: var(--text-secondary); }
a { display: inline-flex; margin-top: 20px; }
</style>

<template>
  <div class="nav-button" @click="$emit('click')">
    <div class="icon-container">
      <font-awesome-icon :icon="['fas', icon]" class="nav-icon" />
    </div>
    <h3>{{ title }}</h3>
    <p>{{ description }}</p>
  </div>
</template>

<script>
export default {
  name: 'NavButton',
  props: {
    icon: {
      type: String,
      required: true
    },
    title: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: true
    }
  }
}
</script>

<style scoped>
.nav-button {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 16px;
  padding: 30px 20px;
  cursor: pointer;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
  text-align: center;
  position: relative;
  overflow: hidden;
  backdrop-filter: blur(10px);
  border: 2px solid rgba(255, 255, 255, 0.5);
}

.nav-button::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 4px;
  background: linear-gradient(90deg, #667eea, #764ba2);
  transform: scaleX(0);
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  transform-origin: left;
}

.nav-button:hover::after {
  transform: scaleX(1);
}

.nav-button:hover {
  transform: translateY(-8px) scale(1.02);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.2);
  background: rgba(255, 255, 255, 1);
  border-color: rgba(102, 126, 234, 0.3);
}

.icon-container {
  width: 60px;
  height: 60px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 20px;
  color: white;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
  position: relative;
  overflow: hidden;
}

.icon-container::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%);
  transform: scale(0);
  transition: transform 0.5s ease-out;
}

.nav-button:hover .icon-container::before {
  transform: scale(1);
}

.nav-button:hover .icon-container {
  transform: scale(1.1) rotate(-5deg);
  box-shadow: 0 6px 25px rgba(102, 126, 234, 0.5);
}

.nav-icon {
  font-size: 28px;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
}

.nav-button:hover .nav-icon {
  transform: scale(1.15);
}

h3 {
  margin-bottom: 8px;
  color: #2b2d42;
  font-size: 1.25rem;
  font-weight: 700;
  transition: all 0.3s ease;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.nav-button:hover h3 {
  color: #667eea;
  transform: scale(1.05);
}

p {
  color: #666;
  font-size: 0.9rem;
  line-height: 1.5;
  transition: all 0.3s ease;
}

.nav-button:hover p {
  color: #444;
}
</style>
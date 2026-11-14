<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowRight, Lock, Monitor, User } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const form = reactive({
  username: 'admin',
  password: 'admin123'
})
const loading = ref(false)

function fillDemo() {
  form.username = 'admin'
  form.password = 'admin123'
}

async function submit() {
  if (!form.username.trim() || !form.password) {
    ElMessage.warning('请输入用户名和密码')
    return
  }
  loading.value = true
  try {
    await auth.login(form.username.trim(), form.password)
    ElMessage.success(`欢迎回来，${auth.displayName}`)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
    router.push(redirect)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <section class="login-visual">
      <div class="visual-grid" />
      <div class="visual-glow glow-a" />
      <div class="visual-glow glow-b" />

      <div class="visual-inner">
        <div class="visual-brand">
          <div class="visual-mark">F</div>
          <div class="visual-brand-copy">
            <b>FlowTest</b>
            <span>灵测 · 自然语言自动化</span>
          </div>
        </div>

        <div class="visual-copy">
          <div class="visual-pill"><span class="pill-dot" /> NATURAL LANGUAGE AUTOMATION</div>
          <h1>用一句话，<br />跑通整条<br /><em>测试链路。</em></h1>
          <p>
            把中文测试意图交给 FlowTest，自动生成步骤与断言，启动真实 Chrome，
            逐帧截图、实时回传，最后交付一份可追溯的执行报告。
          </p>
        </div>

        <div class="flow-demo">
          <div class="flow-track" />
          <div class="flow-step">
            <span class="flow-index">01</span>
            <div>
              <b>自然语言输入</b>
              <p>“登录后搜索机械键盘并加入购物车”</p>
            </div>
            <span class="flow-state">INPUT</span>
          </div>
          <div class="flow-step">
            <span class="flow-index">02</span>
            <div>
              <b>步骤与断言编译</b>
              <p>输入 · 点击 · 断言文本 · 截图</p>
            </div>
            <span class="flow-state">COMPILE</span>
          </div>
          <div class="flow-step live">
            <span class="flow-index">03</span>
            <div>
              <b>Chrome 实时执行</b>
              <p>SSE 推送状态、日志与步骤截图</p>
            </div>
            <span class="flow-state"><span class="live-dot" /> RUNNING</span>
          </div>
        </div>

        <div class="visual-foot">
          <span>Vue 3.5</span><i />
          <span>Spring Boot 3.5</span><i />
          <span>Selenium 4 · Chrome</span>
        </div>
      </div>
    </section>

    <section class="login-panel">
      <div class="login-box">
        <div class="mobile-brand">
          <div class="visual-mark">F</div>
          <b>FlowTest 灵测</b>
        </div>

        <div class="login-head">
          <div class="eyebrow">WELCOME BACK</div>
          <h2>登录工作台</h2>
          <p>使用演示账号进入 FlowTest，开始编排与执行 Web 自动化测试。</p>
        </div>

        <form class="login-form" @submit.prevent="submit">
          <label class="field">
            <span>用户名</span>
            <el-input v-model="form.username" size="large" placeholder="请输入用户名" autocomplete="username">
              <template #prefix><el-icon><User /></el-icon></template>
            </el-input>
          </label>
          <label class="field">
            <span>密码</span>
            <el-input
              v-model="form.password"
              type="password"
              size="large"
              show-password
              placeholder="请输入密码"
              autocomplete="current-password"
              @keyup.enter="submit"
            >
              <template #prefix><el-icon><Lock /></el-icon></template>
            </el-input>
          </label>

          <el-button class="login-submit" type="primary" size="large" native-type="submit" :loading="loading">
            进入工作台
            <el-icon class="submit-icon"><ArrowRight /></el-icon>
          </el-button>

          <button class="demo-fill" type="button" @click="fillDemo">
            填入演示账号 <code>admin / admin123</code>
          </button>
        </form>

        <div class="login-divider"><span>或</span></div>

        <a class="demo-link" href="/demo/index.html" target="_blank" rel="noreferrer">
          <el-icon><Monitor /></el-icon>
          打开 FlowShop 演示站点
          <span class="external">↗</span>
        </a>

        <div class="login-foot">
          <span>© 2026 FlowTest</span>
          <span>本地部署 · 数据不出内网</span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(460px, 0.92fr);
  background: #f7f7fb;
}

.login-visual {
  position: relative;
  overflow: hidden;
  display: flex;
  color: #fff;
  background:
    radial-gradient(circle at 12% 8%, rgba(91, 91, 214, 0.55), transparent 32%),
    radial-gradient(circle at 88% 88%, rgba(139, 92, 246, 0.35), transparent 40%),
    #0f1019;
  padding: 52px clamp(40px, 6vw, 84px);
}

.visual-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: radial-gradient(circle at 40% 30%, #000 0%, transparent 78%);
}

.visual-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(90px);
  pointer-events: none;
}

.glow-a {
  width: 380px;
  height: 380px;
  background: #4f46e5;
  opacity: 0.38;
  top: -160px;
  right: 8%;
}

.glow-b {
  width: 320px;
  height: 320px;
  background: #8b5cf6;
  opacity: 0.22;
  bottom: -140px;
  left: 18%;
}

.visual-inner {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 640px;
  margin: auto;
}

.visual-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.visual-mark {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: linear-gradient(140deg, #7c7cf0, #5b5bd6 55%, #8b5cf6);
  box-shadow: 0 14px 32px rgba(91, 91, 214, 0.45);
  font-size: 18px;
  font-weight: 900;
}

.visual-brand-copy {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.visual-brand-copy b {
  font-size: 17px;
  letter-spacing: -0.02em;
}

.visual-brand-copy span {
  color: #777a90;
  font-size: 9.5px;
  letter-spacing: 0.12em;
  margin-top: 3px;
}

.visual-copy {
  margin-top: auto;
  padding-top: 56px;
}

.visual-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  color: #b8b9d8;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.16em;
}

.pill-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ft-accent);
  box-shadow: 0 0 0 4px rgba(199, 244, 100, 0.1);
}

h1 {
  margin: 22px 0 20px;
  font-size: clamp(48px, 5.2vw, 70px);
  line-height: 1.03;
  letter-spacing: -0.055em;
  font-weight: 800;
}

h1 em {
  font-style: normal;
  background: linear-gradient(100deg, #c7f464 0%, #a5f3fc 48%, #c4b5fd 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.visual-copy > p {
  margin: 0;
  max-width: 500px;
  color: #9b9eb3;
  font-size: 13.5px;
  line-height: 1.85;
}

.flow-demo {
  position: relative;
  margin-top: 38px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  max-width: 560px;
}

.flow-track {
  position: absolute;
  left: 20px;
  top: 30px;
  bottom: 30px;
  width: 1px;
  background: linear-gradient(to bottom, rgba(199, 244, 100, 0.5), rgba(124, 124, 240, 0.15));
}

.flow-step {
  position: relative;
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(255, 255, 255, 0.075);
  backdrop-filter: blur(10px);
}

.flow-step.live {
  background: rgba(91, 91, 214, 0.16);
  border-color: rgba(139, 139, 226, 0.35);
}

.flow-index {
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.07);
  color: #c9caf4;
  font-size: 9px;
  font-weight: 800;
}

.flow-step b {
  display: block;
  font-size: 11.5px;
}

.flow-step p {
  margin: 3px 0 0;
  font-size: 10.5px;
  color: #85889f;
}

.flow-state {
  margin-left: auto;
  font-size: 8px;
  letter-spacing: 0.12em;
  color: #70738b;
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 5px;
}

.live-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--ft-accent);
  animation: ft-pulse 1.4s infinite;
}

.visual-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: auto;
  padding-top: 40px;
  color: #5f6278;
  font-size: 9px;
  letter-spacing: 0.08em;
  font-weight: 700;
  text-transform: uppercase;
}

.visual-foot i {
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: #4a4d61;
}

.login-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px clamp(28px, 5vw, 72px);
  background:
    radial-gradient(circle at 90% 10%, rgba(91, 91, 214, 0.055), transparent 35%),
    #f7f7fb;
}

.login-box {
  width: 100%;
  max-width: 390px;
}

.mobile-brand {
  display: none;
}

.login-head h2 {
  margin: 0;
  font-size: 30px;
  letter-spacing: -0.045em;
  font-weight: 800;
}

.login-head p {
  margin: 10px 0 28px;
  color: var(--ft-muted);
  font-size: 12.5px;
  line-height: 1.7;
}

.login-form .field {
  display: block;
  margin-bottom: 16px;
}

.login-form .field > span {
  display: block;
  margin-bottom: 7px;
  font-size: 11px;
  font-weight: 700;
  color: #4e5263;
}

.login-form :deep(.el-input__wrapper) {
  padding: 3px 13px;
  border-radius: 11px;
  background: #fff;
  box-shadow: 0 0 0 1px #e4e5ee inset;
}

.login-form :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--ft-primary) inset, 0 0 0 3px rgba(91, 91, 214, 0.1);
}

.login-form :deep(.el-input__inner) {
  height: 42px;
  font-size: 13px;
}

.login-submit {
  width: 100%;
  height: 46px;
  margin-top: 8px;
  border-radius: 11px;
  font-size: 13px;
  background: linear-gradient(100deg, #10111c, #24263c);
  border: 0;
  box-shadow: 0 14px 28px rgba(16, 17, 28, 0.18);
}

.login-submit:hover {
  background: linear-gradient(100deg, #1b1c2b, #30324c);
}

.submit-icon {
  margin-left: 5px;
}

.demo-fill {
  width: 100%;
  margin-top: 12px;
  border: 0;
  background: transparent;
  color: #8b8e9f;
  font-size: 10.5px;
  padding: 6px;
  cursor: pointer;
}

.demo-fill code {
  color: var(--ft-primary);
  background: #efefff;
  border-radius: 5px;
  padding: 2px 5px;
  margin-left: 3px;
}

.demo-fill:hover {
  color: var(--ft-primary);
}

.login-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 22px 0;
  color: #b3b5c2;
  font-size: 9px;
}

.login-divider::before,
.login-divider::after {
  content: "";
  flex: 1;
  height: 1px;
  background: #e6e7ef;
}

.demo-link {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  border-radius: 11px;
  border: 1px solid #e1e2ec;
  background: #fff;
  color: #4e5263;
  font-size: 11.5px;
  font-weight: 600;
  transition: border 0.15s, color 0.15s, box-shadow 0.15s;
}

.demo-link:hover {
  border-color: #c9caf0;
  color: var(--ft-primary);
  box-shadow: 0 8px 20px rgba(91, 91, 214, 0.07);
}

.external {
  margin-left: auto;
  color: #a3a6b5;
}

.login-foot {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  margin-top: 34px;
  color: #a6a8b6;
  font-size: 9.5px;
}

@media (max-width: 980px) {
  .login-page {
    grid-template-columns: 1fr;
  }

  .login-visual {
    display: none;
  }

  .login-panel {
    min-height: 100vh;
    padding: 32px 22px;
  }

  .mobile-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 44px;
    font-size: 15px;
    letter-spacing: -0.02em;
  }

  .mobile-brand .visual-mark {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    font-size: 15px;
  }

  .login-head h2 {
    font-size: 27px;
  }
}
</style>

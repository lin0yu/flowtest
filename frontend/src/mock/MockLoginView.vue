<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { mockLogin } from './store'

const router = useRouter()
const username = ref('admin')
const password = ref('admin123')
const loading = ref(false)

function submit() {
  loading.value = true
  setTimeout(() => {
    if (mockLogin(username.value.trim(), password.value)) {
      ElMessage.success('登录成功，欢迎回来，admin')
      router.push('/mock/dashboard')
    } else {
      ElMessage.error('用户名或密码错误')
    }
    loading.value = false
  }, 150)
}
</script>

<template>
  <div class="login-page">
    <div class="card">
      <div class="title">
        <span class="mark">R</span>
        <div>
          <b>Radiotech</b>
          <span>辐射认证管理平台</span>
        </div>
      </div>
      <h3>账号登录</h3>
      <p class="tip">测试环境演示账号：admin / admin123</p>
      <el-form label-position="top" @submit.prevent="submit">
        <el-form-item label="用户名">
          <el-input v-model="username" placeholder="请输入用户名" class="login-input" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="password" type="password" placeholder="请输入密码" class="login-input" show-password
            @keyup.enter="submit" />
        </el-form-item>
        <el-button type="primary" class="login-btn" :loading="loading" @click="submit">登 录</el-button>
      </el-form>
    </div>
  </div>
</template>

<style scoped>
.login-page { min-height: 100vh; display: grid; place-items: center; background: linear-gradient(135deg, #171b3a, #2b3168 60%, #4338ca); }
.card { width: 380px; background: #fff; border-radius: 18px; padding: 30px 32px 34px; box-shadow: 0 24px 60px rgba(15, 20, 50, .35); }
.title { display: flex; align-items: center; gap: 10px; margin-bottom: 22px; }
.title .mark { width: 34px; height: 34px; border-radius: 10px; background: linear-gradient(135deg, #6366f1, #4338ca); display: grid; place-items: center; color: #fff; font-weight: 700; }
.title b { display: block; font-size: 16px; color: #14172a; }
.title span { font-size: 11px; color: #8a90a6; }
h3 { margin: 0 0 4px; font-size: 17px; color: #14172a; }
.tip { margin: 0 0 18px; font-size: 12px; color: #8a90a6; }
.login-input { width: 100%; }
.login-btn { width: 100%; margin-top: 6px; }
</style>

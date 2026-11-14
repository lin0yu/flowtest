<script setup lang="ts">
import { computed } from 'vue'
import StatusTag from './StatusTag.vue'
import { actionLabel, formatDuration } from '@/utils/format'
import { artifactViewUrl } from '@/api/http'
import type { RunStep } from '@/types'

const props = defineProps<{
  runId?: number
  steps: RunStep[]
  dense?: boolean
}>()

function itemClass(status: string) {
  return status.toLowerCase()
}

function screenshotUrl(step: RunStep) {
  if (!props.runId || !step.screenshotArtifactId) return ''
  return artifactViewUrl(props.runId, step.screenshotArtifactId)
}

const hasShots = computed(() => props.steps.some((step) => step.screenshotArtifactId))
</script>

<template>
  <div class="step-timeline" :class="{ dense }">
    <div
      v-for="step in steps"
      :key="step.id || step.stepIndex"
      class="step-item"
      :class="itemClass(step.status)"
    >
      <div class="step-marker">{{ step.stepIndex }}</div>
      <div class="step-card">
        <div class="step-head">
          <div class="step-title">
            <span class="step-action">{{ actionLabel(step.action) }}</span>
            <span class="step-desc">{{ step.description || '未命名步骤' }}</span>
          </div>
          <StatusTag :status="step.status" :pulse="step.status === 'RUNNING'" />
        </div>

        <div v-if="step.selector || step.value" class="step-target">
          <code v-if="step.selector">{{ step.selector }}</code>
          <span v-if="step.value" class="step-value">{{ step.value }}</span>
        </div>

        <p
          v-if="step.message"
          class="step-message"
          :class="{
            ok: step.status === 'PASSED',
            bad: step.status === 'FAILED' || step.status === 'ERROR'
          }"
        >
          {{ step.message }}
        </p>

        <div v-if="step.expectedValue || step.actualValue" class="assert-grid">
          <div>
            <label>期望</label>
            <span>{{ step.expectedValue || '—' }}</span>
          </div>
          <div>
            <label>实际</label>
            <span>{{ step.actualValue || '—' }}</span>
          </div>
        </div>

        <div v-if="screenshotUrl(step)" class="step-shot">
          <el-image
            :src="screenshotUrl(step)"
            :preview-src-list="[screenshotUrl(step)]"
            :initial-index="0"
            fit="cover"
            preview-teleported
            hide-on-click-modal
          />
        </div>

        <div class="step-meta">
          <span v-if="step.durationMs !== undefined">{{ formatDuration(step.durationMs) }}</span>
          <span v-if="step.status === 'PENDING'">等待执行</span>
          <span v-if="hasShots && step.screenshotArtifactId">· 含截图</span>
        </div>
      </div>
    </div>

    <div v-if="!steps.length" class="step-empty">
      暂无步骤，执行后这里会实时展示每一步的状态、断言与截图。
    </div>
  </div>
</template>

<style scoped>
.dense .step-item {
  gap: 9px;
}

.dense .step-card {
  padding: 10px 12px;
}

.dense .step-marker {
  flex-basis: 24px;
  width: 24px;
  height: 24px;
  margin-top: 12px;
  border-radius: 8px;
}

.step-empty {
  padding: 34px 20px;
  text-align: center;
  border: 1px dashed var(--ft-line-strong);
  border-radius: 12px;
  color: var(--ft-muted-2);
  font-size: 11.5px;
  line-height: 1.7;
}
</style>

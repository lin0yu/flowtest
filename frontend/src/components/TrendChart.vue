<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import type { TrendPoint } from '@/types'

const props = defineProps<{ points: TrendPoint[] }>()
const chartEl = ref<HTMLDivElement>()
let chart: echarts.ECharts | null = null

function render() {
  if (!chart) return
  const points = props.points || []
  chart.setOption(
    {
      animationDuration: 600,
      grid: { left: 8, right: 12, top: 42, bottom: 6, containLabel: true },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#10111c',
        borderWidth: 0,
        textStyle: { color: '#fff', fontSize: 11 },
        axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(91,91,214,0.05)' } }
      },
      legend: {
        top: 0,
        right: 0,
        icon: 'circle',
        itemWidth: 7,
        itemHeight: 7,
        textStyle: { color: '#8a8d9e', fontSize: 10, fontWeight: 600 }
      },
      xAxis: {
        type: 'category',
        data: points.map((point) => point.date),
        axisLine: { lineStyle: { color: '#eceef4' } },
        axisTick: { show: false },
        axisLabel: { color: '#9a9dae', fontSize: 9.5, margin: 12 }
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: { lineStyle: { color: '#f1f2f7' } },
        axisLabel: { color: '#b0b3c1', fontSize: 9.5 }
      },
      series: [
        {
          name: '执行次数',
          type: 'bar',
          data: points.map((point) => point.total),
          barWidth: 14,
          itemStyle: {
            borderRadius: [5, 5, 2, 2],
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#8b8be2' },
              { offset: 1, color: '#e4e4f8' }
            ])
          }
        },
        {
          name: '通过',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          data: points.map((point) => point.passed),
          lineStyle: { width: 2.2, color: '#16a34a' },
          itemStyle: { color: '#16a34a' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(22,163,74,0.12)' },
              { offset: 1, color: 'rgba(22,163,74,0)' }
            ])
          }
        },
        {
          name: '失败',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          data: points.map((point) => point.failed),
          lineStyle: { width: 2, color: '#e5484d' },
          itemStyle: { color: '#e5484d' }
        }
      ]
    },
    true
  )
}

function resize() {
  chart?.resize()
}

onMounted(() => {
  if (chartEl.value) {
    chart = echarts.init(chartEl.value)
    render()
    window.addEventListener('resize', resize)
  }
})

watch(() => props.points, render, { deep: true })

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  chart?.dispose()
  chart = null
})
</script>

<template>
  <div ref="chartEl" class="trend-chart" />
</template>

<style scoped>
.trend-chart {
  width: 100%;
  height: 250px;
}
</style>

// HTML / Markdown 报告生成
import { ACTION_LABELS } from './compiler.mjs'

export const STATUS_LABELS = {
  PASSED: '通过', FAILED: '失败', ERROR: '异常', SKIPPED: '跳过', PENDING: '待执行'
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function cls(status) {
  return String(status || 'unknown').toLowerCase().replace(/[^a-z]/g, '')
}

function dur(ms) {
  if (ms === null || ms === undefined) return '—'
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

function fmtTime(v) {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('zh-CN', { hour12: false })
}

function shotSrc(step) {
  if (step.screenshotBase64) return `data:image/png;base64,${step.screenshotBase64}`
  if (step.screenshotPath) return step.screenshotPath
  return null
}

export function buildCaseHtml(report) {
  const steps = report.steps || []
  const total = steps.length
  const passed = steps.filter((s) => s.status === 'PASSED').length
  const status = report.status
  const percent = total ? Math.round((passed / total) * 100) : (status === 'PASSED' ? 100 : 0)

  const stepRows = steps.map((step) => {
    const src = shotSrc(step)
    const values = []
    if (step.selector) values.push(`<span class="param"><b>选择器</b> ${esc(step.selector)}</span>`)
    if (step.value) values.push(`<span class="param"><b>参数</b> ${esc(step.value)}</span>`)
    if (step.expectedValue !== null && step.expectedValue !== undefined) {
      values.push(`<span class="param"><b>期望</b> ${esc(step.expectedValue)}</span>`)
    }
    if (step.actualValue !== null && step.actualValue !== undefined) {
      values.push(`<span class="param ${step.status === 'FAILED' ? 'bad' : ''}"><b>实际</b> ${esc(step.actualValue)}</span>`)
    }
    return `
      <tr class="step ${cls(step.status)}">
        <td class="num">${step.index}</td>
        <td>
          <div class="step-title">${esc(step.description || ACTION_LABELS[step.action] || step.action)}</div>
          <div class="step-action">${esc(ACTION_LABELS[step.action] || step.action)} <span class="mono">${esc(step.action)}</span></div>
          ${values.length ? `<div class="params">${values.join('')}</div>` : ''}
          ${step.message ? `<div class="step-message">${esc(step.message)}</div>` : ''}
        </td>
        <td><span class="pill ${cls(step.status)}">${esc(STATUS_LABELS[step.status] || step.status)}</span></td>
        <td class="duration">${esc(dur(step.durationMs))}</td>
        <td class="shot-cell">${src ? `<a href="${esc(src)}" target="_blank"><img class="thumb" src="${esc(src)}" alt="步骤 ${step.index} 截图"></a>` : '<span class="muted">—</span>'}</td>
      </tr>`
  }).join('')

  const gallery = steps.filter((s) => shotSrc(s)).map((step) => {
    const src = shotSrc(step)
    return `<figure class="shot"><a href="${esc(src)}" target="_blank"><img src="${esc(src)}" loading="lazy" alt="步骤 ${step.index}"></a><figcaption>步骤 ${step.index} · ${esc(step.description || '')}</figcaption></figure>`
  }).join('')

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(`测试报告 · ${report.name}`)}</title>
<style>
:root{--bg:#f3f5fb;--panel:#fff;--ink:#14172a;--muted:#6d7288;--line:#e6e9f3;--primary:#4f46e5;--ok:#12805c;--ok-soft:#e5f7ef;--bad:#b42318;--bad-soft:#fdecea;--warn:#9a5b00;--warn-soft:#fff5dc}
*{box-sizing:border-box}
body{margin:0;color:var(--ink);background:radial-gradient(circle at 12% 0%,#e8e9ff 0,transparent 32rem),radial-gradient(circle at 100% 5%,#e7f7ff 0,transparent 34rem),var(--bg);font:14px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
.wrap{width:min(1180px,calc(100% - 40px));margin:32px auto 64px}
.hero{position:relative;overflow:hidden;border-radius:24px;padding:30px 34px;color:#fff;background:linear-gradient(125deg,#171b3a,#272c62 55%,#4338ca);box-shadow:0 16px 40px rgba(26,32,68,.08)}
.hero h1{margin:0 0 8px;font-size:30px}
.hero .meta{color:#c6c9e9;font-size:13px;display:flex;gap:16px;flex-wrap:wrap}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0}
.metric{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px 16px}
.metric .k{color:var(--muted);font-size:11px}.metric .v{font-size:22px;font-weight:700;margin-top:2px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px 22px;margin:16px 0}
.card h2{margin:0 0 14px;font-size:16px}
.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:12px}
table{width:100%;border-collapse:collapse;min-width:840px}
th,td{padding:11px 13px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}
th{background:#fafbff;color:var(--muted);font-size:11px;font-weight:600}
tr:last-child td{border-bottom:0}.step.failed,.step.error{background:#fffafa}
.num{width:40px;color:var(--muted)}.step-title{font-weight:600}
.step-action{color:var(--muted);font-size:11.5px;margin-top:2px}.mono{font-size:10.5px;background:#f1f3fa;border-radius:5px;padding:1px 4px}
.params{display:flex;flex-wrap:wrap;gap:4px 8px;margin-top:6px}
.param{font-size:11.5px;color:#4f5570;background:#f7f8fc;border:1px solid #eef0f7;border-radius:6px;padding:2px 7px}.param b{color:#9aa0b8;font-weight:500;margin-right:3px}
.param.bad{color:var(--bad);background:var(--bad-soft);border-color:#f5c7c2}
.step-message{margin-top:6px;font-size:12px;color:#555b74}
.duration{width:74px;color:var(--muted);white-space:nowrap}.shot-cell{width:160px}
.thumb{width:140px;height:80px;object-fit:cover;border-radius:7px;border:1px solid var(--line);display:block}
.muted{color:var(--muted)}
.pill{display:inline-flex;border-radius:999px;padding:2px 9px;font-size:11.5px;font-weight:600}
.pill.passed{background:var(--ok-soft);color:var(--ok)}.pill.failed,.pill.error{background:var(--bad-soft);color:var(--bad)}
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
.shot{margin:0;background:#fafbff;border:1px solid var(--line);border-radius:12px;padding:8px}
.shot img{width:100%;height:180px;object-fit:cover;object-position:top;border-radius:8px;display:block;background:#eef1fa}
.shot figcaption{color:var(--muted);font-size:11.5px;padding:7px 3px 2px}
.empty{color:var(--muted)}
footer{margin-top:24px;color:var(--muted);font-size:11.5px}
@media(max-width:800px){.grid{grid-template-columns:repeat(2,1fr)}}
</style>
</head>
<body>
<div class="wrap">
  <header class="hero">
    <h1>${esc(report.name)}</h1>
    <div class="meta"><span class="pill ${cls(status)}">${esc(STATUS_LABELS[status] || status)}</span><span>${passed}/${total} 步通过</span><span>耗时 ${esc(dur(report.durationMs))}</span><span>${esc(fmtTime(report.startedAt))}</span></div>
  </header>
  <section class="grid">
    <div class="metric"><div class="k">状态</div><div class="v"><span class="pill ${cls(status)}">${esc(STATUS_LABELS[status] || status)}</span></div></div>
    <div class="metric"><div class="k">通过率</div><div class="v">${percent}%</div></div>
    <div class="metric"><div class="k">步骤</div><div class="v">${passed}/${total}</div></div>
    <div class="metric"><div class="k">耗时</div><div class="v">${esc(dur(report.durationMs))}</div></div>
  </section>
  <section class="card"><h2>步骤明细</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>#</th><th>动作与结果</th><th>状态</th><th>耗时</th><th>截图</th></tr></thead>
      <tbody>${stepRows || '<tr><td colspan="5" class="muted">没有步骤。</td></tr>'}</tbody>
    </table></div>
  </section>
  <section class="card"><h2>截图时间线</h2>
    <div class="gallery">${gallery || '<p class="empty">本次执行没有截图。</p>'}</div>
  </section>
  <footer>由 FlowTest NL CLI 生成 · ${esc(fmtTime(new Date().toISOString()))}</footer>
</div>
</body>
</html>`
}

export function buildSummaryHtml(batch) {
  const rows = batch.results.map((r) => `
    <tr class="row-${cls(r.status)}">
      <td>${esc(r.name)}</td>
      <td><span class="pill ${cls(r.status)}">${esc(STATUS_LABELS[r.status] || r.status)}</span></td>
      <td>${esc(r.steps)}</td>
      <td>${esc(r.duration)}</td>
      <td>${r.report ? `<a href="${esc(r.report)}">report.html</a>` : '—'}</td>
      <td class="msg">${esc(r.error || '')}</td>
    </tr>`).join('')

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>批量执行汇总</title><style>
:root{--bg:#f3f5fb;--panel:#fff;--ink:#14172a;--muted:#6d7288;--line:#e6e9f3;--ok:#12805c;--ok-soft:#e5f7ef;--bad:#b42318;--bad-soft:#fdecea;--warn:#9a5b00;--warn-soft:#fff5dc}
*{box-sizing:border-box}body{margin:0;color:var(--ink);background:var(--bg);font:14px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
.wrap{width:min(1180px,calc(100% - 40px));margin:32px auto 64px}
header{border-radius:20px;padding:28px 32px;color:#fff;background:linear-gradient(125deg,#171b3a,#272c62 55%,#4338ca)}header h1{margin:0 0 6px;font-size:26px}header p{margin:0;color:#c6c9e9;font-size:13px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px 16px}.stat .k{color:var(--muted);font-size:11px}.stat .v{font-size:22px;font-weight:700;margin-top:2px}
.table-wrap{background:var(--panel);border:1px solid var(--line);border-radius:14px;overflow:auto}table{width:100%;border-collapse:collapse;min-width:760px}
th,td{padding:11px 13px;text-align:left;border-bottom:1px solid var(--line)}th{background:#fafbff;color:var(--muted);font-size:11px;font-weight:600}tr:last-child td{border-bottom:0}
.row-failed,.row-error{background:#fffafa}.pill{display:inline-flex;border-radius:999px;padding:2px 9px;font-size:11.5px;font-weight:600}
.pill.passed{background:var(--ok-soft);color:var(--ok)}.pill.failed,.pill.error{background:var(--bad-soft);color:var(--bad)}.msg{color:var(--muted);font-size:12px;max-width:360px}a{color:#4338ca}
@media(max-width:800px){.stats{grid-template-columns:repeat(2,1fr)}}
</style></head><body><div class="wrap">
<header><h1>批量执行汇总</h1><p>共 ${batch.stats.total} 条 · 通过 ${batch.stats.passed} · 失败 ${batch.stats.failed} · 异常 ${batch.stats.error} · ${esc(fmtTime(batch.generatedAt))}</p></header>
<section class="stats">
<div class="stat"><div class="k">通过率</div><div class="v">${esc(batch.stats.passRate)}</div></div>
<div class="stat"><div class="k">总数 / 通过</div><div class="v">${batch.stats.total} / ${batch.stats.passed}</div></div>
<div class="stat"><div class="k">失败 / 异常</div><div class="v">${batch.stats.failed} / ${batch.stats.error}</div></div>
<div class="stat"><div class="k">总耗时</div><div class="v">${esc(dur(batch.stats.totalDurationMs))}</div></div>
</section>
<div class="table-wrap"><table><thead><tr><th>用例</th><th>状态</th><th>步骤</th><th>耗时</th><th>报告</th><th>备注</th></tr></thead>
<tbody>${rows || '<tr><td colspan="6">没有结果。</td></tr>'}</tbody></table></div>
</div></body></html>`
}

export function buildSummaryMd(batch) {
  const lines = []
  lines.push('# 批量执行汇总', '')
  lines.push(`- 总数：${batch.stats.total} · 通过：${batch.stats.passed} · 失败：${batch.stats.failed} · 异常：${batch.stats.error}`)
  lines.push(`- 通过率：${batch.stats.passRate} · 总耗时：${dur(batch.stats.totalDurationMs)}`)
  lines.push(`- 生成时间：${fmtTime(batch.generatedAt)}`)
  lines.push('')
  lines.push('| 用例 | 状态 | 步骤 | 耗时 | 报告 |')
  lines.push('| --- | --- | --- | ---: | --- |')
  for (const r of batch.results) {
    lines.push(`| ${mdCell(r.name)} | ${mdCell(STATUS_LABELS[r.status] || r.status)} | ${mdCell(r.steps)} | ${mdCell(r.duration)} | ${r.report ? `[report.html](${r.report})` : '—'} |`)
  }
  lines.push('')
  return lines.join('\n')
}

function mdCell(value) {
  return String(value ?? '').replace(/\r?\n/g, '<br>').replace(/\|/g, '\\|').trim()
}

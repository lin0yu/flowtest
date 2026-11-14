package com.flowtest.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.flowtest.automation.Actions;
import com.flowtest.automation.SeleniumFlowRunner;
import com.flowtest.automation.StepDef;
import com.flowtest.common.BusinessException;
import com.flowtest.common.Dtos.*;
import com.flowtest.domain.*;
import com.flowtest.domain.DomainEnums.*;
import com.flowtest.repo.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class RunService {

    private static final DateTimeFormatter TIME_FORMAT =
            DateTimeFormatter.ofPattern("HH:mm:ss").withZone(ZoneId.systemDefault());

    private final TestRunRepository runRepository;
    private final RunStepRepository stepRepository;
    private final ArtifactRepository artifactRepository;
    private final ProjectRepository projectRepository;
    private final TestCaseRepository caseRepository;
    private final AttachmentRepository attachmentRepository;
    private final TestTaskRepository taskRepository;
    private final EnvironmentService environmentService;
    private final TestCaseService caseService;
    private final NlCompilerService compilerService;
    private final StepCodec stepCodec;
    private final StorageService storageService;
    private final RunEventHub eventHub;
    private final WebhookService webhookService;
    private final ThreadPoolTaskExecutor runExecutor;
    private final ObjectMapper objectMapper;
    private final int defaultTimeoutSeconds;

    public RunService(TestRunRepository runRepository,
                      RunStepRepository stepRepository,
                      ArtifactRepository artifactRepository,
                      ProjectRepository projectRepository,
                      TestCaseRepository caseRepository,
                      AttachmentRepository attachmentRepository,
                      TestTaskRepository taskRepository,
                      EnvironmentService environmentService,
                      TestCaseService caseService,
                      NlCompilerService compilerService,
                      StepCodec stepCodec,
                      StorageService storageService,
                      RunEventHub eventHub,
                      WebhookService webhookService,
                      @Qualifier("runExecutor") ThreadPoolTaskExecutor runExecutor,
                      ObjectMapper objectMapper,
                      @Value("${flowtest.engine.default-timeout-seconds:20}") int defaultTimeoutSeconds) {
        this.runRepository = runRepository;
        this.stepRepository = stepRepository;
        this.artifactRepository = artifactRepository;
        this.projectRepository = projectRepository;
        this.caseRepository = caseRepository;
        this.attachmentRepository = attachmentRepository;
        this.taskRepository = taskRepository;
        this.environmentService = environmentService;
        this.caseService = caseService;
        this.compilerService = compilerService;
        this.stepCodec = stepCodec;
        this.storageService = storageService;
        this.eventHub = eventHub;
        this.webhookService = webhookService;
        this.runExecutor = runExecutor;
        this.objectMapper = objectMapper;
        this.defaultTimeoutSeconds = defaultTimeoutSeconds;
    }

    // ---------------- queries ----------------

    public PageDto<RunDto> search(Long projectId, String status, String triggerType, int page, int size) {
        int p = Math.max(1, page);
        int s = Math.min(Math.max(1, size), 100);
        RunStatus runStatus = parseEnum(RunStatus.class, status);
        TriggerType trigger = parseEnum(TriggerType.class, triggerType);
        Page<TestRun> result = runRepository.search(projectId, runStatus, trigger, PageRequest.of(p - 1, s));
        return new PageDto<>(result.getContent().stream().map(this::toDto).toList(),
                result.getTotalElements(), p, s);
    }

    public RunDetailDto detail(Long id) {
        TestRun run = find(id);
        List<RunStepDto> steps = stepRepository.findByRunIdOrderByStepIndexAsc(id)
                .stream().map(this::toStepDto).toList();
        List<ArtifactDto> artifacts = artifactRepository.findByRunIdOrderByIdAsc(id)
                .stream().map(this::toArtifactDto).toList();
        return new RunDetailDto(toDto(run), steps, artifacts,
                run.getConsoleLog() == null ? "" : run.getConsoleLog());
    }

    public TestRun find(Long id) {
        return runRepository.findById(id)
                .orElseThrow(() -> BusinessException.notFound("执行记录不存在"));
    }

    public List<Artifact> artifactEntities(Long runId) {
        find(runId);
        return artifactRepository.findByRunIdOrderByIdAsc(runId);
    }

    public Artifact findArtifact(Long runId, Long artifactId) {
        Artifact artifact = artifactRepository.findById(artifactId)
                .orElseThrow(() -> BusinessException.notFound("产物不存在"));
        if (!artifact.getRunId().equals(runId)) {
            throw BusinessException.notFound("产物不存在");
        }
        return artifact;
    }

    public java.nio.file.Path zipArtifacts(Long runId) {
        return storageService.zipArtifacts(runId, artifactEntities(runId));
    }

    // ---------------- creation ----------------

    public RunDto triggerCase(Long caseId, Long environmentId, Boolean headless,
                              String requestedBy, TriggerType trigger) {
        TestRun run = createCaseRun(caseId, environmentId, headless, requestedBy, trigger, null, null);
        submit(run);
        return toDto(run);
    }

    public TestRun createCaseRun(Long caseId, Long environmentId, Boolean headless,
                                 String requestedBy, TriggerType trigger, TestTask task, String batchId) {
        TestCase testCase = caseService.find(caseId);
        TestEnvironment env = environmentService.pick(testCase.getProjectId(),
                environmentId != null ? environmentId : (task == null ? null : task.getEnvironmentId()));
        List<StepDef> steps = caseService.stepsOf(testCase);
        if (steps.isEmpty()) {
            throw new BusinessException("用例「" + testCase.getName() + "」没有可执行步骤");
        }
        boolean headlessValue = headless != null ? headless : testCase.isHeadless();
        int timeout = task != null && task.getTimeoutSeconds() > 0
                ? task.getTimeoutSeconds() : testCase.getTimeoutSeconds();
        int maxAttempts = task != null ? Math.max(1, task.getRetryCount() + 1) : 1;

        TestRun run = new TestRun();
        run.setBatchId(batchId);
        run.setTaskId(task == null ? null : task.getId());
        run.setTaskName(task == null ? null : task.getName());
        run.setProjectId(testCase.getProjectId());
        run.setCaseId(testCase.getId());
        run.setCaseName(testCase.getName());
        run.setEnvironmentId(env.getId());
        run.setEnvironmentName(env.getName());
        run.setEnvironmentBaseUrl(env.getBaseUrl());
        run.setEnvironmentVariablesJson(env.getVariablesJson());
        run.setNlInput(testCase.getNlInput());
        run.setStepsJson(stepCodec.writeSteps(steps));
        run.setTriggerType(trigger);
        run.setStatus(RunStatus.QUEUED);
        run.setAttempt(1);
        run.setMaxAttempts(maxAttempts);
        run.setTotalSteps(steps.size());
        run.setRequestedBy(requestedBy);
        run.setHeadless(headlessValue);
        run.setScreenshotEachStep(testCase.isScreenshotEachStep());
        run.setTimeoutSeconds(timeout);
        run.setWebhookUrl(task == null ? null : task.getWebhookUrl());
        return runRepository.save(run);
    }

    public RunDto quickRun(QuickRunRequest request, String requestedBy, TriggerType trigger) {
        if (request.projectId() == null) {
            throw new BusinessException("请选择项目");
        }
        Project project = projectRepository.findById(request.projectId())
                .orElseThrow(() -> BusinessException.notFound("项目不存在"));
        TestEnvironment env = environmentService.pick(request.projectId(), request.environmentId());
        List<StepDef> steps;
        String title;
        if (request.steps() != null && !request.steps().isEmpty()) {
            steps = normalizeSteps(request.steps());
            title = request.title() == null || request.title().isBlank()
                    ? "自然语言快速执行" : request.title().trim();
        } else {
            CompileResult compiled = compilerService.compile(request.nl(), request.title(), null);
            steps = compiled.steps();
            title = compiled.title();
        }
        if (steps.isEmpty()) {
            throw new BusinessException("没有可执行步骤");
        }
        TestRun run = new TestRun();
        run.setProjectId(project.getId());
        run.setCaseName(title.length() > 200 ? title.substring(0, 200) : title);
        run.setEnvironmentId(env.getId());
        run.setEnvironmentName(env.getName());
        run.setEnvironmentBaseUrl(env.getBaseUrl());
        run.setEnvironmentVariablesJson(env.getVariablesJson());
        run.setNlInput(request.nl());
        run.setStepsJson(stepCodec.writeSteps(steps));
        run.setTriggerType(trigger);
        run.setStatus(RunStatus.QUEUED);
        run.setAttempt(1);
        run.setMaxAttempts(1);
        run.setTotalSteps(steps.size());
        run.setRequestedBy(requestedBy);
        run.setHeadless(request.headless() == null || request.headless());
        run.setScreenshotEachStep(request.screenshotEachStep() == null || request.screenshotEachStep());
        run.setTimeoutSeconds(defaultTimeoutSeconds);
        TestRun saved = runRepository.save(run);
        submit(saved);
        return toDto(saved);
    }

    public RunDto createAutomationRun(AutomationRunRequest request, String requestedBy) {
        if (request.caseId() != null) {
            TestCase testCase = caseService.find(request.caseId());
            TestRun run = createCaseRun(testCase.getId(), request.environmentId(), request.headless(),
                    requestedBy, TriggerType.API, null, null);
            submit(run);
            return toDto(run);
        }
        QuickRunRequest quick = new QuickRunRequest(request.projectId(), request.environmentId(),
                request.nl() != null ? request.nl() : request.title(), request.title(),
                request.steps(), request.headless(), true);
        return quickRun(quick, requestedBy, TriggerType.API);
    }

    public void submit(TestRun run) {
        try {
            runExecutor.execute(() -> executeRun(run.getId()));
        } catch (TaskRejectedException e) {
            run.setStatus(RunStatus.ERROR);
            run.setErrorMessage("执行队列已满，请稍后重试");
            run.setFinishedAt(Instant.now());
            runRepository.save(run);
            log.warn("Run {} rejected by executor", run.getId());
        }
    }

    // ---------------- execution ----------------

    public void executeRun(Long runId) {
        TestRun run = runRepository.findById(runId).orElse(null);
        if (run == null || run.getFinishedAt() != null || run.getStatus() == RunStatus.CANCELLED) {
            return;
        }
        run.setStatus(RunStatus.RUNNING);
        run.setStartedAt(Instant.now());
        run.setErrorMessage(null);
        runRepository.save(run);

        StringBuilder console = new StringBuilder();
        List<RunStep> rows = new ArrayList<>();
        SeleniumFlowRunner runner = null;
        String fatal = null;
        long started = System.currentTimeMillis();
        appendLog(console, "开始执行：" + run.getCaseName());
        publishStatus(run);
        publishLog(runId, "[run] 开始执行 " + run.getCaseName());

        try {
            List<StepDef> steps = stepCodec.readSteps(run.getStepsJson());
            if (steps.isEmpty()) {
                throw new IllegalStateException("执行快照为空，无法运行");
            }
            for (StepDef step : steps) {
                RunStep row = new RunStep();
                row.setRunId(runId);
                row.setStepIndex(step.index());
                row.setAction(step.action());
                row.setSelector(step.selector());
                row.setStepValue(step.value());
                row.setDescription(step.description());
                row.setStatus(StepStatus.PENDING);
                rows.add(stepRepository.save(row));
            }
            run.setTotalSteps(rows.size());
            runRepository.save(run);

            Map<String, String> variables = stepCodec.readVariables(run.getEnvironmentVariablesJson());
            Map<String, Path> uploads = buildUploads(run.getCaseId());
            appendLog(console, "启动 Chrome（headless=" + run.isHeadless() + "）…");
            publishLog(runId, "[engine] 启动 Chrome…");
            runner = new SeleniumFlowRunner(run.isHeadless(), run.getTimeoutSeconds(),
                    run.getEnvironmentBaseUrl(), variables, uploads);
            appendLog(console, "浏览器就绪：" + runner.browserInfo());
            publishLog(runId, "[engine] " + runner.browserInfo() + " 已就绪");

            for (int i = 0; i < rows.size(); i++) {
                if (cancelRequested(runId)) {
                    appendLog(console, "收到取消请求，停止后续步骤");
                    break;
                }
                RunStep row = rows.get(i);
                StepDef step = steps.get(i);
                row.setStatus(StepStatus.RUNNING);
                row.setStartedAt(Instant.now());
                row = stepRepository.save(row);
                rows.set(i, row);
                publishStep(row);
                appendLog(console, "▶ 步骤 " + step.index() + "  " + step.description());
                publishLog(runId, "[step " + step.index() + "] " + step.description());

                SeleniumFlowRunner.StepOutcome outcome;
                try {
                    outcome = runner.execute(step, run.isScreenshotEachStep());
                } catch (Exception e) {
                    outcome = new SeleniumFlowRunner.StepOutcome("ERROR",
                            "执行异常：" + rootMessage(e), null, null, null, 0);
                }

                row.setStatus(StepStatus.valueOf(outcome.status()));
                row.setMessage(outcome.message());
                row.setExpectedValue(outcome.expectedValue());
                row.setActualValue(outcome.actualValue());
                row.setFinishedAt(Instant.now());
                row.setDurationMs(outcome.durationMs());
                if (outcome.screenshot() != null && outcome.screenshot().length > 0) {
                    attachScreenshot(runId, row, outcome.screenshot(), console);
                }
                row = stepRepository.save(row);
                rows.set(i, row);
                publishStep(row);

                appendLog(console, "  " + statusIcon(outcome.status()) + " " + outcome.message());
                publishLog(runId, "[" + outcome.status() + "] " + outcome.message());

                if (!"PASSED".equals(outcome.status())) {
                    break;
                }
            }
        } catch (Exception e) {
            fatal = "执行异常：" + rootMessage(e)
                    + (looksLikeDriverError(e) ? "。请确认本机已安装 Google Chrome，且首次运行时可访问网络下载 ChromeDriver。" : "");
            appendLog(console, "✖ " + fatal);
            publishLog(runId, "[error] " + fatal);
        } finally {
            if (runner != null) {
                runner.close();
            }
        }

        if (cancelRequested(runId)) {
            run.setCancelRequested(true);
        }
        boolean anyError = rows.stream().anyMatch(r -> r.getStatus() == StepStatus.ERROR);
        for (RunStep row : rows) {
            if (row.getStatus() == StepStatus.RUNNING) {
                row.setStatus(StepStatus.ERROR);
                row.setMessage(fatal == null ? "执行中断" : fatal);
                row.setFinishedAt(Instant.now());
                row = stepRepository.save(row);
                publishStep(row);
                anyError = true;
            }
            if (row.getStatus() == StepStatus.PENDING) {
                row.setStatus(StepStatus.SKIPPED);
                row.setMessage("未执行（前序步骤失败或任务被取消）");
                row.setFinishedAt(Instant.now());
                row = stepRepository.save(row);
                publishStep(row);
            }
        }

        run.setTotalSteps(rows.size());
        run.setPassedSteps((int) rows.stream().filter(r -> r.getStatus() == StepStatus.PASSED).count());
        run.setFailedSteps((int) rows.stream().filter(r -> r.getStatus() == StepStatus.FAILED).count());
        run.setSkippedSteps((int) rows.stream().filter(r -> r.getStatus() == StepStatus.SKIPPED).count());
        if (fatal != null) {
            run.setErrorMessage(fatal);
        }
        if (run.isCancelRequested() || cancelRequested(runId)) {
            run.setStatus(RunStatus.CANCELLED);
            run.setCancelRequested(true);
        } else if (fatal != null || anyError) {
            run.setStatus(RunStatus.ERROR);
            if (run.getErrorMessage() == null) {
                run.setErrorMessage("执行过程中出现技术错误");
            }
        } else if (run.getFailedSteps() > 0) {
            run.setStatus(RunStatus.FAILED);
        } else if (rows.isEmpty()) {
            run.setStatus(RunStatus.ERROR);
            run.setErrorMessage("没有可执行步骤");
        } else {
            run.setStatus(RunStatus.PASSED);
        }
        run.setFinishedAt(Instant.now());
        run.setDurationMs(System.currentTimeMillis() - started);
        appendLog(console, "执行结束：" + run.getStatus().name()
                + " · 通过 " + run.getPassedSteps() + " / 失败 " + run.getFailedSteps()
                + " / 跳过 " + run.getSkippedSteps() + " · " + run.getDurationMs() + "ms");
        run.setConsoleLog(limit(console.toString(), 300_000));
        runRepository.save(run);

        writeReport(run, rows, console.toString());
        publishStatus(run);
        publishLog(runId, "[done] " + run.getStatus().name());
        try {
            eventHub.publish(runId, "done", detail(runId));
        } catch (Exception ignored) {
        }

        boolean retried = maybeRetry(run, console);
        if (!retried) {
            webhookService.sendRunFinished(run);
        }
        eventHub.complete(runId);
    }

    private void attachScreenshot(Long runId, RunStep row, byte[] bytes, StringBuilder console) {
        try {
            String fileName = "step-%02d.png".formatted(row.getStepIndex());
            String path = storageService.storeArtifactBytes(runId, fileName, bytes);
            Artifact artifact = new Artifact();
            artifact.setRunId(runId);
            artifact.setStepIndex(row.getStepIndex());
            artifact.setType(ArtifactType.SCREENSHOT);
            artifact.setFileName(fileName);
            artifact.setContentType("image/png");
            artifact.setPath(path);
            artifact.setSize(bytes.length);
            artifact = artifactRepository.save(artifact);
            row.setScreenshotArtifactId(artifact.getId());
        } catch (Exception e) {
            appendLog(console, "  ! 截图保存失败：" + e.getMessage());
        }
    }

    private void writeReport(TestRun run, List<RunStep> rows, String consoleLog) {
        try {
            Map<String, Object> report = new LinkedHashMap<>();
            report.put("run", toDto(run));
            report.put("steps", rows.stream().map(this::toStepDto).toList());
            report.put("artifacts", artifactRepository.findByRunIdOrderByIdAsc(run.getId())
                    .stream().map(this::toArtifactDto).toList());
            String json = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(report);
            saveArtifact(run.getId(), null, ArtifactType.REPORT, "report.json",
                    "application/json", json);
            saveArtifact(run.getId(), null, ArtifactType.LOG, "console.log",
                    "text/plain", consoleLog);
        } catch (Exception e) {
            log.warn("Write report failed for run {}: {}", run.getId(), e.getMessage());
        }
    }

    private void saveArtifact(Long runId, Integer stepIndex, ArtifactType type, String fileName,
                              String contentType, String content) {
        String path = storageService.storeArtifactText(runId, fileName, content);
        Artifact artifact = new Artifact();
        artifact.setRunId(runId);
        artifact.setStepIndex(stepIndex);
        artifact.setType(type);
        artifact.setFileName(fileName);
        artifact.setContentType(contentType);
        artifact.setPath(path);
        artifact.setSize(content.getBytes(java.nio.charset.StandardCharsets.UTF_8).length);
        artifactRepository.save(artifact);
    }

    private boolean maybeRetry(TestRun run, StringBuilder console) {
        if (run.getStatus() != RunStatus.FAILED || run.getAttempt() >= run.getMaxAttempts()
                || run.getTaskId() == null) {
            return false;
        }
        try {
            TestRun retry = copySnapshot(run);
            retry.setAttempt(run.getAttempt() + 1);
            retry.setMaxAttempts(run.getMaxAttempts());
            retry.setStatus(RunStatus.QUEUED);
            retry.setTriggerType(TriggerType.RETRY);
            retry.setRequestedBy("retry");
            retry.setStartedAt(null);
            retry.setFinishedAt(null);
            retry.setDurationMs(null);
            retry.setTotalSteps(run.getTotalSteps());
            retry.setPassedSteps(0);
            retry.setFailedSteps(0);
            retry.setSkippedSteps(0);
            retry.setErrorMessage(null);
            retry.setConsoleLog(null);
            retry = runRepository.save(retry);
            appendLog(console, "↻ 第 " + retry.getAttempt() + " 次尝试已排队（run #" + retry.getId() + "）");
            run.setConsoleLog(limit(console.toString(), 300_000));
            runRepository.save(run);
            submit(retry);
            return true;
        } catch (Exception e) {
            appendLog(console, "重试排队失败：" + e.getMessage());
            return false;
        }
    }

    private TestRun copySnapshot(TestRun source) {
        TestRun run = new TestRun();
        run.setBatchId(source.getBatchId());
        run.setTaskId(source.getTaskId());
        run.setTaskName(source.getTaskName());
        run.setProjectId(source.getProjectId());
        run.setCaseId(source.getCaseId());
        run.setCaseName(source.getCaseName());
        run.setEnvironmentId(source.getEnvironmentId());
        run.setEnvironmentName(source.getEnvironmentName());
        run.setEnvironmentBaseUrl(source.getEnvironmentBaseUrl());
        run.setEnvironmentVariablesJson(source.getEnvironmentVariablesJson());
        run.setNlInput(source.getNlInput());
        run.setStepsJson(source.getStepsJson());
        run.setTriggerType(source.getTriggerType());
        run.setHeadless(source.isHeadless());
        run.setScreenshotEachStep(source.isScreenshotEachStep());
        run.setTimeoutSeconds(source.getTimeoutSeconds());
        run.setWebhookUrl(source.getWebhookUrl());
        run.setMaxAttempts(source.getMaxAttempts());
        run.setStatus(RunStatus.QUEUED);
        return run;
    }

    public RunDto rerun(Long id, String requestedBy) {
        TestRun source = find(id);
        if (source.getStatus() == RunStatus.RUNNING || source.getStatus() == RunStatus.QUEUED) {
            throw new BusinessException("执行尚未结束，不能重跑");
        }
        TestRun run = copySnapshot(source);
        run.setStatus(RunStatus.QUEUED);
        run.setTriggerType(TriggerType.MANUAL);
        run.setAttempt(1);
        run.setMaxAttempts(1);
        run.setRequestedBy(requestedBy);
        run.setTotalSteps(source.getTotalSteps());
        run = runRepository.save(run);
        submit(run);
        return toDto(run);
    }

    public RunDto cancel(Long id) {
        TestRun run = find(id);
        if (run.getStatus() == RunStatus.PASSED || run.getStatus() == RunStatus.FAILED
                || run.getStatus() == RunStatus.ERROR || run.getStatus() == RunStatus.CANCELLED) {
            throw new BusinessException("该执行已经结束");
        }
        if (run.getStatus() == RunStatus.QUEUED) {
            run.setStatus(RunStatus.CANCELLED);
            run.setCancelRequested(true);
            run.setFinishedAt(Instant.now());
            run.setDurationMs(0L);
            run = runRepository.save(run);
            publishStatus(run);
            eventHub.complete(id);
        } else {
            run.setCancelRequested(true);
            run = runRepository.save(run);
            publishLog(id, "[cancel] 收到取消请求，将在当前步骤结束后停止");
        }
        return toDto(run);
    }

    public RunDetailDto awaitCompletion(Long runId, int maxSeconds) {
        long deadline = System.currentTimeMillis() + Math.min(Math.max(maxSeconds, 1), 180) * 1000L;
        while (System.currentTimeMillis() < deadline) {
            TestRun run = find(runId);
            if (run.getStatus() == RunStatus.PASSED || run.getStatus() == RunStatus.FAILED
                    || run.getStatus() == RunStatus.ERROR || run.getStatus() == RunStatus.CANCELLED) {
                return detail(runId);
            }
            try {
                Thread.sleep(500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        return detail(runId);
    }

    // ---------------- mapping ----------------

    public RunDto toDto(TestRun run) {
        String projectName = projectRepository.findById(run.getProjectId())
                .map(Project::getName).orElse("已删除项目");
        return new RunDto(run.getId(), run.getBatchId(), run.getTaskId(), run.getTaskName(),
                run.getProjectId(), projectName, run.getCaseId(), run.getCaseName(),
                run.getEnvironmentId(), run.getEnvironmentName(),
                run.getTriggerType() == null ? null : run.getTriggerType().name(),
                run.getStatus() == null ? null : run.getStatus().name(),
                run.getAttempt(), run.getMaxAttempts(), run.getTotalSteps(),
                run.getPassedSteps(), run.getFailedSteps(), run.getSkippedSteps(),
                run.getDurationMs(), run.getStartedAt(), run.getFinishedAt(),
                run.getCreatedAt(), run.getRequestedBy(), run.getErrorMessage(), run.isHeadless());
    }

    public RunStepDto toStepDto(RunStep step) {
        return new RunStepDto(step.getId(), step.getStepIndex(), step.getAction(),
                step.getSelector(), step.getStepValue(), step.getDescription(),
                step.getStatus().name(), step.getMessage(), step.getExpectedValue(),
                step.getActualValue(), step.getStartedAt(), step.getFinishedAt(),
                step.getDurationMs(), step.getScreenshotArtifactId());
    }

    public ArtifactDto toArtifactDto(Artifact artifact) {
        return new ArtifactDto(artifact.getId(), artifact.getRunId(), artifact.getStepIndex(),
                artifact.getType().name(), artifact.getFileName(), artifact.getContentType(),
                artifact.getSize(), artifact.getCreatedAt());
    }

    // ---------------- helpers ----------------

    private List<StepDef> normalizeSteps(List<StepDef> steps) {
        List<StepDef> result = new ArrayList<>();
        for (int i = 0; i < steps.size(); i++) {
            StepDef step = steps.get(i);
            String action = step.action();
            if (!Actions.ALL.contains(action)) {
                throw new BusinessException("第 " + (i + 1) + " 个步骤动作不支持：" + action);
            }
            if (Actions.needsSelector(action) && blank(step.selector())) {
                throw new BusinessException("第 " + (i + 1) + " 个步骤缺少元素选择器");
            }
            if (Actions.needsValue(action) && blank(step.value())) {
                throw new BusinessException("第 " + (i + 1) + " 个步骤缺少参数值");
            }
            result.add(new StepDef(i + 1, action, step.selector(), step.value(), step.description()));
        }
        return result;
    }

    private Map<String, Path> buildUploads(Long caseId) {
        if (caseId == null) {
            return Map.of();
        }
        Map<String, Path> files = new LinkedHashMap<>();
        for (Attachment attachment : attachmentRepository.findByCaseIdOrderByCreatedAtDesc(caseId)) {
            try {
                files.put(attachment.getFileName(), storageService.resolve(attachment.getPath()).toAbsolutePath());
            } catch (Exception e) {
                log.warn("Attachment {} missing: {}", attachment.getFileName(), e.getMessage());
            }
        }
        return files;
    }

    private boolean cancelRequested(Long runId) {
        return runRepository.findById(runId).map(TestRun::isCancelRequested).orElse(false);
    }

    private void publishStatus(TestRun run) {
        try {
            eventHub.publish(run.getId(), "status", toDto(run));
        } catch (Exception e) {
            log.debug("SSE status failed: {}", e.getMessage());
        }
    }

    private void publishStep(RunStep step) {
        try {
            eventHub.publish(step.getRunId(), "step", toStepDto(step));
        } catch (Exception e) {
            log.debug("SSE step failed: {}", e.getMessage());
        }
    }

    private void publishLog(Long runId, String message) {
        try {
            eventHub.publish(runId, "log", Map.of(
                    "time", TIME_FORMAT.format(Instant.now()),
                    "message", message));
        } catch (Exception e) {
            log.debug("SSE log failed: {}", e.getMessage());
        }
    }

    private void appendLog(StringBuilder console, String message) {
        console.append('[').append(TIME_FORMAT.format(Instant.now())).append("] ")
                .append(message).append('\n');
    }

    private String statusIcon(String status) {
        return switch (status) {
            case "PASSED" -> "✓";
            case "FAILED" -> "✖ 断言失败";
            default -> "⚠ 执行错误";
        };
    }

    private String rootMessage(Throwable e) {
        Throwable current = e;
        while (current.getCause() != null && current.getCause() != current) {
            current = current.getCause();
        }
        String message = current.getMessage();
        if (message == null || message.isBlank()) {
            message = e.getClass().getSimpleName();
        }
        message = message.replaceAll("\\s+", " ").trim();
        return message.length() > 500 ? message.substring(0, 500) + "…" : message;
    }

    private boolean looksLikeDriverError(Throwable e) {
        String msg = rootMessage(e).toLowerCase(Locale.ROOT);
        return msg.contains("driver") || msg.contains("chrome") || msg.contains("binary")
                || msg.contains("session") || msg.contains("devtools");
    }

    private String limit(String text, int max) {
        return text.length() <= max ? text : text.substring(0, max) + "\n…（日志已截断）";
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private <E extends Enum<E>> E parseEnum(Class<E> type, String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Enum.valueOf(type, value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}

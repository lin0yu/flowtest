package com.flowtest.service;

import com.flowtest.common.BusinessException;
import com.flowtest.common.Dtos.*;
import com.flowtest.domain.DomainEnums.RunStatus;
import com.flowtest.domain.DomainEnums.TriggerType;
import com.flowtest.domain.Project;
import com.flowtest.domain.TestCase;
import com.flowtest.domain.TestEnvironment;
import com.flowtest.domain.TestRun;
import com.flowtest.domain.TestTask;
import com.flowtest.repo.EnvironmentRepository;
import com.flowtest.repo.ProjectRepository;
import com.flowtest.repo.TestCaseRepository;
import com.flowtest.repo.TestRunRepository;
import com.flowtest.repo.TestTaskRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class TaskService {

    private final TestTaskRepository taskRepository;
    private final ProjectRepository projectRepository;
    private final EnvironmentRepository environmentRepository;
    private final TestCaseRepository caseRepository;
    private final TestRunRepository runRepository;
    private final RunService runService;

    public List<TaskDto> list() {
        return taskRepository.findAllByOrderByCreatedAtDesc().stream().map(this::toDto).toList();
    }

    @Transactional
    public TaskDto create(TaskRequest request) {
        TestTask task = new TestTask();
        apply(task, request);
        task = taskRepository.save(task);
        return toDto(task);
    }

    @Transactional
    public TaskDto update(Long id, TaskRequest request) {
        TestTask task = find(id);
        apply(task, request);
        task = taskRepository.save(task);
        return toDto(task);
    }

    @Transactional
    public void delete(Long id) {
        taskRepository.delete(find(id));
    }

    public TaskTriggerDto trigger(Long id, String requestedBy) {
        TestTask task = find(id);
        TaskTriggerDto dto = triggerInternal(task, requestedBy, TriggerType.MANUAL);
        task.setLastRunStatus("TRIGGERED");
        taskRepository.save(task);
        return dto;
    }

    @Scheduled(fixedDelayString = "${flowtest.scheduler.scan-ms:15000}", initialDelay = 12000)
    public void scanScheduled() {
        for (TestTask task : taskRepository.findByEnabledTrue()) {
            if (task.getCronExpression() == null || task.getCronExpression().isBlank()) {
                continue;
            }
            try {
                if (task.getNextRunAt() == null) {
                    task.setNextRunAt(nextRun(task.getCronExpression()));
                    taskRepository.save(task);
                }
                if (task.getNextRunAt() != null && !task.getNextRunAt().isAfter(Instant.now())) {
                    log.info("Scheduled task triggered: {} (#{})", task.getName(), task.getId());
                    triggerInternal(task, "scheduler", TriggerType.SCHEDULE);
                    task.setLastRunStatus("TRIGGERED");
                    task.setLastRunAt(Instant.now());
                    task.setNextRunAt(nextRun(task.getCronExpression()));
                    taskRepository.save(task);
                }
            } catch (Exception e) {
                log.warn("Scheduled task {} failed: {}", task.getId(), e.getMessage());
                task.setLastRunStatus("ERROR");
                task.setNextRunAt(nextRun(task.getCronExpression()));
                taskRepository.save(task);
            }
        }
    }

    public TestTask find(Long id) {
        return taskRepository.findById(id)
                .orElseThrow(() -> BusinessException.notFound("任务不存在"));
    }

    private TaskTriggerDto triggerInternal(TestTask task, String requestedBy, TriggerType trigger) {
        List<Long> caseIds = parseCaseIds(task.getCaseIds());
        if (caseIds.isEmpty()) {
            throw new BusinessException("任务没有配置用例");
        }
        Project project = projectRepository.findById(task.getProjectId())
                .orElseThrow(() -> BusinessException.notFound("任务所属项目不存在"));
        if (task.getEnvironmentId() != null) {
            TestEnvironment env = environmentRepository.findById(task.getEnvironmentId())
                    .orElseThrow(() -> BusinessException.notFound("任务环境不存在"));
            if (!env.getProjectId().equals(project.getId())) {
                throw new BusinessException("任务环境不属于当前项目");
            }
        }
        String batchId = UUID.randomUUID().toString();
        List<Long> runIds = new ArrayList<>();
        for (Long caseId : caseIds) {
            TestRun run = runService.createCaseRun(caseId, task.getEnvironmentId(), null,
                    requestedBy, trigger, task, batchId);
            runService.submit(run);
            runIds.add(run.getId());
        }
        task.setLastRunAt(Instant.now());
        task.setLastRunStatus("TRIGGERED");
        taskRepository.save(task);
        return new TaskTriggerDto(batchId, runIds.size(), runIds);
    }

    private void apply(TestTask task, TaskRequest request) {
        Project project = projectRepository.findById(request.projectId())
                .orElseThrow(() -> BusinessException.notFound("项目不存在"));
        task.setProjectId(project.getId());
        task.setEnvironmentId(request.environmentId());
        task.setName(request.name().trim());
        task.setDescription(request.description());
        task.setRetryCount(Math.min(Math.max(Objects.requireNonNullElse(request.retryCount(), 0), 0), 5));
        task.setTimeoutSeconds(Math.min(Math.max(Objects.requireNonNullElse(request.timeoutSeconds(), 20), 5), 300));
        task.setEnabled(request.enabled() == null || request.enabled());
        task.setWebhookUrl(blank(request.webhookUrl()) ? null : request.webhookUrl().trim());
        if (task.getWebhookUrl() != null
                && !task.getWebhookUrl().startsWith("http://") && !task.getWebhookUrl().startsWith("https://")) {
            throw new BusinessException("Webhook 地址必须以 http:// 或 https:// 开头");
        }
        List<Long> caseIds = request.caseIds() == null ? List.of() : request.caseIds().stream().distinct().toList();
        if (caseIds.isEmpty()) {
            throw new BusinessException("请选择至少一个用例");
        }
        List<TestCase> cases = caseRepository.findByIdIn(caseIds);
        if (cases.size() != caseIds.size()) {
            throw new BusinessException("部分用例不存在");
        }
        for (TestCase testCase : cases) {
            if (!testCase.getProjectId().equals(project.getId())) {
                throw new BusinessException("用例「" + testCase.getName() + "」不属于当前项目");
            }
        }
        task.setCaseIds(caseIds.stream().map(String::valueOf).collect(Collectors.joining(",")));
        if (request.environmentId() != null) {
            TestEnvironment env = environmentRepository.findById(request.environmentId())
                    .orElseThrow(() -> BusinessException.notFound("环境不存在"));
            if (!env.getProjectId().equals(project.getId())) {
                throw new BusinessException("所选环境不属于当前项目");
            }
        } else {
            environmentRepository.findByProjectIdAndDefaultEnvTrue(project.getId())
                    .ifPresent(env -> task.setEnvironmentId(env.getId()));
        }

        String cron = blank(request.cronExpression()) ? null : request.cronExpression().trim();
        if (cron != null) {
            try {
                CronExpression.parse(cron);
            } catch (IllegalArgumentException e) {
                throw new BusinessException("Cron 表达式无效：" + e.getMessage());
            }
        }
        task.setCronExpression(cron);
        task.setNextRunAt(task.isEnabled() && cron != null ? nextRun(cron) : null);
    }

    private Instant nextRun(String cron) {
        CronExpression expression = CronExpression.parse(cron);
        ZonedDateTime next = expression.next(ZonedDateTime.now(ZoneId.systemDefault()));
        return next == null ? null : next.toInstant();
    }

    private TaskDto toDto(TestTask task) {
        String projectName = projectRepository.findById(task.getProjectId())
                .map(Project::getName).orElse("已删除项目");
        String envName = task.getEnvironmentId() == null ? null
                : environmentRepository.findById(task.getEnvironmentId())
                .map(TestEnvironment::getName).orElse("已删除环境");
        List<Long> caseIds = parseCaseIds(task.getCaseIds());
        Map<Long, TestCase> cases = caseRepository.findByIdIn(caseIds).stream()
                .collect(Collectors.toMap(TestCase::getId, Function.identity()));
        List<String> caseNames = caseIds.stream()
                .map(id -> cases.containsKey(id) ? cases.get(id).getName() : "已删除用例").toList();
        TestRun latest = runRepository.findTop1ByTaskIdOrderByCreatedAtDesc(task.getId());
        String lastStatus = latest != null ? latest.getStatus().name() : task.getLastRunStatus();
        return new TaskDto(task.getId(), task.getProjectId(), projectName, task.getEnvironmentId(),
                envName, task.getName(), task.getDescription(), caseIds, caseNames,
                task.getCronExpression(), task.isEnabled(), task.getRetryCount(),
                task.getTimeoutSeconds(), task.getWebhookUrl(), task.getLastRunAt(),
                task.getNextRunAt(), lastStatus, task.getCreatedAt(), task.getUpdatedAt());
    }

    private List<Long> parseCaseIds(String caseIds) {
        if (caseIds == null || caseIds.isBlank()) {
            return List.of();
        }
        return Arrays.stream(caseIds.split(","))
                .map(String::trim).filter(s -> !s.isBlank())
                .map(Long::valueOf).distinct().toList();
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }
}

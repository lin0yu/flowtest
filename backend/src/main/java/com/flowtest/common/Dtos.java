package com.flowtest.common;

import com.flowtest.automation.StepDef;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public final class Dtos {

    private Dtos() {
    }

    // ---------- auth ----------
    public record UserDto(Long id, String username, String displayName, String role) {
    }

    public record LoginRequest(@NotBlank(message = "请输入用户名") String username,
                               @NotBlank(message = "请输入密码") String password) {
    }

    public record LoginResponse(String token, UserDto user) {
    }

    public record PasswordRequest(@NotBlank(message = "请输入原密码") String oldPassword,
                                  @NotBlank(message = "请输入新密码")
                                  @Size(min = 6, max = 64, message = "新密码长度需在 6-64 位之间") String newPassword) {
    }

    // ---------- project ----------
    public record ProjectDto(Long id, String name, String key, String description, String color,
                             long caseCount, long envCount, long taskCount,
                             Instant createdAt, Instant updatedAt) {
    }

    public record ProjectRequest(@NotBlank(message = "请输入项目名称") @Size(max = 120) String name,
                                 @Size(max = 60) String key,
                                 @Size(max = 1000) String description,
                                 String color) {
    }

    // ---------- environment ----------
    public record EnvironmentDto(Long id, Long projectId, String name, String baseUrl,
                                 Map<String, String> variables, boolean defaultEnv, Instant createdAt) {
    }

    public record EnvironmentRequest(@NotNull(message = "请选择项目") Long projectId,
                                     @NotBlank(message = "请输入环境名称") @Size(max = 120) String name,
                                     @Size(max = 1200) String baseUrl,
                                     Map<String, String> variables,
                                     Boolean defaultEnv) {
    }

    // ---------- compile ----------
    public record CompileRequest(String nl, String title, Boolean useLlm) {
    }

    public record CompileResult(String title, String summary, List<StepDef> steps,
                                List<String> warnings, String engine) {
    }

    // ---------- test case ----------
    public record AttachmentDto(Long id, String fileName, String contentType, long size, Instant createdAt) {
    }

    public record CaseSaveRequest(@NotNull(message = "请选择项目") Long projectId,
                                  @NotBlank(message = "请输入用例名称") @Size(max = 160) String name,
                                  @Size(max = 1200) String description,
                                  String nlInput,
                                  List<StepDef> steps,
                                  List<String> tags,
                                  String priority,
                                  String status,
                                  Integer timeoutSeconds,
                                  Boolean headless,
                                  Boolean screenshotEachStep) {
    }

    public record CaseSummaryDto(Long id, Long projectId, String projectName, String name,
                                 String description, int stepCount, List<String> tags,
                                 String priority, String status, int version, Instant updatedAt) {
    }

    public record CaseDetailDto(Long id, Long projectId, String projectName, String name,
                                String description, String nlInput, List<StepDef> steps,
                                List<String> tags, String priority, String status,
                                int timeoutSeconds, boolean headless, boolean screenshotEachStep,
                                int version, String createdBy, List<AttachmentDto> attachments,
                                Instant createdAt, Instant updatedAt) {
    }

    public record PageDto<T>(List<T> content, long total, int page, int size) {
    }

    public record CaseRunRequest(Long environmentId, Boolean headless) {
    }

    public record ExportCase(String name, String description, String nlInput, List<StepDef> steps,
                             List<String> tags, String priority, int timeoutSeconds,
                             boolean headless, boolean screenshotEachStep) {
    }

    public record ExportBundle(int version, Instant exportedAt, String projectName, List<ExportCase> cases) {
    }

    public record ImportResult(int imported, List<String> warnings) {
    }

    // ---------- task ----------
    public record TaskDto(Long id, Long projectId, String projectName, Long environmentId,
                          String environmentName, String name, String description,
                          List<Long> caseIds, List<String> caseNames, String cronExpression,
                          boolean enabled, int retryCount, int timeoutSeconds, String webhookUrl,
                          Instant lastRunAt, Instant nextRunAt, String lastRunStatus,
                          Instant createdAt, Instant updatedAt) {
    }

    public record TaskRequest(@NotNull(message = "请选择项目") Long projectId,
                              Long environmentId,
                              @NotBlank(message = "请输入任务名称") @Size(max = 160) String name,
                              @Size(max = 1000) String description,
                              @NotNull(message = "请选择至少一个用例") List<Long> caseIds,
                              @Size(max = 120) String cronExpression,
                              Boolean enabled,
                              Integer retryCount,
                              Integer timeoutSeconds,
                              @Size(max = 800) String webhookUrl) {
    }

    public record TaskTriggerDto(String batchId, int runCount, List<Long> runIds) {
    }

    // ---------- run ----------
    public record RunDto(Long id, String batchId, Long taskId, String taskName,
                         Long projectId, String projectName, Long caseId, String caseName,
                         Long environmentId, String environmentName, String triggerType,
                         String status, int attempt, int maxAttempts, int totalSteps,
                         int passedSteps, int failedSteps, int skippedSteps, Long durationMs,
                         Instant startedAt, Instant finishedAt, Instant createdAt,
                         String requestedBy, String errorMessage, boolean headless) {
    }

    public record RunStepDto(Long id, int stepIndex, String action, String selector, String value,
                             String description, String status, String message,
                             String expectedValue, String actualValue, Instant startedAt,
                             Instant finishedAt, Long durationMs, Long screenshotArtifactId) {
    }

    public record ArtifactDto(Long id, Long runId, Integer stepIndex, String type, String fileName,
                              String contentType, long size, Instant createdAt) {
    }

    public record RunDetailDto(RunDto run, List<RunStepDto> steps,
                               List<ArtifactDto> artifacts, String consoleLog) {
    }

    public record RunSearchResult(PageDto<RunDto> page) {
    }

    public record QuickRunRequest(Long projectId, Long environmentId, String nl, String title,
                                  List<StepDef> steps, Boolean headless, Boolean screenshotEachStep) {
    }

    public record AutomationRunRequest(Long caseId, Long projectId, Long environmentId,
                                       String nl, String title, List<StepDef> steps,
                                       Boolean headless, Integer timeoutSeconds) {
    }

    // ---------- api key ----------
    public record ApiKeyDto(Long id, String name, String prefix, boolean enabled,
                            Instant createdAt, Instant lastUsedAt) {
    }

    public record ApiKeyCreateRequest(@NotBlank(message = "请输入密钥名称") @Size(max = 80) String name) {
    }

    public record ApiKeyCreateResponse(String plainKey, ApiKeyDto key) {
    }

    // ---------- stats / system ----------
    public record TrendPoint(String date, long total, long passed, long failed) {
    }

    public record FailingCase(String caseName, long failures) {
    }

    public record StatsOverview(long projectCount, long caseCount, long taskCount, long runCount,
                                long runs7d, double passRate, long avgDurationMs, long activeRuns,
                                List<TrendPoint> trend, List<RunDto> recentRuns,
                                List<FailingCase> failingCases) {
    }

    public record SystemStatus(boolean engineReady, String browser, String browserVersion,
                               boolean llmEnabled, String llmModel, int maxParallel,
                               long queuedRuns, int activeRuns, String storageRoot,
                               String demoUrl, String version, long uptimeSeconds) {
    }

    public record MessageResponse(String message) {
    }
}

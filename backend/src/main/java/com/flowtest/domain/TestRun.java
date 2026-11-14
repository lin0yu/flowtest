package com.flowtest.domain;

import com.flowtest.domain.DomainEnums.RunStatus;
import com.flowtest.domain.DomainEnums.TriggerType;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "test_runs")
@Getter
@Setter
@NoArgsConstructor
public class TestRun extends BaseEntity {

    @Column(length = 60)
    private String batchId;

    private Long taskId;

    @Column(length = 160)
    private String taskName;

    @Column(nullable = false)
    private Long projectId;

    private Long caseId;

    @Column(length = 200)
    private String caseName;

    private Long environmentId;

    @Column(length = 120)
    private String environmentName;

    @Column(length = 1200)
    private String environmentBaseUrl;

    @Lob
    private String environmentVariablesJson;

    @Lob
    private String nlInput;

    @Lob
    private String stepsJson;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private TriggerType triggerType = TriggerType.MANUAL;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RunStatus status = RunStatus.QUEUED;

    @Column(nullable = false)
    private int attempt = 1;

    @Column(nullable = false)
    private int maxAttempts = 1;

    @Column(nullable = false)
    private int totalSteps = 0;

    @Column(nullable = false)
    private int passedSteps = 0;

    @Column(nullable = false)
    private int failedSteps = 0;

    @Column(nullable = false)
    private int skippedSteps = 0;

    private Long durationMs;

    private Instant startedAt;

    private Instant finishedAt;

    @Column(length = 80)
    private String requestedBy;

    @Lob
    private String errorMessage;

    @Lob
    private String consoleLog;

    @Column(nullable = false)
    private boolean headless = true;

    @Column(nullable = false)
    private boolean screenshotEachStep = true;

    @Column(nullable = false)
    private int timeoutSeconds = 20;

    @Column(nullable = false)
    private boolean cancelRequested = false;

    @Column(length = 800)
    private String webhookUrl;
}

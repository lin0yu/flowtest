package com.flowtest.domain;

public final class DomainEnums {

    private DomainEnums() {
    }

    public enum Role {
        ADMIN, TESTER, VIEWER
    }

    public enum CaseStatus {
        DRAFT, READY, DISABLED
    }

    public enum Priority {
        LOW, MEDIUM, HIGH, CRITICAL
    }

    public enum TriggerType {
        MANUAL, SCHEDULE, API, RETRY
    }

    public enum RunStatus {
        QUEUED, RUNNING, PASSED, FAILED, CANCELLED, ERROR
    }

    public enum StepStatus {
        PENDING, RUNNING, PASSED, FAILED, SKIPPED, ERROR
    }

    public enum ArtifactType {
        SCREENSHOT, LOG, REPORT, FILE
    }
}

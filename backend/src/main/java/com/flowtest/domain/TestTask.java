package com.flowtest.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "test_tasks")
@Getter
@Setter
@NoArgsConstructor
public class TestTask extends BaseEntity {

    @Column(nullable = false)
    private Long projectId;

    private Long environmentId;

    @Column(nullable = false, length = 160)
    private String name;

    @Column(length = 1000)
    private String description;

    @Column(nullable = false, length = 1000)
    private String caseIds = "";

    @Column(length = 120)
    private String cronExpression;

    @Column(nullable = false)
    private boolean enabled = true;

    @Column(nullable = false)
    private int retryCount = 0;

    @Column(nullable = false)
    private int timeoutSeconds = 20;

    @Column(length = 800)
    private String webhookUrl;

    private Instant lastRunAt;

    private Instant nextRunAt;

    @Column(length = 30)
    private String lastRunStatus;
}

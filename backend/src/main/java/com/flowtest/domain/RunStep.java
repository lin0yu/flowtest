package com.flowtest.domain;

import com.flowtest.domain.DomainEnums.StepStatus;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "run_steps")
@Getter
@Setter
@NoArgsConstructor
public class RunStep extends BaseEntity {

    @Column(nullable = false)
    private Long runId;

    @Column(nullable = false)
    private int stepIndex;

    @Column(nullable = false, length = 40)
    private String action;

    @Column(length = 1000)
    private String selector;

    @Column(name = "step_value", length = 2000)
    private String stepValue;

    @Column(length = 500)
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private StepStatus status = StepStatus.PENDING;

    @Lob
    private String message;

    @Lob
    private String expectedValue;

    @Lob
    private String actualValue;

    private Instant startedAt;

    private Instant finishedAt;

    private Long durationMs;

    private Long screenshotArtifactId;
}

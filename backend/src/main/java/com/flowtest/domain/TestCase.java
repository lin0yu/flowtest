package com.flowtest.domain;

import com.flowtest.domain.DomainEnums.CaseStatus;
import com.flowtest.domain.DomainEnums.Priority;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "test_cases")
@Getter
@Setter
@NoArgsConstructor
public class TestCase extends BaseEntity {

    @Column(nullable = false)
    private Long projectId;

    @Column(nullable = false, length = 160)
    private String name;

    @Column(length = 1200)
    private String description;

    @Lob
    private String nlInput;

    @Lob
    private String stepsJson;

    @Column(length = 500)
    private String tags;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Priority priority = Priority.MEDIUM;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private CaseStatus status = CaseStatus.DRAFT;

    @Column(nullable = false)
    private int timeoutSeconds = 20;

    @Column(nullable = false)
    private boolean headless = true;

    @Column(nullable = false)
    private boolean screenshotEachStep = true;

    @Column(nullable = false)
    private int version = 1;

    @Column(length = 80)
    private String createdBy;
}

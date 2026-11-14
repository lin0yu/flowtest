package com.flowtest.domain;

import com.flowtest.domain.DomainEnums.ArtifactType;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "artifacts")
@Getter
@Setter
@NoArgsConstructor
public class Artifact extends BaseEntity {

    @Column(nullable = false)
    private Long runId;

    private Integer stepIndex;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ArtifactType type;

    @Column(nullable = false, length = 260)
    private String fileName;

    @Column(length = 120)
    private String contentType;

    @Column(nullable = false, length = 600)
    private String path;

    @Column(nullable = false)
    private long size;
}

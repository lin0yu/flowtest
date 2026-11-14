package com.flowtest.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "environments")
@Getter
@Setter
@NoArgsConstructor
public class TestEnvironment extends BaseEntity {

    @Column(nullable = false)
    private Long projectId;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(length = 1200)
    private String baseUrl;

    @Lob
    private String variablesJson;

    @Column(name = "is_default", nullable = false)
    private boolean defaultEnv = false;
}

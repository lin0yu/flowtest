package com.flowtest.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "projects")
@Getter
@Setter
@NoArgsConstructor
public class Project extends BaseEntity {

    @Column(nullable = false, length = 120)
    private String name;

    @Column(name = "project_key", nullable = false, unique = true, length = 60)
    private String projectKey;

    @Column(length = 1000)
    private String description;

    @Column(length = 20)
    private String color = "#6366f1";
}

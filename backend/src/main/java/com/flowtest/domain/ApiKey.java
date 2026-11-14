package com.flowtest.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "api_keys")
@Getter
@Setter
@NoArgsConstructor
public class ApiKey extends BaseEntity {

    @Column(nullable = false, length = 80)
    private String name;

    @Column(nullable = false, length = 20)
    private String keyPrefix;

    @Column(nullable = false, unique = true, length = 128)
    private String keyHash;

    @Column(nullable = false, length = 20)
    private String role = "API";

    private boolean enabled = true;

    private Instant lastUsedAt;
}

package com.flowtest.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
public class User extends BaseEntity {

    @Column(nullable = false, unique = true, length = 64)
    private String username;

    @Column(nullable = false, length = 120)
    private String passwordHash;

    @Column(nullable = false, length = 80)
    private String displayName;

    @Column(name = "user_role", nullable = false, length = 20)
    private String role = "TESTER";

    private boolean enabled = true;
}

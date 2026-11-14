package com.flowtest.repo;

import com.flowtest.domain.TestEnvironment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface EnvironmentRepository extends JpaRepository<TestEnvironment, Long> {
    List<TestEnvironment> findByProjectIdOrderByIdAsc(Long projectId);

    Optional<TestEnvironment> findByProjectIdAndDefaultEnvTrue(Long projectId);

    long countByProjectId(Long projectId);
}

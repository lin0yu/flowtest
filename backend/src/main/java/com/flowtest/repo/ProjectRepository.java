package com.flowtest.repo;

import com.flowtest.domain.Project;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ProjectRepository extends JpaRepository<Project, Long> {
    List<Project> findAllByOrderByCreatedAtDesc();

    Optional<Project> findByProjectKey(String projectKey);

    boolean existsByProjectKey(String projectKey);
}

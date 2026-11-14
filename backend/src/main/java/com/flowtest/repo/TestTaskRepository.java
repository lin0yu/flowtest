package com.flowtest.repo;

import com.flowtest.domain.TestTask;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TestTaskRepository extends JpaRepository<TestTask, Long> {
    List<TestTask> findAllByOrderByCreatedAtDesc();

    List<TestTask> findByEnabledTrue();

    long countByProjectId(Long projectId);
}

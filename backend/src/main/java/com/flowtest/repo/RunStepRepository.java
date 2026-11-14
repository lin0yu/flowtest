package com.flowtest.repo;

import com.flowtest.domain.RunStep;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface RunStepRepository extends JpaRepository<RunStep, Long> {
    List<RunStep> findByRunIdOrderByStepIndexAsc(Long runId);

    Optional<RunStep> findByRunIdAndStepIndex(Long runId, int stepIndex);
}

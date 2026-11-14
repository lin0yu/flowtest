package com.flowtest.repo;

import com.flowtest.domain.Artifact;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ArtifactRepository extends JpaRepository<Artifact, Long> {
    List<Artifact> findByRunIdOrderByIdAsc(Long runId);

    long countByRunId(Long runId);
}

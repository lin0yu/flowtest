package com.flowtest.repo;

import com.flowtest.domain.DomainEnums.RunStatus;
import com.flowtest.domain.DomainEnums.TriggerType;
import com.flowtest.domain.TestRun;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

public interface TestRunRepository extends JpaRepository<TestRun, Long> {

    @Query("""
            select r from TestRun r
            where (:projectId is null or r.projectId = :projectId)
              and (:status is null or r.status = :status)
              and (:triggerType is null or r.triggerType = :triggerType)
            order by r.createdAt desc
            """)
    Page<TestRun> search(@Param("projectId") Long projectId,
                         @Param("status") RunStatus status,
                         @Param("triggerType") TriggerType triggerType,
                         Pageable pageable);

    List<TestRun> findTop10ByOrderByCreatedAtDesc();

    List<TestRun> findByCreatedAtAfterOrderByCreatedAtAsc(Instant from);

    long countByStatus(RunStatus status);

    long countByStatusIn(Collection<RunStatus> statuses);

    List<TestRun> findTop200ByStatusOrderByCreatedAtDesc(RunStatus status);

    long countByProjectId(Long projectId);

    List<TestRun> findByTaskIdOrderByCreatedAtDesc(Long taskId);

    TestRun findTop1ByTaskIdOrderByCreatedAtDesc(Long taskId);

    List<TestRun> findByStatusIn(Collection<RunStatus> statuses);
}

package com.flowtest.repo;

import com.flowtest.domain.DomainEnums.CaseStatus;
import com.flowtest.domain.DomainEnums.Priority;
import com.flowtest.domain.TestCase;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface TestCaseRepository extends JpaRepository<TestCase, Long> {

    @Query("""
            select c from TestCase c
            where (:projectId is null or c.projectId = :projectId)
              and (:status is null or c.status = :status)
              and (:priority is null or c.priority = :priority)
              and (:keyword is null or lower(c.name) like lower(concat('%', :keyword, '%'))
                   or lower(coalesce(c.description, '')) like lower(concat('%', :keyword, '%'))
                   or lower(coalesce(c.tags, '')) like lower(concat('%', :keyword, '%')))
            order by c.updatedAt desc
            """)
    Page<TestCase> search(@Param("projectId") Long projectId,
                          @Param("status") CaseStatus status,
                          @Param("priority") Priority priority,
                          @Param("keyword") String keyword,
                          Pageable pageable);

    long countByProjectId(Long projectId);

    List<TestCase> findByIdIn(Collection<Long> ids);

    List<TestCase> findByProjectIdOrderByIdAsc(Long projectId);
}

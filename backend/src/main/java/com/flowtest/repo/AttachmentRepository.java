package com.flowtest.repo;

import com.flowtest.domain.Attachment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AttachmentRepository extends JpaRepository<Attachment, Long> {
    List<Attachment> findByCaseIdOrderByCreatedAtDesc(Long caseId);

    void deleteByCaseId(Long caseId);
}

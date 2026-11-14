package com.flowtest.repo;

import com.flowtest.domain.ApiKey;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ApiKeyRepository extends JpaRepository<ApiKey, Long> {
    Optional<ApiKey> findByKeyHashAndEnabledTrue(String keyHash);

    List<ApiKey> findAllByOrderByCreatedAtDesc();
}

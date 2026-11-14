package com.flowtest.service;

import com.flowtest.common.BusinessException;
import com.flowtest.common.Dtos.ApiKeyCreateResponse;
import com.flowtest.common.Dtos.ApiKeyDto;
import com.flowtest.common.Dtos.ApiKeyCreateRequest;
import com.flowtest.config.ApiKeyAuthenticationFilter;
import com.flowtest.domain.ApiKey;
import com.flowtest.repo.ApiKeyRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ApiKeyService {

    private final ApiKeyRepository apiKeyRepository;
    private final SecureRandom random = new SecureRandom();

    @Transactional(readOnly = true)
    public List<ApiKeyDto> list() {
        return apiKeyRepository.findAllByOrderByCreatedAtDesc().stream().map(this::toDto).toList();
    }

    @Transactional
    public ApiKeyCreateResponse create(ApiKeyCreateRequest request) {
        byte[] bytes = new byte[24];
        random.nextBytes(bytes);
        String plain = "ft_" + HexFormat.of().formatHex(bytes);
        ApiKey key = new ApiKey();
        key.setName(request.name().trim());
        key.setKeyPrefix(plain.substring(0, Math.min(12, plain.length())));
        key.setKeyHash(ApiKeyAuthenticationFilter.sha256(plain));
        key.setRole("API");
        key.setEnabled(true);
        key = apiKeyRepository.save(key);
        return new ApiKeyCreateResponse(plain, toDto(key));
    }

    @Transactional
    public void delete(Long id) {
        ApiKey key = apiKeyRepository.findById(id)
                .orElseThrow(() -> BusinessException.notFound("API Key 不存在"));
        apiKeyRepository.delete(key);
    }

    private ApiKeyDto toDto(ApiKey key) {
        return new ApiKeyDto(key.getId(), key.getName(), key.getKeyPrefix(),
                key.isEnabled(), key.getCreatedAt(), key.getLastUsedAt());
    }
}

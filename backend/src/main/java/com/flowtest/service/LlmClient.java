package com.flowtest.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class LlmClient {

    private final ObjectMapper objectMapper;

    @Value("${flowtest.llm.enabled:false}")
    private boolean enabled;
    @Value("${flowtest.llm.base-url:}")
    private String baseUrl;
    @Value("${flowtest.llm.api-key:}")
    private String apiKey;
    @Value("${flowtest.llm.model:}")
    private String model;

    public boolean isEnabled() {
        return enabled && !baseUrl.isBlank() && !apiKey.isBlank() && !model.isBlank();
    }

    public String getModel() {
        return model;
    }

    public String complete(String systemPrompt, String userPrompt) {
        if (!isEnabled()) {
            throw new IllegalStateException("LLM 未启用或配置不完整");
        }
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(8));
        factory.setReadTimeout(Duration.ofSeconds(75));
        String normalizedBase = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        RestClient client = RestClient.builder()
                .baseUrl(normalizedBase)
                .requestFactory(factory)
                .build();
        Map<String, Object> request = Map.of(
                "model", model,
                "temperature", 0.1,
                "messages", List.of(
                        Map.of("role", "system", "content", systemPrompt),
                        Map.of("role", "user", "content", userPrompt)
                )
        );
        String response = client.post()
                .uri("/chat/completions")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Authorization", "Bearer " + apiKey)
                .body(request)
                .retrieve()
                .body(String.class);
        try {
            JsonNode root = objectMapper.readTree(response);
            JsonNode content = root.path("choices").path(0).path("message").path("content");
            if (content.isMissingNode() || content.asText().isBlank()) {
                throw new IllegalStateException("LLM 返回内容为空");
            }
            return content.asText();
        } catch (Exception e) {
            throw new IllegalStateException("LLM 响应解析失败：" + e.getMessage(), e);
        }
    }
}

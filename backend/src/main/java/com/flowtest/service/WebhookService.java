package com.flowtest.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.flowtest.domain.TestRun;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class WebhookService {

    private final ObjectMapper objectMapper;

    @Async
    public void sendRunFinished(TestRun run) {
        String url = run.getWebhookUrl();
        if (url == null || url.isBlank()) {
            return;
        }
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("event", "run.finished");
            payload.put("runId", run.getId());
            payload.put("batchId", run.getBatchId());
            payload.put("taskId", run.getTaskId());
            payload.put("taskName", run.getTaskName());
            payload.put("caseId", run.getCaseId());
            payload.put("caseName", run.getCaseName());
            payload.put("status", run.getStatus().name());
            payload.put("attempt", run.getAttempt());
            payload.put("totalSteps", run.getTotalSteps());
            payload.put("passedSteps", run.getPassedSteps());
            payload.put("failedSteps", run.getFailedSteps());
            payload.put("durationMs", run.getDurationMs());
            payload.put("finishedAt", run.getFinishedAt());
            payload.put("errorMessage", run.getErrorMessage());
            String body = objectMapper.writeValueAsString(payload);
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(10))
                    .header("Content-Type", "application/json")
                    .header("X-FlowTest-Event", "run.finished")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();
            HttpResponse<String> response = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(5))
                    .build()
                    .send(request, HttpResponse.BodyHandlers.ofString());
            log.info("Webhook run {} -> {} [{}]", run.getId(), url, response.statusCode());
        } catch (Exception e) {
            log.warn("Webhook failed for run {}: {}", run.getId(), e.getMessage());
        }
    }
}

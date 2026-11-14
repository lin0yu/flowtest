package com.flowtest.service;

import com.flowtest.common.Dtos.SystemStatus;
import com.flowtest.domain.DomainEnums.RunStatus;
import com.flowtest.repo.TestRunRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.lang.management.ManagementFactory;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class SystemService {

    private final TestRunRepository runRepository;
    private final LlmClient llmClient;
    private final StorageService storageService;

    @Value("${flowtest.engine.max-parallel:3}")
    private int maxParallel;
    @Value("${flowtest.engine.browser-binary:/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}")
    private String browserBinary;

    private volatile String browserVersion;
    private volatile long browserCheckedAt;

    public SystemStatus status() {
        boolean engineReady = Files.isExecutable(Path.of(browserBinary));
        long queued = runRepository.countByStatus(RunStatus.QUEUED);
        long active = runRepository.countByStatus(RunStatus.RUNNING);
        return new SystemStatus(
                engineReady,
                "Google Chrome",
                detectBrowserVersion(engineReady),
                llmClient.isEnabled(),
                llmClient.isEnabled() ? llmClient.getModel() : null,
                maxParallel,
                queued,
                (int) active,
                storageService.getRootAbsolute(),
                "/demo/index.html",
                "1.0.0",
                ManagementFactory.getRuntimeMXBean().getUptime() / 1000
        );
    }

    private String detectBrowserVersion(boolean engineReady) {
        if (!engineReady) {
            return null;
        }
        long now = System.currentTimeMillis();
        if (browserVersion != null && now - browserCheckedAt < 60_000) {
            return browserVersion;
        }
        try {
            Process process = new ProcessBuilder(browserBinary, "--version")
                    .redirectErrorStream(true).start();
            boolean finished = process.waitFor(3, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                return browserVersion;
            }
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line = reader.readLine();
                if (line != null && !line.isBlank()) {
                    browserVersion = line.trim();
                }
            }
        } catch (Exception e) {
            log.debug("Detect Chrome version failed: {}", e.getMessage());
        }
        browserCheckedAt = now;
        return browserVersion;
    }
}

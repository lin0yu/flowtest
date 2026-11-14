package com.flowtest.web;

import com.flowtest.common.Dtos.SystemStatus;
import com.flowtest.service.SystemService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequiredArgsConstructor
public class SystemController {

    private final SystemService systemService;

    @GetMapping("/api/system/status")
    public SystemStatus status() {
        return systemService.status();
    }

    @GetMapping("/api/public/health")
    public Map<String, Object> health() {
        SystemStatus status = systemService.status();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", "UP");
        body.put("engineReady", status.engineReady());
        body.put("browser", status.browser());
        body.put("llmEnabled", status.llmEnabled());
        body.put("timestamp", Instant.now().toString());
        return body;
    }
}

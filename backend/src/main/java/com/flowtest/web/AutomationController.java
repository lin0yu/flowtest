package com.flowtest.web;

import com.flowtest.common.Dtos.*;
import com.flowtest.service.NlCompilerService;
import com.flowtest.service.RunService;
import com.flowtest.service.SystemService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/automation")
@RequiredArgsConstructor
public class AutomationController {

    private final NlCompilerService compilerService;
    private final RunService runService;
    private final SystemService systemService;

    @PostMapping("/compile")
    public CompileResult compile(@RequestBody CompileRequest request) {
        return compilerService.compile(request.nl(), request.title(), request.useLlm());
    }

    @PostMapping("/runs")
    public Object run(@RequestBody AutomationRunRequest request,
                      @RequestParam(defaultValue = "false") boolean wait,
                      @RequestParam(defaultValue = "90") int waitSeconds,
                      Authentication authentication) {
        RunDto run = runService.createAutomationRun(request, authentication.getName());
        if (wait) {
            return runService.awaitCompletion(run.id(), waitSeconds);
        }
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("run", run);
        response.put("pollUrl", "/api/v1/automation/runs/" + run.id());
        return response;
    }

    @GetMapping("/runs/{id}")
    public RunDetailDto detail(@PathVariable Long id) {
        return runService.detail(id);
    }

    @GetMapping("/runs/{id}/report")
    public RunDetailDto report(@PathVariable Long id) {
        return runService.detail(id);
    }

    @PostMapping("/runs/{id}/cancel")
    public RunDto cancel(@PathVariable Long id) {
        return runService.cancel(id);
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        SystemStatus status = systemService.status();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", "UP");
        body.put("engineReady", status.engineReady());
        body.put("browser", status.browser());
        body.put("browserVersion", status.browserVersion());
        body.put("llmEnabled", status.llmEnabled());
        body.put("queuedRuns", status.queuedRuns());
        body.put("activeRuns", status.activeRuns());
        return body;
    }
}

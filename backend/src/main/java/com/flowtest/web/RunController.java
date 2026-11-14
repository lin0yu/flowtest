package com.flowtest.web;

import com.flowtest.common.Dtos.*;
import com.flowtest.domain.Artifact;
import com.flowtest.domain.DomainEnums.RunStatus;
import com.flowtest.domain.DomainEnums.TriggerType;
import com.flowtest.service.RunEventHub;
import com.flowtest.service.RunService;
import com.flowtest.service.StorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;

@RestController
@RequestMapping("/api/runs")
@RequiredArgsConstructor
public class RunController {

    private final RunService runService;
    private final RunEventHub eventHub;
    private final StorageService storageService;

    @GetMapping
    public PageDto<RunDto> list(@RequestParam(required = false) Long projectId,
                                @RequestParam(required = false) String status,
                                @RequestParam(required = false) String triggerType,
                                @RequestParam(defaultValue = "1") int page,
                                @RequestParam(defaultValue = "10") int size) {
        return runService.search(projectId, status, triggerType, page, size);
    }

    @GetMapping("/{id}")
    public RunDetailDto detail(@PathVariable Long id) {
        return runService.detail(id);
    }

    @PostMapping("/quick")
    public RunDto quick(@RequestBody QuickRunRequest request, Authentication authentication) {
        return runService.quickRun(request, authentication.getName(), TriggerType.MANUAL);
    }

    @GetMapping(value = "/{id}/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@PathVariable Long id, @RequestParam(required = false) String token) {
        RunDetailDto detail = runService.detail(id);
        SseEmitter emitter = eventHub.subscribe(id);
        try {
            emitter.send(SseEmitter.event().name("snapshot").data(detail));
            if (isFinal(detail.run().status())) {
                emitter.complete();
            }
        } catch (Exception e) {
            emitter.completeWithError(e);
        }
        return emitter;
    }

    @PostMapping("/{id}/cancel")
    public RunDto cancel(@PathVariable Long id) {
        return runService.cancel(id);
    }

    @PostMapping("/{id}/rerun")
    public RunDto rerun(@PathVariable Long id, Authentication authentication) {
        return runService.rerun(id, authentication.getName());
    }

    @GetMapping("/{id}/download")
    public ResponseEntity<Resource> download(@PathVariable Long id) {
        Path zip = runService.zipArtifacts(id);
        Resource resource = new FileSystemResource(zip);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename("flowtest-run-" + id + ".zip", StandardCharsets.UTF_8).build().toString())
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(resource);
    }

    @GetMapping("/{runId}/artifacts/{artifactId}/view")
    public ResponseEntity<Resource> viewArtifact(@PathVariable Long runId, @PathVariable Long artifactId) {
        Artifact artifact = runService.findArtifact(runId, artifactId);
        Resource resource = storageService.loadAsResource(artifact.getPath());
        MediaType type;
        try {
            type = MediaType.parseMediaType(artifact.getContentType());
        } catch (Exception e) {
            type = MediaType.APPLICATION_OCTET_STREAM;
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "private, max-age=3600")
                .contentType(type)
                .body(resource);
    }

    @GetMapping("/{runId}/artifacts/{artifactId}/download")
    public ResponseEntity<Resource> downloadArtifact(@PathVariable Long runId, @PathVariable Long artifactId) {
        Artifact artifact = runService.findArtifact(runId, artifactId);
        Resource resource = storageService.loadAsResource(artifact.getPath());
        MediaType type;
        try {
            type = MediaType.parseMediaType(artifact.getContentType());
        } catch (Exception e) {
            type = MediaType.APPLICATION_OCTET_STREAM;
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(artifact.getFileName(), StandardCharsets.UTF_8).build().toString())
                .contentType(type)
                .body(resource);
    }

    private boolean isFinal(String status) {
        return RunStatus.PASSED.name().equals(status) || RunStatus.FAILED.name().equals(status)
                || RunStatus.ERROR.name().equals(status) || RunStatus.CANCELLED.name().equals(status);
    }
}

package com.flowtest.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.flowtest.common.Dtos.*;
import com.flowtest.domain.Attachment;
import com.flowtest.service.NlCompilerService;
import com.flowtest.service.RunService;
import com.flowtest.service.StorageService;
import com.flowtest.service.TestCaseService;
import com.flowtest.domain.DomainEnums.TriggerType;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class TestCaseController {

    private final TestCaseService caseService;
    private final NlCompilerService compilerService;
    private final RunService runService;
    private final StorageService storageService;
    private final ObjectMapper objectMapper;

    @GetMapping("/cases")
    public PageDto<CaseSummaryDto> list(@RequestParam(required = false) Long projectId,
                                        @RequestParam(required = false) String keyword,
                                        @RequestParam(required = false) String status,
                                        @RequestParam(required = false) String priority,
                                        @RequestParam(defaultValue = "1") int page,
                                        @RequestParam(defaultValue = "10") int size) {
        return caseService.search(projectId, keyword, status, priority, page, size);
    }

    @GetMapping("/cases/{id}")
    public CaseDetailDto get(@PathVariable Long id) {
        return caseService.get(id);
    }

    @PostMapping("/cases")
    public CaseDetailDto create(@Valid @RequestBody CaseSaveRequest request, Authentication authentication) {
        return caseService.create(request, authentication.getName());
    }

    @PutMapping("/cases/{id}")
    public CaseDetailDto update(@PathVariable Long id, @Valid @RequestBody CaseSaveRequest request) {
        return caseService.update(id, request);
    }

    @DeleteMapping("/cases/{id}")
    public MessageResponse delete(@PathVariable Long id) {
        caseService.delete(id);
        return new MessageResponse("用例已删除");
    }

    @PostMapping("/cases/{id}/duplicate")
    public CaseDetailDto duplicate(@PathVariable Long id) {
        return caseService.duplicate(id);
    }

    @PostMapping("/cases/compile")
    public CompileResult compile(@RequestBody CompileRequest request) {
        return compilerService.compile(request.nl(), request.title(), request.useLlm());
    }

    @PostMapping("/cases/{id}/run")
    public RunDto run(@PathVariable Long id,
                      @RequestBody(required = false) CaseRunRequest request,
                      Authentication authentication) {
        Long envId = request == null ? null : request.environmentId();
        Boolean headless = request == null ? null : request.headless();
        return runService.triggerCase(id, envId, headless, authentication.getName(), TriggerType.MANUAL);
    }

    @GetMapping("/cases/export")
    public ResponseEntity<byte[]> export(@RequestParam Long projectId) throws Exception {
        ExportBundle bundle = caseService.export(projectId);
        byte[] bytes = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(bundle);
        String filename = "flowtest-cases-" + projectId + ".json";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(filename, StandardCharsets.UTF_8).build().toString())
                .contentType(MediaType.APPLICATION_JSON)
                .body(bytes);
    }

    @PostMapping("/cases/import")
    public ImportResult importCases(@RequestParam Long projectId,
                                    @RequestPart("file") MultipartFile file) {
        return caseService.importCases(projectId, file);
    }

    @GetMapping("/cases/{id}/attachments")
    public List<AttachmentDto> attachments(@PathVariable Long id) {
        return caseService.attachments(id);
    }

    @PostMapping("/cases/{id}/attachments")
    public AttachmentDto upload(@PathVariable Long id, @RequestPart("file") MultipartFile file) {
        return caseService.upload(id, file);
    }

    @DeleteMapping("/attachments/{id}")
    public MessageResponse deleteAttachment(@PathVariable Long id) {
        caseService.deleteAttachment(id);
        return new MessageResponse("附件已删除");
    }

    @GetMapping("/attachments/{id}/download")
    public ResponseEntity<Resource> downloadAttachment(@PathVariable Long id) {
        Attachment attachment = caseService.findAttachment(id);
        Resource resource = storageService.loadAsResource(attachment.getPath());
        MediaType mediaType;
        try {
            mediaType = MediaType.parseMediaType(attachment.getContentType());
        } catch (Exception e) {
            mediaType = MediaType.APPLICATION_OCTET_STREAM;
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(attachment.getFileName(), StandardCharsets.UTF_8).build().toString())
                .contentType(mediaType)
                .contentLength(attachment.getSize())
                .body(resource);
    }
}

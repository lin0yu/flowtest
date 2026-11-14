package com.flowtest.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flowtest.automation.Actions;
import com.flowtest.automation.StepDef;
import com.flowtest.common.BusinessException;
import com.flowtest.common.Dtos.*;
import com.flowtest.domain.Attachment;
import com.flowtest.domain.DomainEnums.CaseStatus;
import com.flowtest.domain.DomainEnums.Priority;
import com.flowtest.domain.Project;
import com.flowtest.domain.TestCase;
import com.flowtest.repo.AttachmentRepository;
import com.flowtest.repo.ProjectRepository;
import com.flowtest.repo.TestCaseRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class TestCaseService {

    private final TestCaseRepository caseRepository;
    private final ProjectRepository projectRepository;
    private final AttachmentRepository attachmentRepository;
    private final StorageService storageService;
    private final StepCodec stepCodec;
    private final NlCompilerService compilerService;
    private final ObjectMapper objectMapper;

    @Transactional(readOnly = true)
    public PageDto<CaseSummaryDto> search(Long projectId, String keyword, String status,
                                          String priority, int page, int size) {
        int p = Math.max(1, page);
        int s = Math.min(Math.max(1, size), 100);
        CaseStatus caseStatus = parseEnum(CaseStatus.class, status, null);
        Priority casePriority = parseEnum(Priority.class, priority, null);
        String kw = keyword == null || keyword.isBlank() ? null : keyword.trim();
        Page<TestCase> result = caseRepository.search(projectId, caseStatus, casePriority, kw,
                PageRequest.of(p - 1, s));
        List<CaseSummaryDto> content = result.getContent().stream().map(this::toSummary).toList();
        return new PageDto<>(content, result.getTotalElements(), p, s);
    }

    @Transactional(readOnly = true)
    public CaseDetailDto get(Long id) {
        return toDetail(find(id));
    }

    @Transactional
    public CaseDetailDto create(CaseSaveRequest request, String username) {
        ensureProject(request.projectId());
        TestCase testCase = new TestCase();
        apply(testCase, request, true);
        testCase.setVersion(1);
        testCase.setCreatedBy(username);
        testCase = caseRepository.save(testCase);
        return toDetail(testCase);
    }

    @Transactional
    public CaseDetailDto update(Long id, CaseSaveRequest request) {
        TestCase testCase = find(id);
        ensureProject(request.projectId());
        apply(testCase, request, false);
        testCase.setVersion(testCase.getVersion() + 1);
        testCase = caseRepository.save(testCase);
        return toDetail(testCase);
    }

    @Transactional
    public void delete(Long id) {
        TestCase testCase = find(id);
        for (Attachment attachment : attachmentRepository.findByCaseIdOrderByCreatedAtDesc(id)) {
            storageService.delete(attachment.getPath());
        }
        attachmentRepository.deleteByCaseId(id);
        caseRepository.delete(testCase);
    }

    @Transactional
    public CaseDetailDto duplicate(Long id) {
        TestCase source = find(id);
        TestCase copy = new TestCase();
        copy.setProjectId(source.getProjectId());
        copy.setName(source.getName() + " 副本");
        copy.setDescription(source.getDescription());
        copy.setNlInput(source.getNlInput());
        copy.setStepsJson(source.getStepsJson());
        copy.setTags(source.getTags());
        copy.setPriority(source.getPriority());
        copy.setStatus(CaseStatus.DRAFT);
        copy.setTimeoutSeconds(source.getTimeoutSeconds());
        copy.setHeadless(source.isHeadless());
        copy.setScreenshotEachStep(source.isScreenshotEachStep());
        copy.setVersion(1);
        copy.setCreatedBy(source.getCreatedBy());
        return toDetail(caseRepository.save(copy));
    }

    @Transactional(readOnly = true)
    public List<AttachmentDto> attachments(Long caseId) {
        find(caseId);
        return attachmentRepository.findByCaseIdOrderByCreatedAtDesc(caseId)
                .stream().map(this::toAttachmentDto).toList();
    }

    @Transactional
    public AttachmentDto upload(Long caseId, MultipartFile file) {
        find(caseId);
        StorageService.StoredFile stored = storageService.storeAttachment(caseId, file);
        Attachment attachment = new Attachment();
        attachment.setCaseId(caseId);
        attachment.setFileName(stored.originalName());
        attachment.setStoredName(stored.storedName());
        attachment.setContentType(stored.contentType());
        attachment.setSize(stored.size());
        attachment.setPath(stored.relativePath());
        return toAttachmentDto(attachmentRepository.save(attachment));
    }

    @Transactional
    public void deleteAttachment(Long attachmentId) {
        Attachment attachment = attachmentRepository.findById(attachmentId)
                .orElseThrow(() -> BusinessException.notFound("附件不存在"));
        storageService.delete(attachment.getPath());
        attachmentRepository.delete(attachment);
    }

    @Transactional(readOnly = true)
    public Attachment findAttachment(Long attachmentId) {
        return attachmentRepository.findById(attachmentId)
                .orElseThrow(() -> BusinessException.notFound("附件不存在"));
    }

    @Transactional(readOnly = true)
    public ExportBundle export(Long projectId) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> BusinessException.notFound("项目不存在"));
        List<TestCase> cases = caseRepository.findByProjectIdOrderByIdAsc(projectId);
        List<ExportCase> exports = cases.stream().map(testCase -> new ExportCase(
                testCase.getName(), testCase.getDescription(), testCase.getNlInput(),
                readStepsQuietly(testCase.getStepsJson()), tagList(testCase.getTags()),
                testCase.getPriority().name(), testCase.getTimeoutSeconds(),
                testCase.isHeadless(), testCase.isScreenshotEachStep())).toList();
        return new ExportBundle(1, Instant.now(), project.getName(), exports);
    }

    @Transactional
    public ImportResult importCases(Long projectId, MultipartFile file) {
        ensureProject(projectId);
        if (file == null || file.isEmpty()) {
            throw new BusinessException("请选择要导入的 JSON 文件");
        }
        List<String> warnings = new ArrayList<>();
        int imported = 0;
        try {
            JsonNode root = objectMapper.readTree(file.getInputStream());
            JsonNode casesNode = root.isArray() ? root : root.path("cases");
            if (!casesNode.isArray()) {
                throw new BusinessException("导入文件格式错误：缺少 cases 数组");
            }
            for (JsonNode node : casesNode) {
                try {
                    ExportCase item = objectMapper.treeToValue(node, ExportCase.class);
                    if (item.name() == null || item.name().isBlank()) {
                        warnings.add("跳过一条没有名称的用例");
                        continue;
                    }
                    TestCase testCase = new TestCase();
                    testCase.setProjectId(projectId);
                    testCase.setName(item.name());
                    testCase.setDescription(item.description());
                    testCase.setNlInput(item.nlInput());
                    List<StepDef> steps = item.steps();
                    if (steps == null || steps.isEmpty()) {
                        if (item.nlInput() == null || item.nlInput().isBlank()) {
                            warnings.add("「" + item.name() + "」没有步骤，已跳过");
                            continue;
                        }
                        steps = compilerService.compile(item.nlInput(), item.name(), false).steps();
                    }
                    testCase.setStepsJson(stepCodec.writeSteps(reindexAndValidate(steps)));
                    testCase.setTags(joinTags(item.tags()));
                    testCase.setPriority(parseEnum(Priority.class, item.priority(), Priority.MEDIUM));
                    testCase.setStatus(CaseStatus.READY);
                    testCase.setTimeoutSeconds(clampTimeout(item.timeoutSeconds()));
                    testCase.setHeadless(item.headless());
                    testCase.setScreenshotEachStep(item.screenshotEachStep());
                    testCase.setVersion(1);
                    testCase.setCreatedBy("import");
                    caseRepository.save(testCase);
                    imported++;
                } catch (Exception e) {
                    warnings.add("导入失败：" + e.getMessage());
                }
            }
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException("导入文件解析失败：" + e.getMessage());
        }
        return new ImportResult(imported, warnings);
    }

    public TestCase find(Long id) {
        return caseRepository.findById(id)
                .orElseThrow(() -> BusinessException.notFound("用例不存在"));
    }

    public CaseSummaryDto toSummary(TestCase testCase) {
        return new CaseSummaryDto(testCase.getId(), testCase.getProjectId(),
                projectName(testCase.getProjectId()), testCase.getName(), testCase.getDescription(),
                readStepsQuietly(testCase.getStepsJson()).size(), tagList(testCase.getTags()),
                testCase.getPriority().name(), testCase.getStatus().name(),
                testCase.getVersion(), testCase.getUpdatedAt());
    }

    public CaseDetailDto toDetail(TestCase testCase) {
        List<AttachmentDto> attachments = attachmentRepository
                .findByCaseIdOrderByCreatedAtDesc(testCase.getId())
                .stream().map(this::toAttachmentDto).toList();
        return new CaseDetailDto(testCase.getId(), testCase.getProjectId(),
                projectName(testCase.getProjectId()), testCase.getName(), testCase.getDescription(),
                testCase.getNlInput(), readStepsQuietly(testCase.getStepsJson()),
                tagList(testCase.getTags()), testCase.getPriority().name(),
                testCase.getStatus().name(), testCase.getTimeoutSeconds(),
                testCase.isHeadless(), testCase.isScreenshotEachStep(), testCase.getVersion(),
                testCase.getCreatedBy(), attachments, testCase.getCreatedAt(), testCase.getUpdatedAt());
    }

    public List<StepDef> stepsOf(TestCase testCase) {
        List<StepDef> steps = readStepsQuietly(testCase.getStepsJson());
        if (steps.isEmpty() && testCase.getNlInput() != null && !testCase.getNlInput().isBlank()) {
            steps = compilerService.compile(testCase.getNlInput(), testCase.getName(), false).steps();
        }
        return steps;
    }

    private void apply(TestCase testCase, CaseSaveRequest request, boolean creating) {
        testCase.setProjectId(request.projectId());
        testCase.setName(request.name().trim());
        testCase.setDescription(request.description());
        testCase.setNlInput(request.nlInput());
        List<StepDef> steps = request.steps();
        if (steps == null || steps.isEmpty()) {
            if (request.nlInput() == null || request.nlInput().isBlank()) {
                throw new BusinessException("请至少添加一个步骤，或输入自然语言描述后自动解析");
            }
            steps = compilerService.compile(request.nlInput(), request.name(), false).steps();
        }
        testCase.setStepsJson(stepCodec.writeSteps(reindexAndValidate(steps)));
        testCase.setTags(joinTags(request.tags()));
        testCase.setPriority(parseEnum(Priority.class, request.priority(), Priority.MEDIUM));
        testCase.setStatus(parseEnum(CaseStatus.class, request.status(),
                creating ? CaseStatus.READY : testCase.getStatus()));
        testCase.setTimeoutSeconds(clampTimeout(request.timeoutSeconds() == null
                ? 20 : request.timeoutSeconds()));
        testCase.setHeadless(request.headless() == null || request.headless());
        testCase.setScreenshotEachStep(request.screenshotEachStep() == null || request.screenshotEachStep());
    }

    private List<StepDef> reindexAndValidate(List<StepDef> steps) {
        List<StepDef> result = new ArrayList<>();
        for (int i = 0; i < steps.size(); i++) {
            StepDef step = steps.get(i);
            String action = step.action();
            if (!Actions.ALL.contains(action)) {
                throw new BusinessException("第 " + (i + 1) + " 个步骤动作不支持：" + action);
            }
            if (Actions.needsSelector(action) && (step.selector() == null || step.selector().isBlank())) {
                throw new BusinessException("第 " + (i + 1) + " 个步骤缺少元素选择器");
            }
            if (Actions.needsValue(action) && (step.value() == null || step.value().isBlank())) {
                throw new BusinessException("第 " + (i + 1) + " 个步骤缺少参数值");
            }
            String description = step.description() == null || step.description().isBlank()
                    ? Actions.LABELS.getOrDefault(action, action) : step.description();
            result.add(new StepDef(i + 1, action, step.selector(), step.value(), description));
        }
        if (result.isEmpty()) {
            throw new BusinessException("测试步骤不能为空");
        }
        return result;
    }

    private List<StepDef> readStepsQuietly(String json) {
        try {
            return stepCodec.readSteps(json);
        } catch (Exception e) {
            return List.of();
        }
    }

    private String projectName(Long projectId) {
        return projectRepository.findById(projectId).map(Project::getName).orElse("已删除项目");
    }

    private void ensureProject(Long projectId) {
        if (!projectRepository.existsById(projectId)) {
            throw BusinessException.notFound("项目不存在");
        }
    }

    private int clampTimeout(Integer timeout) {
        if (timeout == null) {
            return 20;
        }
        return Math.min(Math.max(timeout, 5), 300);
    }

    private String joinTags(List<String> tags) {
        if (tags == null) {
            return "";
        }
        return tags.stream().filter(t -> t != null && !t.isBlank())
                .map(String::trim).distinct().limit(12)
                .collect(Collectors.joining(","));
    }

    private List<String> tagList(String tags) {
        if (tags == null || tags.isBlank()) {
            return List.of();
        }
        return Arrays.stream(tags.split(",")).map(String::trim)
                .filter(t -> !t.isBlank()).toList();
    }

    private AttachmentDto toAttachmentDto(Attachment attachment) {
        return new AttachmentDto(attachment.getId(), attachment.getFileName(),
                attachment.getContentType(), attachment.getSize(), attachment.getCreatedAt());
    }

    private <E extends Enum<E>> E parseEnum(Class<E> type, String value, E fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        try {
            return Enum.valueOf(type, value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            if (fallback != null) {
                return fallback;
            }
            throw new BusinessException("不支持的枚举值：" + value);
        }
    }
}

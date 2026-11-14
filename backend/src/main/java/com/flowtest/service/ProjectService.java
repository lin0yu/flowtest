package com.flowtest.service;

import com.flowtest.common.BusinessException;
import com.flowtest.common.Dtos.ProjectDto;
import com.flowtest.common.Dtos.ProjectRequest;
import com.flowtest.domain.Project;
import com.flowtest.domain.TestEnvironment;
import com.flowtest.repo.EnvironmentRepository;
import com.flowtest.repo.ProjectRepository;
import com.flowtest.repo.TestCaseRepository;
import com.flowtest.repo.TestTaskRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;

@Service
@RequiredArgsConstructor
public class ProjectService {

    private final ProjectRepository projectRepository;
    private final TestCaseRepository caseRepository;
    private final EnvironmentRepository environmentRepository;
    private final TestTaskRepository taskRepository;

    @Transactional(readOnly = true)
    public List<ProjectDto> list() {
        return projectRepository.findAllByOrderByCreatedAtDesc().stream().map(this::toDto).toList();
    }

    @Transactional(readOnly = true)
    public ProjectDto get(Long id) {
        return toDto(find(id));
    }

    @Transactional
    public ProjectDto create(ProjectRequest request) {
        Project project = new Project();
        project.setName(request.name().trim());
        project.setProjectKey(uniqueKey(request.key(), request.name()));
        project.setDescription(request.description());
        project.setColor(defaultColor(request.color()));
        project = projectRepository.save(project);

        TestEnvironment env = new TestEnvironment();
        env.setProjectId(project.getId());
        env.setName("默认环境");
        env.setBaseUrl("http://localhost:8080");
        env.setVariablesJson("{\"basePath\":\"/demo\"}");
        env.setDefaultEnv(true);
        environmentRepository.save(env);
        return toDto(project);
    }

    @Transactional
    public ProjectDto update(Long id, ProjectRequest request) {
        Project project = find(id);
        project.setName(request.name().trim());
        if (request.key() != null && !request.key().isBlank()) {
            String key = normalizeKey(request.key());
            projectRepository.findByProjectKey(key).ifPresent(existing -> {
                if (!existing.getId().equals(id)) {
                    throw new BusinessException("项目标识已存在：" + key);
                }
            });
            project.setProjectKey(key);
        }
        project.setDescription(request.description());
        project.setColor(defaultColor(request.color()));
        return toDto(projectRepository.save(project));
    }

    @Transactional
    public void delete(Long id) {
        Project project = find(id);
        long cases = caseRepository.countByProjectId(id);
        long tasks = taskRepository.countByProjectId(id);
        if (cases > 0 || tasks > 0) {
            throw new BusinessException("项目下仍有 " + cases + " 个用例、" + tasks + " 个任务，请先清理后再删除");
        }
        environmentRepository.deleteAll(environmentRepository.findByProjectIdOrderByIdAsc(id));
        projectRepository.delete(project);
    }

    public Project find(Long id) {
        return projectRepository.findById(id)
                .orElseThrow(() -> BusinessException.notFound("项目不存在"));
    }

    public String projectName(Long id) {
        return projectRepository.findById(id).map(Project::getName).orElse("已删除项目");
    }

    private ProjectDto toDto(Project project) {
        return new ProjectDto(project.getId(), project.getName(), project.getProjectKey(),
                project.getDescription(), project.getColor(),
                caseRepository.countByProjectId(project.getId()),
                environmentRepository.countByProjectId(project.getId()),
                taskRepository.countByProjectId(project.getId()),
                project.getCreatedAt(), project.getUpdatedAt());
    }

    private String uniqueKey(String requested, String name) {
        String base = (requested == null || requested.isBlank()) ? normalizeKey(name) : normalizeKey(requested);
        if (base.isBlank()) {
            base = "PROJECT";
        }
        String key = base;
        int i = 1;
        while (projectRepository.existsByProjectKey(key)) {
            key = base + "_" + i++;
        }
        return key;
    }

    private String normalizeKey(String value) {
        if (value == null) {
            return "";
        }
        String key = value.trim().toUpperCase(Locale.ROOT)
                .replaceAll("[^A-Z0-9_-]", "_")
                .replaceAll("_+", "_");
        return key.length() > 50 ? key.substring(0, 50) : key;
    }

    private String defaultColor(String color) {
        if (color == null || !color.matches("^#[0-9a-fA-F]{6}$")) {
            return "#6366f1";
        }
        return color;
    }
}

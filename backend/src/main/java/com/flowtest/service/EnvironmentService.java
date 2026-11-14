package com.flowtest.service;

import com.flowtest.common.BusinessException;
import com.flowtest.common.Dtos.EnvironmentDto;
import com.flowtest.common.Dtos.EnvironmentRequest;
import com.flowtest.domain.TestEnvironment;
import com.flowtest.repo.EnvironmentRepository;
import com.flowtest.repo.ProjectRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class EnvironmentService {

    private final EnvironmentRepository environmentRepository;
    private final ProjectRepository projectRepository;
    private final StepCodec stepCodec;

    @Transactional(readOnly = true)
    public List<EnvironmentDto> list(Long projectId) {
        return environmentRepository.findByProjectIdOrderByIdAsc(projectId).stream().map(this::toDto).toList();
    }

    @Transactional
    public EnvironmentDto create(EnvironmentRequest request) {
        ensureProject(request.projectId());
        TestEnvironment env = new TestEnvironment();
        apply(env, request);
        if (environmentRepository.findByProjectIdOrderByIdAsc(request.projectId()).isEmpty()) {
            env.setDefaultEnv(true);
        }
        env = environmentRepository.save(env);
        if (env.isDefaultEnv()) {
            clearOtherDefaults(env);
        }
        return toDto(env);
    }

    @Transactional
    public EnvironmentDto update(Long id, EnvironmentRequest request) {
        TestEnvironment env = find(id);
        if (!env.getProjectId().equals(request.projectId())) {
            ensureProject(request.projectId());
        }
        apply(env, request);
        env = environmentRepository.save(env);
        if (env.isDefaultEnv()) {
            clearOtherDefaults(env);
        }
        return toDto(env);
    }

    @Transactional
    public void delete(Long id) {
        TestEnvironment env = find(id);
        boolean wasDefault = env.isDefaultEnv();
        Long projectId = env.getProjectId();
        environmentRepository.delete(env);
        if (wasDefault) {
            List<TestEnvironment> rest = environmentRepository.findByProjectIdOrderByIdAsc(projectId);
            if (!rest.isEmpty()) {
                TestEnvironment first = rest.get(0);
                first.setDefaultEnv(true);
                environmentRepository.save(first);
            }
        }
    }

    @Transactional(readOnly = true)
    public TestEnvironment pick(Long projectId, Long environmentId) {
        if (environmentId != null) {
            TestEnvironment env = find(environmentId);
            if (!env.getProjectId().equals(projectId)) {
                throw new BusinessException("所选环境不属于该项目");
            }
            return env;
        }
        return environmentRepository.findByProjectIdAndDefaultEnvTrue(projectId)
                .or(() -> environmentRepository.findByProjectIdOrderByIdAsc(projectId).stream().findFirst())
                .orElseThrow(() -> new BusinessException("项目尚未配置执行环境，请先在「环境配置」中创建"));
    }

    @Transactional(readOnly = true)
    public Map<String, String> variables(TestEnvironment env) {
        return stepCodec.readVariables(env.getVariablesJson());
    }

    public TestEnvironment find(Long id) {
        return environmentRepository.findById(id)
                .orElseThrow(() -> BusinessException.notFound("环境不存在"));
    }

    public EnvironmentDto toDto(TestEnvironment env) {
        Map<String, String> variables;
        try {
            variables = stepCodec.readVariables(env.getVariablesJson());
        } catch (Exception e) {
            variables = new LinkedHashMap<>();
        }
        return new EnvironmentDto(env.getId(), env.getProjectId(), env.getName(), env.getBaseUrl(),
                variables, env.isDefaultEnv(), env.getCreatedAt());
    }

    private void apply(TestEnvironment env, EnvironmentRequest request) {
        env.setProjectId(request.projectId());
        env.setName(request.name().trim());
        env.setBaseUrl(request.baseUrl() == null ? null : request.baseUrl().trim());
        env.setVariablesJson(stepCodec.writeVariables(
                request.variables() == null ? new LinkedHashMap<>() : request.variables()));
        env.setDefaultEnv(Boolean.TRUE.equals(request.defaultEnv()));
    }

    private void clearOtherDefaults(TestEnvironment env) {
        for (TestEnvironment other : environmentRepository.findByProjectIdOrderByIdAsc(env.getProjectId())) {
            if (!other.getId().equals(env.getId()) && other.isDefaultEnv()) {
                other.setDefaultEnv(false);
                environmentRepository.save(other);
            }
        }
    }

    private void ensureProject(Long projectId) {
        if (!projectRepository.existsById(projectId)) {
            throw BusinessException.notFound("项目不存在");
        }
    }
}

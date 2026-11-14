package com.flowtest.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flowtest.automation.StepDef;
import com.flowtest.common.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class StepCodec {

    private final ObjectMapper objectMapper;

    public List<StepDef> readSteps(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            List<StepDef> steps = objectMapper.readValue(json, new TypeReference<List<StepDef>>() {
            });
            return steps == null ? List.of() : steps;
        } catch (Exception e) {
            throw new BusinessException("步骤数据格式错误：" + e.getMessage());
        }
    }

    public String writeSteps(List<StepDef> steps) {
        try {
            return objectMapper.writeValueAsString(steps == null ? List.of() : steps);
        } catch (Exception e) {
            throw new BusinessException("步骤序列化失败：" + e.getMessage());
        }
    }

    public Map<String, String> readVariables(String json) {
        if (json == null || json.isBlank()) {
            return new LinkedHashMap<>();
        }
        try {
            Map<String, String> map = objectMapper.readValue(json, new TypeReference<LinkedHashMap<String, String>>() {
            });
            return map == null ? new LinkedHashMap<>() : map;
        } catch (Exception e) {
            throw new BusinessException("环境变量 JSON 格式错误：" + e.getMessage());
        }
    }

    public String writeVariables(Map<String, String> variables) {
        try {
            return objectMapper.writeValueAsString(variables == null ? Map.of() : variables);
        } catch (Exception e) {
            throw new BusinessException("环境变量序列化失败：" + e.getMessage());
        }
    }

    public String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            throw new BusinessException("JSON 序列化失败：" + e.getMessage());
        }
    }
}

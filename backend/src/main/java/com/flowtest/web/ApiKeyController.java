package com.flowtest.web;

import com.flowtest.common.Dtos.ApiKeyCreateRequest;
import com.flowtest.common.Dtos.ApiKeyCreateResponse;
import com.flowtest.common.Dtos.ApiKeyDto;
import com.flowtest.common.Dtos.MessageResponse;
import com.flowtest.service.ApiKeyService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/api-keys")
@RequiredArgsConstructor
public class ApiKeyController {

    private final ApiKeyService apiKeyService;

    @GetMapping
    public List<ApiKeyDto> list() {
        return apiKeyService.list();
    }

    @PostMapping
    public ApiKeyCreateResponse create(@Valid @RequestBody ApiKeyCreateRequest request) {
        return apiKeyService.create(request);
    }

    @DeleteMapping("/{id}")
    public MessageResponse delete(@PathVariable Long id) {
        apiKeyService.delete(id);
        return new MessageResponse("API Key 已删除");
    }
}

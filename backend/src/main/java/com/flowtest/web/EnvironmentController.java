package com.flowtest.web;

import com.flowtest.common.Dtos.EnvironmentDto;
import com.flowtest.common.Dtos.EnvironmentRequest;
import com.flowtest.common.Dtos.MessageResponse;
import com.flowtest.service.EnvironmentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/environments")
@RequiredArgsConstructor
public class EnvironmentController {

    private final EnvironmentService environmentService;

    @GetMapping
    public List<EnvironmentDto> list(@RequestParam Long projectId) {
        return environmentService.list(projectId);
    }

    @PostMapping
    public EnvironmentDto create(@Valid @RequestBody EnvironmentRequest request) {
        return environmentService.create(request);
    }

    @PutMapping("/{id}")
    public EnvironmentDto update(@PathVariable Long id, @Valid @RequestBody EnvironmentRequest request) {
        return environmentService.update(id, request);
    }

    @DeleteMapping("/{id}")
    public MessageResponse delete(@PathVariable Long id) {
        environmentService.delete(id);
        return new MessageResponse("环境已删除");
    }
}

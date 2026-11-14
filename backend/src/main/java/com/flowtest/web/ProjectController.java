package com.flowtest.web;

import com.flowtest.common.Dtos.MessageResponse;
import com.flowtest.common.Dtos.ProjectDto;
import com.flowtest.common.Dtos.ProjectRequest;
import com.flowtest.service.ProjectService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/projects")
@RequiredArgsConstructor
public class ProjectController {

    private final ProjectService projectService;

    @GetMapping
    public List<ProjectDto> list() {
        return projectService.list();
    }

    @GetMapping("/{id}")
    public ProjectDto get(@PathVariable Long id) {
        return projectService.get(id);
    }

    @PostMapping
    public ProjectDto create(@Valid @RequestBody ProjectRequest request) {
        return projectService.create(request);
    }

    @PutMapping("/{id}")
    public ProjectDto update(@PathVariable Long id, @Valid @RequestBody ProjectRequest request) {
        return projectService.update(id, request);
    }

    @DeleteMapping("/{id}")
    public MessageResponse delete(@PathVariable Long id) {
        projectService.delete(id);
        return new MessageResponse("项目已删除");
    }
}

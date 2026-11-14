package com.flowtest.web;

import com.flowtest.common.Dtos.*;
import com.flowtest.service.TaskService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/tasks")
@RequiredArgsConstructor
public class TaskController {

    private final TaskService taskService;

    @GetMapping
    public List<TaskDto> list() {
        return taskService.list();
    }

    @PostMapping
    public TaskDto create(@Valid @RequestBody TaskRequest request) {
        return taskService.create(request);
    }

    @PutMapping("/{id}")
    public TaskDto update(@PathVariable Long id, @Valid @RequestBody TaskRequest request) {
        return taskService.update(id, request);
    }

    @DeleteMapping("/{id}")
    public MessageResponse delete(@PathVariable Long id) {
        taskService.delete(id);
        return new MessageResponse("任务已删除");
    }

    @PostMapping("/{id}/trigger")
    public TaskTriggerDto trigger(@PathVariable Long id, Authentication authentication) {
        return taskService.trigger(id, authentication.getName());
    }
}

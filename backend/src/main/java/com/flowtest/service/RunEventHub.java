package com.flowtest.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

@Slf4j
@Service
public class RunEventHub {

    private final Map<Long, CopyOnWriteArrayList<SseEmitter>> emitters = new ConcurrentHashMap<>();

    public SseEmitter subscribe(Long runId) {
        SseEmitter emitter = new SseEmitter(30 * 60 * 1000L);
        emitters.computeIfAbsent(runId, key -> new CopyOnWriteArrayList<>()).add(emitter);
        Runnable cleanup = () -> remove(runId, emitter);
        emitter.onCompletion(cleanup);
        emitter.onTimeout(cleanup);
        emitter.onError(error -> cleanup.run());
        try {
            emitter.send(SseEmitter.event().name("connected")
                    .data(Map.of("runId", runId, "timestamp", System.currentTimeMillis())));
        } catch (IOException e) {
            remove(runId, emitter);
        }
        return emitter;
    }

    public void publish(Long runId, String event, Object data) {
        List<SseEmitter> list = emitters.get(runId);
        if (list == null) {
            return;
        }
        for (SseEmitter emitter : list) {
            try {
                emitter.send(SseEmitter.event().name(event).data(data));
            } catch (Exception e) {
                remove(runId, emitter);
            }
        }
    }

    public void complete(Long runId) {
        List<SseEmitter> list = emitters.remove(runId);
        if (list == null) {
            return;
        }
        for (SseEmitter emitter : list) {
            try {
                emitter.complete();
            } catch (Exception ignored) {
            }
        }
    }

    private void remove(Long runId, SseEmitter emitter) {
        List<SseEmitter> list = emitters.get(runId);
        if (list != null) {
            list.remove(emitter);
            if (list.isEmpty()) {
                emitters.remove(runId, list);
            }
        }
    }
}

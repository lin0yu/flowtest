package com.flowtest.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.ThreadPoolExecutor;

@Configuration
public class AsyncConfig {

    @Bean(name = "runExecutor")
    public ThreadPoolTaskExecutor runExecutor(@Value("${flowtest.engine.max-parallel:3}") int maxParallel) {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(Math.max(1, Math.min(2, maxParallel)));
        executor.setMaxPoolSize(Math.max(1, maxParallel));
        executor.setQueueCapacity(200);
        executor.setThreadNamePrefix("flowtest-run-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.AbortPolicy());
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(20);
        executor.initialize();
        return executor;
    }
}

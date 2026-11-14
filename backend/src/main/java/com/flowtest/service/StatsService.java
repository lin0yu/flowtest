package com.flowtest.service;

import com.flowtest.common.Dtos.*;
import com.flowtest.domain.DomainEnums.RunStatus;
import com.flowtest.domain.TestRun;
import com.flowtest.repo.ProjectRepository;
import com.flowtest.repo.TestCaseRepository;
import com.flowtest.repo.TestRunRepository;
import com.flowtest.repo.TestTaskRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class StatsService {

    private final ProjectRepository projectRepository;
    private final TestCaseRepository caseRepository;
    private final TestTaskRepository taskRepository;
    private final TestRunRepository runRepository;
    private final RunService runService;

    public StatsOverview overview() {
        Instant from = Instant.now().minusSeconds(7 * 24 * 3600L);
        List<TestRun> runs = runRepository.findByCreatedAtAfterOrderByCreatedAtAsc(from);
        long total7d = runs.size();
        long passed = runs.stream().filter(r -> r.getStatus() == RunStatus.PASSED).count();
        long failed = runs.stream().filter(r -> r.getStatus() == RunStatus.FAILED).count();
        double passRate = passed + failed == 0 ? 0
                : Math.round(passed * 1000.0 / (passed + failed)) / 10.0;
        long avgDuration = Math.round(runs.stream()
                .filter(r -> r.getDurationMs() != null)
                .mapToLong(TestRun::getDurationMs).average().orElse(0));
        long active = runRepository.countByStatus(RunStatus.RUNNING)
                + runRepository.countByStatus(RunStatus.QUEUED);

        ZoneId zone = ZoneId.systemDefault();
        LocalDate today = LocalDate.now(zone);
        Map<LocalDate, long[]> byDay = new LinkedHashMap<>();
        for (int i = 6; i >= 0; i--) {
            byDay.put(today.minusDays(i), new long[3]);
        }
        for (TestRun run : runs) {
            LocalDate day = run.getCreatedAt().atZone(zone).toLocalDate();
            long[] counts = byDay.get(day);
            if (counts == null) {
                continue;
            }
            counts[0]++;
            if (run.getStatus() == RunStatus.PASSED) {
                counts[1]++;
            } else if (run.getStatus() == RunStatus.FAILED) {
                counts[2]++;
            }
        }
        List<TrendPoint> trend = new ArrayList<>();
        byDay.forEach((day, counts) -> trend.add(new TrendPoint(
                day.getMonthValue() + "-" + String.format("%02d", day.getDayOfMonth()),
                counts[0], counts[1], counts[2])));

        List<RunDto> recent = runRepository.findTop10ByOrderByCreatedAtDesc().stream()
                .limit(6).map(runService::toDto).toList();

        Map<String, Long> failCounts = runRepository
                .findTop200ByStatusOrderByCreatedAtDesc(RunStatus.FAILED).stream()
                .collect(Collectors.groupingBy(TestRun::getCaseName, Collectors.counting()));
        List<FailingCase> failing = failCounts.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .limit(5)
                .map(e -> new FailingCase(e.getKey(), e.getValue()))
                .toList();

        return new StatsOverview(
                projectRepository.count(),
                caseRepository.count(),
                taskRepository.count(),
                runRepository.count(),
                total7d, passRate, avgDuration, active,
                trend, recent, failing);
    }
}

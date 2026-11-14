package com.flowtest.config;

import com.flowtest.automation.StepDef;
import com.flowtest.common.Dtos.CompileResult;
import com.flowtest.domain.*;
import com.flowtest.domain.DomainEnums.CaseStatus;
import com.flowtest.domain.DomainEnums.Priority;
import com.flowtest.repo.*;
import com.flowtest.service.NlCompilerService;
import com.flowtest.service.StepCodec;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Component
@RequiredArgsConstructor
public class DemoDataSeeder implements CommandLineRunner {

    private final UserRepository userRepository;
    private final ProjectRepository projectRepository;
    private final EnvironmentRepository environmentRepository;
    private final TestCaseRepository caseRepository;
    private final TestTaskRepository taskRepository;
    private final PasswordEncoder passwordEncoder;
    private final NlCompilerService compilerService;
    private final StepCodec stepCodec;

    @Value("${flowtest.demo.seed:true}")
    private boolean seedDemo;

    @Override
    public void run(String... args) {
        if (userRepository.findByUsername("admin").isEmpty()) {
            User admin = new User();
            admin.setUsername("admin");
            admin.setPasswordHash(passwordEncoder.encode("admin123"));
            admin.setDisplayName("平台管理员");
            admin.setRole("ADMIN");
            admin.setEnabled(true);
            userRepository.save(admin);
            log.info("Seeded default admin: admin / admin123");
        }
        if (seedDemo && projectRepository.findByProjectKey("FLOWSHOP").isEmpty()) {
            seedFlowShopDemo();
        }
    }

    private void seedFlowShopDemo() {
        Project project = new Project();
        project.setName("FlowShop 演示项目");
        project.setProjectKey("FLOWSHOP");
        project.setDescription("内置演示商城，覆盖登录、搜索、加购、断言与截图全链路，无需外网。");
        project.setColor("#6366f1");
        project = projectRepository.save(project);

        TestEnvironment env = new TestEnvironment();
        env.setProjectId(project.getId());
        env.setName("本地演示环境");
        env.setBaseUrl("http://localhost:8080");
        env.setVariablesJson("{\"demoUser\":\"admin\",\"demoPassword\":\"admin123\"}");
        env.setDefaultEnv(true);
        env = environmentRepository.save(env);

        TestCase loginCase = createCase(project.getId(),
                "登录 · 搜索 · 加购全链路",
                "验证从登录到搜索商品、加入购物车、购物车数量更新的完整链路。",
                """
                打开 /demo/index.html
                断言标题包含 FlowShop
                在 #username 输入 ${demoUser}
                在 #password 输入 ${demoPassword}
                点击 #login-btn
                断言文本包含 欢迎回来，admin
                在 #search 输入 机械键盘
                点击 #search-btn
                断言元素 [data-testid='product-101'] 可见
                点击 [data-testid='add-101']
                断言元素 #cart-count 的值为 1
                截图 登录并加购完成
                """,
                Priority.HIGH, "smoke,login,cart");

        TestCase cartCase = createCase(project.getId(),
                "搜索商品并校验购物车数量",
                "搜索显示器并连续加购两次，验证过滤结果和购物车计数。",
                """
                打开 /demo/index.html
                在 #search 输入 显示器
                点击 #search-btn
                断言元素 [data-testid='product-102'] 可见
                点击 [data-testid='add-102']
                点击 [data-testid='add-102']
                断言元素 #cart-count 的值为 2
                截图 搜索与购物车校验
                """,
                Priority.MEDIUM, "smoke,cart");

        TestTask task = new TestTask();
        task.setProjectId(project.getId());
        task.setEnvironmentId(env.getId());
        task.setName("每日回归 · FlowShop");
        task.setDescription("每天 09:30 自动执行演示项目核心链路，失败自动重试 1 次。");
        task.setCaseIds(List.of(loginCase.getId(), cartCase.getId()).stream()
                .map(String::valueOf).collect(Collectors.joining(",")));
        task.setCronExpression("0 30 9 * * *");
        task.setEnabled(true);
        task.setRetryCount(1);
        task.setTimeoutSeconds(20);
        task.setNextRunAt(nextRun(task.getCronExpression()));
        taskRepository.save(task);

        log.info("Seeded FlowShop demo project: projectId={}, envId={}, caseIds=[{}, {}]",
                project.getId(), env.getId(), loginCase.getId(), cartCase.getId());
    }

    private TestCase createCase(Long projectId, String name, String description, String nl,
                                Priority priority, String tags) {
        CompileResult compiled = compilerService.compile(nl, name, false);
        if (!compiled.warnings().isEmpty()) {
            log.warn("Demo case compiler warnings: {}", compiled.warnings());
        }
        TestCase testCase = new TestCase();
        testCase.setProjectId(projectId);
        testCase.setName(name);
        testCase.setDescription(description);
        testCase.setNlInput(nl);
        testCase.setStepsJson(stepCodec.writeSteps(compiled.steps()));
        testCase.setTags(tags);
        testCase.setPriority(priority);
        testCase.setStatus(CaseStatus.READY);
        testCase.setTimeoutSeconds(20);
        testCase.setHeadless(true);
        testCase.setScreenshotEachStep(true);
        testCase.setVersion(1);
        testCase.setCreatedBy("seed");
        return caseRepository.save(testCase);
    }

    private Instant nextRun(String cron) {
        ZonedDateTime next = CronExpression.parse(cron).next(ZonedDateTime.now(ZoneId.systemDefault()));
        return next == null ? null : next.toInstant();
    }
}

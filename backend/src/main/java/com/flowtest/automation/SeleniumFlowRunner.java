package com.flowtest.automation;

import lombok.extern.slf4j.Slf4j;
import org.openqa.selenium.*;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeDriverService;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.support.ui.Select;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * 基于 Selenium + 本机 Chrome 的步骤执行器。每个 TestRun 独立实例、独立浏览器进程。
 */
@Slf4j
public class SeleniumFlowRunner implements AutoCloseable {

    private static final Pattern VAR_PATTERN = Pattern.compile("\\$\\{([^}]+)}");

    private final boolean headless;
    private final int timeoutSeconds;
    private final String baseUrl;
    private final Map<String, String> variables;
    private final Map<String, Path> uploadFiles;
    private final WebDriver driver;

    public SeleniumFlowRunner(boolean headless, int timeoutSeconds, String baseUrl,
                              Map<String, String> variables, Map<String, Path> uploadFiles) {
        this.headless = headless;
        this.timeoutSeconds = Math.max(5, timeoutSeconds);
        this.baseUrl = baseUrl;
        this.variables = variables == null ? Map.of() : new LinkedHashMap<>(variables);
        this.uploadFiles = uploadFiles == null ? Map.of() : new LinkedHashMap<>(uploadFiles);
        this.driver = createDriver();
    }

    public record StepOutcome(String status, String message, String expectedValue,
                              String actualValue, byte[] screenshot, long durationMs) {
    }

    private WebDriver createDriver() {
        ChromeOptions options = new ChromeOptions();
        if (headless) {
            options.addArguments("--headless=new");
        }
        options.addArguments(
                "--window-size=1440,960",
                "--disable-gpu",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--hide-scrollbars",
                "--force-device-scale-factor=1",
                "--disable-search-engine-choice-screen",
                "--no-first-run",
                "--no-default-browser-check",
                "--lang=zh-CN"
        );
        options.setPageLoadStrategy(PageLoadStrategy.NORMAL);
        ChromeDriverService service = resolveCachedChromeDriverService();
        WebDriver webDriver = service == null ? new ChromeDriver(options) : new ChromeDriver(service, options);
        webDriver.manage().timeouts().pageLoadTimeout(Duration.ofSeconds(Math.max(20, timeoutSeconds)));
        webDriver.manage().timeouts().scriptTimeout(Duration.ofSeconds(15));
        try {
            webDriver.manage().window().setSize(new Dimension(1440, 960));
        } catch (Exception ignored) {
        }
        return webDriver;
    }

    /**
     * 优先复用 Selenium Manager 已经缓存下来的同版本 ChromeDriver。
     * ChromeDriver 缓存存在时不再让 Selenium Manager 联网校验，单次执行可节省几十秒。
     */
    private ChromeDriverService resolveCachedChromeDriverService() {
        try {
            String explicit = firstNonBlank(
                    System.getProperty("webdriver.chrome.driver"),
                    System.getenv("FLOWTEST_CHROMEDRIVER"),
                    System.getenv("CHROMEDRIVER"));
            if (explicit != null) {
                Path driver = Path.of(explicit);
                if (Files.isExecutable(driver)) {
                    log.info("使用指定的 ChromeDriver：{}", driver);
                    return new ChromeDriverService.Builder().usingDriverExecutable(driver.toFile()).build();
                }
                log.warn("指定的 ChromeDriver 不可执行，将尝试自动发现：{}", explicit);
            }

            Path cache = Path.of(System.getProperty("user.home"), ".cache", "selenium", "chromedriver");
            if (!Files.isDirectory(cache)) {
                return null;
            }
            String chromeMajor = detectChromeMajor();
            Path driver = findCachedDriver(cache, chromeMajor);
            if (driver == null) {
                return null;
            }
            log.info("复用缓存 ChromeDriver：{}（Chrome 主版本 {}）", driver, chromeMajor == null ? "未知" : chromeMajor);
            return new ChromeDriverService.Builder().usingDriverExecutable(driver.toFile()).build();
        } catch (Exception e) {
            log.warn("ChromeDriver 缓存探测失败，回退 Selenium Manager：{}", e.getMessage());
            return null;
        }
    }

    private Path findCachedDriver(Path cache, String chromeMajor) {
        try (Stream<Path> stream = Files.walk(cache, 4)) {
            List<Path> drivers = stream
                    .filter(Files::isRegularFile)
                    .filter(Files::isExecutable)
                    .filter(path -> {
                        String name = path.getFileName().toString();
                        return name.equals("chromedriver") || name.equals("chromedriver.exe");
                    })
                    .sorted(Comparator.comparingLong(this::lastModified).reversed())
                    .toList();
            if (drivers.isEmpty()) {
                return null;
            }
            if (chromeMajor != null) {
                for (Path driver : drivers) {
                    if (versionSegmentMatches(driver, chromeMajor)) {
                        return driver;
                    }
                }
                log.info("缓存中没有与 Chrome {} 主版本匹配的驱动，回退 Selenium Manager", chromeMajor);
                return null;
            }
            return drivers.get(0);
        } catch (Exception e) {
            log.debug("扫描 ChromeDriver 缓存失败：{}", e.getMessage());
            return null;
        }
    }

    private boolean versionSegmentMatches(Path driver, String major) {
        for (Path segment : driver) {
            if (segment.toString().startsWith(major + ".")) {
                return true;
            }
        }
        return false;
    }

    private long lastModified(Path path) {
        try {
            return Files.getLastModifiedTime(path).toMillis();
        } catch (Exception e) {
            return 0L;
        }
    }

    private String detectChromeMajor() {
        List<String> candidates = new ArrayList<>();
        String configured = System.getenv("FLOWTEST_CHROME_BINARY");
        if (configured != null && !configured.isBlank()) {
            candidates.add(configured);
        }
        if (System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("mac")) {
            candidates.add("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
            candidates.add("/Applications/Chromium.app/Contents/MacOS/Chromium");
        } else if (System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win")) {
            candidates.add("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
            candidates.add("C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe");
        } else {
            candidates.add("/usr/bin/google-chrome");
            candidates.add("/usr/bin/google-chrome-stable");
            candidates.add("/usr/bin/chromium");
            candidates.add("/usr/bin/chromium-browser");
        }

        for (String candidate : candidates) {
            try {
                Path binary = Path.of(candidate);
                if (!Files.isExecutable(binary)) {
                    continue;
                }
                Process process = new ProcessBuilder(candidate, "--version").redirectErrorStream(true).start();
                if (!process.waitFor(3, TimeUnit.SECONDS)) {
                    process.destroyForcibly();
                    continue;
                }
                try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                    String line = reader.readLine();
                    if (line == null) {
                        continue;
                    }
                    Matcher matcher = Pattern.compile("(\\d+)\\.").matcher(line);
                    if (matcher.find()) {
                        return matcher.group(1);
                    }
                }
            } catch (Exception e) {
                log.debug("检测 Chrome 版本失败 {}：{}", candidate, e.getMessage());
            }
        }
        return null;
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }

    public String browserInfo() {
        try {
            var capabilities = ((HasCapabilities) driver).getCapabilities();
            return capabilities.getBrowserName() + " " + capabilities.getBrowserVersion();
        } catch (Exception e) {
            return "Chrome";
        }
    }

    public StepOutcome execute(StepDef step, boolean screenshotEachStep) {
        long start = System.currentTimeMillis();
        boolean screenshotAction = Actions.SCREENSHOT.equals(step.action());
        try {
            String message = perform(step);
            byte[] shot = (screenshotEachStep || screenshotAction) ? screenshotQuietly() : null;
            return new StepOutcome("PASSED", message, null, null, shot,
                    System.currentTimeMillis() - start);
        } catch (AssertionFailure failure) {
            return new StepOutcome("FAILED", failure.getMessage(), failure.expected, failure.actual,
                    screenshotQuietly(), System.currentTimeMillis() - start);
        } catch (Exception e) {
            String message = "执行失败：" + rootMessage(e);
            return new StepOutcome("ERROR", message, null, null,
                    screenshotQuietly(), System.currentTimeMillis() - start);
        }
    }

    private String perform(StepDef step) {
        switch (step.action()) {
            case Actions.GOTO -> {
                String url = resolveUrl(step.value());
                driver.get(url);
                String title = safeTitle();
                return "页面已打开：" + url + (title.isBlank() ? "" : "（" + title + "）");
            }
            case Actions.CLICK -> {
                WebElement element = findElement(step.selector(), true);
                click(element);
                return "已点击 " + step.selector();
            }
            case Actions.FILL -> {
                WebElement element = findElement(step.selector(), false);
                element.clear();
                element.sendKeys(substitute(step.value()));
                return "已在 " + step.selector() + " 输入内容";
            }
            case Actions.PRESS -> {
                String key = pressKey(step.value());
                if (step.selector() == null || step.selector().isBlank()) {
                    try {
                        driver.switchTo().activeElement().sendKeys(key);
                    } catch (Exception e) {
                        driver.findElement(By.tagName("body")).sendKeys(key);
                    }
                    return "已按键 " + step.value();
                }
                WebElement element = findElement(step.selector(), true);
                element.sendKeys(key);
                return "已在 " + step.selector() + " 按下 " + step.value();
            }
            case Actions.SELECT -> {
                WebElement element = findElement(step.selector(), false);
                Select select = new Select(element);
                String value = substitute(step.value());
                try {
                    select.selectByVisibleText(value);
                } catch (NoSuchElementException e) {
                    select.selectByValue(value);
                }
                return "已选择 " + value;
            }
            case Actions.HOVER -> {
                WebElement element = findElement(step.selector(), false);
                new org.openqa.selenium.interactions.Actions(driver).moveToElement(element).perform();
                return "已悬停 " + step.selector();
            }
            case Actions.CHECK -> {
                WebElement element = findElement(step.selector(), true);
                if (!element.isSelected()) {
                    click(element);
                }
                return "已勾选 " + step.selector();
            }
            case Actions.UNCHECK -> {
                WebElement element = findElement(step.selector(), true);
                if (element.isSelected()) {
                    click(element);
                }
                return "已取消勾选 " + step.selector();
            }
            case Actions.SCROLL -> {
                WebElement element = findElement(step.selector(), false);
                scrollIntoView(element);
                return "已滚动到 " + step.selector();
            }
            case Actions.WAIT -> {
                long ms = parseWait(step.value());
                sleepQuietly(ms);
                return "已等待 " + ms + " 毫秒";
            }
            case Actions.WAIT_FOR -> {
                List<By> bys = toBys(step.selector());
                String state = substitute(step.value()).toLowerCase(Locale.ROOT);
                if (state.contains("hidden") || state.contains("隐藏") || state.contains("消失")) {
                    waitHidden(bys);
                    return "元素已隐藏：" + step.selector();
                }
                find(bys, step.selector(), Math.min(timeoutSeconds, 15), false);
                return "元素已可见：" + step.selector();
            }
            case Actions.UPLOAD -> {
                Path file = resolveUpload(step.value());
                WebElement element = findElement(step.selector(), false);
                element.sendKeys(file.toAbsolutePath().toString());
                return "已上传文件 " + file.getFileName();
            }
            case Actions.SCREENSHOT -> {
                return "已截图" + (step.value() == null ? "" : "：" + step.value());
            }
            case Actions.ASSERT_TEXT -> {
                assertText(step.value());
                return "断言通过：页面文本包含 " + step.value();
            }
            case Actions.ASSERT_TITLE -> {
                assertTitle(step.value());
                return "断言通过：页面标题包含 " + step.value();
            }
            case Actions.ASSERT_URL -> {
                assertUrl(step.value());
                return "断言通过：当前地址包含 " + step.value();
            }
            case Actions.ASSERT_VISIBLE -> {
                findElement(step.selector(), false);
                return "断言通过：元素可见 " + step.selector();
            }
            case Actions.ASSERT_HIDDEN -> {
                waitHidden(toBys(step.selector()));
                return "断言通过：元素隐藏 " + step.selector();
            }
            case Actions.ASSERT_VALUE -> {
                assertValue(step);
                return "断言通过：" + step.selector() + " 的值包含 " + step.value();
            }
            case Actions.ASSERT_COUNT -> {
                assertCount(step);
                return "断言通过：" + step.selector() + " 的数量为 " + step.value();
            }
            default -> throw new IllegalArgumentException("不支持的动作：" + step.action());
        }
    }

    // ---------- assertions ----------

    private void assertText(String rawExpected) {
        String expected = substitute(rawExpected);
        String actual = "";
        long deadline = System.currentTimeMillis() + assertionTimeoutMs();
        while (System.currentTimeMillis() < deadline) {
            try {
                actual = driver.findElement(By.tagName("body")).getText();
            } catch (Exception ignored) {
                actual = "";
            }
            if (actual.contains(expected)) {
                return;
            }
            sleepQuietly(200);
        }
        throw new AssertionFailure("断言失败：页面文本未包含「" + expected + "」",
                expected, truncate(actual, 1200));
    }

    private void assertTitle(String rawExpected) {
        String expected = substitute(rawExpected);
        String actual = "";
        long deadline = System.currentTimeMillis() + assertionTimeoutMs();
        while (System.currentTimeMillis() < deadline) {
            actual = safeTitle();
            if (actual.contains(expected)) {
                return;
            }
            sleepQuietly(200);
        }
        throw new AssertionFailure("断言失败：页面标题未包含「" + expected + "」",
                expected, actual);
    }

    private void assertUrl(String rawExpected) {
        String expected = substitute(rawExpected);
        String actual = "";
        long deadline = System.currentTimeMillis() + assertionTimeoutMs();
        while (System.currentTimeMillis() < deadline) {
            actual = driver.getCurrentUrl();
            if (actual.contains(expected)) {
                return;
            }
            sleepQuietly(200);
        }
        throw new AssertionFailure("断言失败：当前地址未包含「" + expected + "」", expected, actual);
    }

    private void assertValue(StepDef step) {
        String expected = substitute(step.value());
        String actual = "";
        long deadline = System.currentTimeMillis() + assertionTimeoutMs();
        while (System.currentTimeMillis() < deadline) {
            try {
                WebElement element = findElement(step.selector(), false, 1);
                actual = element.getAttribute("value");
                if (actual == null) {
                    actual = element.getText();
                }
                if (actual != null && actual.contains(expected)) {
                    return;
                }
            } catch (Exception ignored) {
            }
            sleepQuietly(200);
        }
        throw new AssertionFailure("断言失败：" + step.selector() + " 的值未包含「" + expected + "」",
                expected, truncate(actual, 1200));
    }

    private void assertCount(StepDef step) {
        int expected;
        try {
            expected = Integer.parseInt(substitute(step.value()).trim());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("断言数量必须是整数：" + step.value());
        }
        List<By> bys = toBys(step.selector());
        int actual = -1;
        long deadline = System.currentTimeMillis() + assertionTimeoutMs();
        while (System.currentTimeMillis() < deadline) {
            actual = driver.findElements(bys.get(0)).size();
            if (actual == expected) {
                return;
            }
            sleepQuietly(200);
        }
        throw new AssertionFailure("断言失败：" + step.selector() + " 的数量期望 " + expected + "，实际 " + actual,
                String.valueOf(expected), String.valueOf(actual));
    }

    private void waitHidden(List<By> bys) {
        long deadline = System.currentTimeMillis() + timeoutSeconds * 1000L;
        while (System.currentTimeMillis() < deadline) {
            if (!anyDisplayed(bys)) {
                return;
            }
            sleepQuietly(200);
        }
        throw new AssertionFailure("元素在超时时间内仍然可见", "hidden", "visible");
    }

    private boolean anyDisplayed(List<By> bys) {
        for (By by : bys) {
            try {
                for (WebElement element : driver.findElements(by)) {
                    try {
                        if (element.isDisplayed()) {
                            return true;
                        }
                    } catch (StaleElementReferenceException ignored) {
                    }
                }
            } catch (Exception ignored) {
            }
        }
        return false;
    }

    private long assertionTimeoutMs() {
        return Math.min(Math.max(3, timeoutSeconds), 8) * 1000L;
    }

    // ---------- element location ----------

    private WebElement findElement(String selector, boolean clickable) {
        return findElement(selector, clickable, Math.min(timeoutSeconds, 15));
    }

    private WebElement findElement(String selector, boolean clickable, int timeout) {
        return find(toBys(selector), selector, timeout, clickable);
    }

    private WebElement find(List<By> bys, String selector, int timeout, boolean clickable) {
        long deadline = System.currentTimeMillis() + Math.max(1, timeout) * 1000L;
        String invalid = null;
        while (System.currentTimeMillis() < deadline) {
            for (By by : bys) {
                try {
                    List<WebElement> elements = driver.findElements(by);
                    for (WebElement element : elements) {
                        try {
                            if (element.isDisplayed() && (!clickable || element.isEnabled())) {
                                return element;
                            }
                        } catch (StaleElementReferenceException ignored) {
                        }
                    }
                } catch (InvalidSelectorException e) {
                    invalid = e.getMessage();
                } catch (Exception ignored) {
                }
            }
            sleepQuietly(200);
        }
        if (invalid != null) {
            throw new IllegalArgumentException("选择器不合法：" + selector + "（" + invalid + "）");
        }
        throw new NoSuchElementException("未找到可见元素：" + selector);
    }

    private List<By> toBys(String rawSelector) {
        if (rawSelector == null || rawSelector.isBlank()) {
            throw new IllegalArgumentException("步骤缺少元素选择器");
        }
        String selector = substitute(rawSelector).trim();
        if (selector.startsWith("xpath=")) {
            return List.of(By.xpath(selector.substring(6)));
        }
        if (selector.startsWith("css=")) {
            return List.of(By.cssSelector(selector.substring(4)));
        }
        if (selector.startsWith("id=")) {
            return List.of(By.id(selector.substring(3)));
        }
        if (selector.startsWith("name=")) {
            return List.of(By.name(selector.substring(5)));
        }
        if (selector.startsWith("text=")) {
            String text = selector.substring(5).trim();
            String literal = xpathLiteral(text);
            List<By> bys = new ArrayList<>();
            bys.add(By.xpath("//*[self::button or self::a or @role='button'][normalize-space(.)=" + literal + "]"));
            bys.add(By.xpath("//*[normalize-space(text())=" + literal + "]"));
            bys.add(By.xpath("//*[self::button or self::a or @role='button'][contains(normalize-space(.), " + literal + ")]"));
            bys.add(By.xpath("//*[contains(normalize-space(.), " + literal + ") and not(.//*[contains(normalize-space(.), " + literal + ")])]"));
            return bys;
        }
        if (selector.startsWith("data-testid=")) {
            String value = selector.substring("data-testid=".length());
            return List.of(By.cssSelector("[data-testid=" + cssLiteral(value) + "]"));
        }
        if (selector.startsWith("placeholder=")) {
            String value = selector.substring("placeholder=".length());
            return List.of(
                    By.cssSelector("[placeholder*=" + cssLiteral(value) + "]"),
                    By.cssSelector("[aria-label*=" + cssLiteral(value) + "]")
            );
        }
        if (selector.startsWith("//") || selector.startsWith("(//")) {
            return List.of(By.xpath(selector));
        }
        if (selector.startsWith("#") || selector.startsWith(".") || selector.startsWith("[")
                || selector.startsWith("*") || selector.contains(">") || selector.contains(" ")
                || selector.matches("^[a-zA-Z][\\w-]*(\\[.*])+.*$")) {
            return List.of(By.cssSelector(selector));
        }
        // 兜底：纯文本
        return toBys("text=" + selector);
    }

    private String xpathLiteral(String value) {
        if (!value.contains("'")) {
            return "'" + value + "'";
        }
        if (!value.contains("\"")) {
            return "\"" + value + "\"";
        }
        return "concat('" + value.replace("'", "',\"'\",'") + "')";
    }

    private String cssLiteral(String value) {
        return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'";
    }

    private void click(WebElement element) {
        scrollIntoView(element);
        try {
            element.click();
        } catch (WebDriverException e) {
            try {
                ((JavascriptExecutor) driver).executeScript("arguments[0].click();", element);
            } catch (Exception jsError) {
                throw new WebDriverException("元素点击失败：" + rootMessage(jsError), jsError);
            }
        }
    }

    private void scrollIntoView(WebElement element) {
        try {
            ((JavascriptExecutor) driver).executeScript(
                    "arguments[0].scrollIntoView({block:'center', inline:'center'});", element);
            sleepQuietly(120);
        } catch (Exception ignored) {
        }
    }

    // ---------- helpers ----------

    private String resolveUrl(String rawUrl) {
        String url = substitute(rawUrl).trim();
        if (url.startsWith("http://") || url.startsWith("https://")) {
            return url;
        }
        String base = baseUrl == null ? "" : substitute(baseUrl).trim();
        if (base.isEmpty()) {
            throw new IllegalArgumentException("当前环境未配置 Base URL，无法访问相对地址：" + url);
        }
        if (base.endsWith("/") && url.startsWith("/")) {
            return base.substring(0, base.length() - 1) + url;
        }
        if (!base.endsWith("/") && !url.startsWith("/")) {
            return base + "/" + url;
        }
        return base + url;
    }

    private Path resolveUpload(String rawValue) {
        String value = substitute(rawValue).trim();
        Path direct = uploadFiles.get(value);
        if (direct == null) {
            String filename = Path.of(value).getFileName().toString();
            direct = uploadFiles.get(filename);
        }
        if (direct == null) {
            throw new IllegalArgumentException("未找到附件「" + value + "」，请先在用例附件中上传文件");
        }
        if (!Files.exists(direct)) {
            throw new IllegalArgumentException("附件文件不存在：" + direct);
        }
        return direct;
    }

    private String substitute(String raw) {
        if (raw == null) {
            return "";
        }
        Matcher matcher = VAR_PATTERN.matcher(raw);
        StringBuilder sb = new StringBuilder();
        while (matcher.find()) {
            String key = matcher.group(1);
            if (!variables.containsKey(key)) {
                throw new IllegalArgumentException("环境变量未定义：${" + key + "}");
            }
            matcher.appendReplacement(sb, Matcher.quoteReplacement(String.valueOf(variables.get(key))));
        }
        matcher.appendTail(sb);
        return sb.toString();
    }

    private String pressKey(String raw) {
        String key = substitute(raw).trim();
        String upper = key.toUpperCase(Locale.ROOT);
        Map<String, String> aliases = Map.ofEntries(
                Map.entry("回车", "RETURN"), Map.entry("ENTER", "RETURN"), Map.entry("确定", "RETURN"),
                Map.entry("制表符", "TAB"), Map.entry("TAB", "TAB"),
                Map.entry("空格", "SPACE"), Map.entry("SPACE", "SPACE"),
                Map.entry("ESC", "ESCAPE"), Map.entry("ESCAPE", "ESCAPE"),
                Map.entry("下箭头", "ARROW_DOWN"), Map.entry("ARROW_DOWN", "ARROW_DOWN"),
                Map.entry("上箭头", "ARROW_UP"), Map.entry("ARROW_UP", "ARROW_UP"),
                Map.entry("左箭头", "ARROW_LEFT"), Map.entry("右箭头", "ARROW_RIGHT")
        );
        String mapped = aliases.get(key);
        if (mapped == null) {
            mapped = aliases.get(upper);
        }
        if (mapped != null) {
            return Keys.valueOf(mapped).toString();
        }
        return key;
    }

    private long parseWait(String raw) {
        String value = substitute(raw).trim().toLowerCase(Locale.ROOT);
        if (value.endsWith("ms")) {
            value = value.substring(0, value.length() - 2).trim();
        } else if (value.endsWith("秒")) {
            return (long) (Double.parseDouble(value.substring(0, value.length() - 1).trim()) * 1000);
        } else if (value.endsWith("s")) {
            return (long) (Double.parseDouble(value.substring(0, value.length() - 1).trim()) * 1000);
        }
        long ms;
        try {
            ms = Math.round(Double.parseDouble(value));
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("等待时长不合法：" + raw);
        }
        return Math.min(ms, 30_000L);
    }

    private String safeTitle() {
        try {
            return driver.getTitle();
        } catch (Exception e) {
            return "";
        }
    }

    private byte[] screenshotQuietly() {
        try {
            return ((TakesScreenshot) driver).getScreenshotAs(OutputType.BYTES);
        } catch (Exception e) {
            log.debug("Screenshot failed: {}", e.getMessage());
            return null;
        }
    }

    private void sleepQuietly(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("执行被中断");
        }
    }

    private String truncate(String value, int max) {
        if (value == null) {
            return "";
        }
        String normalized = value.replaceAll("\\s+", " ").trim();
        return normalized.length() <= max ? normalized : normalized.substring(0, max) + "…";
    }

    private String rootMessage(Throwable e) {
        Throwable current = e;
        while (current.getCause() != null && current.getCause() != current) {
            current = current.getCause();
        }
        String message = current.getMessage();
        if (message == null || message.isBlank()) {
            message = e.getClass().getSimpleName();
        }
        message = message.replaceAll("\\s+", " ").trim();
        return message.length() > 400 ? message.substring(0, 400) + "…" : message;
    }

    @Override
    public void close() {
        try {
            driver.quit();
        } catch (Exception e) {
            log.debug("Quit driver failed: {}", e.getMessage());
        }
    }

    private static class AssertionFailure extends RuntimeException {
        private final String expected;
        private final String actual;

        AssertionFailure(String message, String expected, String actual) {
            super(message);
            this.expected = expected;
            this.actual = actual;
        }
    }
}

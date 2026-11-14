package com.flowtest.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flowtest.automation.Actions;
import com.flowtest.automation.StepDef;
import com.flowtest.common.BusinessException;
import com.flowtest.common.Dtos.CompileResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class NlCompilerService {

    private final LlmClient llmClient;
    private final ObjectMapper objectMapper;

    private static final Pattern GOTO = Pattern.compile(
            "^(?:打开|访问|进入|跳转到|跳转至|跳转|open|goto|navigate(?:\\s+to)?|visit)\\s*(?:页面|网址|url|URL)?\\s*[:：]?\\s*(.+)$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern WAIT_NUMBER = Pattern.compile(
            "^(?:等待|暂停|wait)\\s*(\\d+(?:\\.\\d+)?)\\s*(秒|s|毫秒|ms)?\\s*$", Pattern.CASE_INSENSITIVE);
    private static final Pattern WAIT_VISIBLE = Pattern.compile(
            "^(?:等待|等|wait\\s+for)\\s*(?:元素)?\\s*(.+?)\\s*(?:出现|可见|显示)\\s*$", Pattern.CASE_INSENSITIVE);
    private static final Pattern WAIT_HIDDEN = Pattern.compile(
            "^(?:等待|等|wait\\s+for)\\s*(?:元素)?\\s*(.+?)\\s*(?:消失|隐藏|不存在)\\s*$", Pattern.CASE_INSENSITIVE);
    private static final Pattern CLICK = Pattern.compile(
            "^(?:点击|单击|点一下|click|tap)\\s+(.+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern HOVER = Pattern.compile(
            "^(?:悬停|鼠标悬停|hover)\\s*(?:在|到|于)?\\s*(.+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern CHECK = Pattern.compile(
            "^(?:勾选|选中复选框|check)\\s+(.+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern UNCHECK = Pattern.compile(
            "^(?:取消勾选|uncheck)\\s+(.+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern SCROLL = Pattern.compile(
            "^(?:滚动到|滚动至|scroll\\s+to)\\s*(.+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern FILL_IN = Pattern.compile(
            "^(?:在|向|往)\\s*(.+?)\\s*(?:中|里)?\\s*(?:输入|填写|填入|键入|fill|type)\\s*[:：]?\\s*(.*)$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern FILL_TO = Pattern.compile(
            "^(?:输入|填写|填入|键入)\\s+(.+?)\\s*(?:到|至|进|into)\\s+(.+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern FILL_WITH = Pattern.compile(
            "^(?:fill|type)\\s+(.+?)\\s+with\\s+(.+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern SELECT_IN = Pattern.compile(
            "^(?:在|从)\\s*(.+?)\\s*(?:中|里)?\\s*(?:选择|选中|select)\\s+(.+?)(?:\\s*选项)?\\s*$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern SELECT_FROM = Pattern.compile(
            "^select\\s+(.+?)\\s+from\\s+(.+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern SELECT_OF = Pattern.compile(
            "^(?:选择|选中|select)\\s+(.+?)\\s*(?:的|中的)\\s*(?:选项\\s*)?(.+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern PRESS_IN = Pattern.compile(
            "^(?:在)\\s*(.+?)\\s*(?:中|里)?\\s*(?:按下|按键|press)\\s+(.+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern PRESS = Pattern.compile(
            "^(?:按下|按键|press)\\s+(.+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern SCREENSHOT = Pattern.compile(
            "^(?:截图|截屏|screenshot|capture)(?:\\s+(?:命名为|名称|为|as)?\\s*[:：]?\\s*(.*))?$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern UPLOAD_IN = Pattern.compile(
            "^(?:在)\\s*(.+?)\\s*(?:中|里)?\\s*(?:上传|upload)\\s+(?:文件)?\\s*(.+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern UPLOAD_TO = Pattern.compile(
            "^(?:上传|upload)\\s+(.+?)\\s+(?:到|至|to)\\s+(.+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern ASSERT = Pattern.compile(
            "^(?:断言|验证|检查|确认|expect|assert|verify)\\s*(.+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern ASSERT_TITLE = Pattern.compile(
            "^(?:页面)?标题(?:应|需要)?(?:包含|含有|为|是|等于)?\\s*[:：]?\\s*(.+)$");
    private static final Pattern ASSERT_URL = Pattern.compile(
            "^(?:页面)?(?:URL|url|地址|链接)(?:应|需要)?(?:包含|含有|为|是|等于)?\\s*[:：]?\\s*(.+)$");
    private static final Pattern ASSERT_TEXT = Pattern.compile(
            "^(?:页面)?(?:文本|内容|文字|文案|正文)(?:应|需要)?(?:包含|含有|出现|为|是|等于)?\\s*[:：]?\\s*(.+)$");
    private static final Pattern ASSERT_COUNT = Pattern.compile(
            "^(?:元素\\s*)?(.+?)\\s*(?:的)?(?:数量|个数|条数)\\s*(?:应|需要)?(?:为|是|等于|=)\\s*(\\d+)\\s*$");
    private static final Pattern ASSERT_VALUE = Pattern.compile(
            "^(?:元素\\s*)?(.+?)\\s*(?:的)?(?:值|输入值)\\s*(?:应|需要)?(?:包含|为|是|等于)\\s*(.+)$");
    private static final Pattern ASSERT_HIDDEN = Pattern.compile(
            "^(?:元素\\s*)?(.+?)\\s*(?:不可见|隐藏|不存在|消失了?|已经消失)\\s*$");
    private static final Pattern ASSERT_VISIBLE = Pattern.compile(
            "^(?:元素\\s*)?(.+?)\\s*(?:可见|显示|存在|出现了?)\\s*$");
    private static final Pattern ASSERT_CONTAINS = Pattern.compile(
            "^(?:元素\\s*)?(.+?)\\s*包含\\s*(.+)$");
    private static final Pattern RAW_URL = Pattern.compile("^(https?://\\S+|/\\S+)$");

    private static final Map<String, String> ACTION_ALIASES = new LinkedHashMap<>();

    static {
        ACTION_ALIASES.put("打开", Actions.GOTO);
        ACTION_ALIASES.put("访问", Actions.GOTO);
        ACTION_ALIASES.put("goto", Actions.GOTO);
        ACTION_ALIASES.put("click", Actions.CLICK);
        ACTION_ALIASES.put("点击", Actions.CLICK);
        ACTION_ALIASES.put("fill", Actions.FILL);
        ACTION_ALIASES.put("输入", Actions.FILL);
        ACTION_ALIASES.put("click", Actions.CLICK);
        ACTION_ALIASES.put("screenshot", Actions.SCREENSHOT);
        ACTION_ALIASES.put("截图", Actions.SCREENSHOT);
        ACTION_ALIASES.put("asserttext", Actions.ASSERT_TEXT);
        ACTION_ALIASES.put("断言文本", Actions.ASSERT_TEXT);
        ACTION_ALIASES.put("asserttitle", Actions.ASSERT_TITLE);
        ACTION_ALIASES.put("断言标题", Actions.ASSERT_TITLE);
        ACTION_ALIASES.put("assertvisible", Actions.ASSERT_VISIBLE);
        ACTION_ALIASES.put("断言可见", Actions.ASSERT_VISIBLE);
        ACTION_ALIASES.put("wait", Actions.WAIT);
        ACTION_ALIASES.put("等待", Actions.WAIT);
    }

    private static final String SYSTEM_PROMPT = """
            你是 Web 自动化测试步骤编译器。把用户的中文/英文测试场景编译成 JSON，禁止输出 JSON 以外的内容。
            只允许以下 action：
            goto, click, fill, press, select, hover, check, uncheck, scroll, wait, waitFor,
            upload, screenshot, assertText, assertTitle, assertUrl, assertVisible, assertHidden,
            assertValue, assertCount。
            输出格式：
            {"title":"简短标题","summary":"一句话说明","steps":[
              {"action":"goto","selector":null,"value":"/demo/index.html","description":"打开演示站"},
              {"action":"fill","selector":"#username","value":"admin","description":"输入用户名"},
              {"action":"click","selector":"#login-btn","value":null,"description":"点击登录"},
              {"action":"assertText","selector":null,"value":"欢迎回来","description":"断言页面文本"},
              {"action":"screenshot","selector":null,"value":"完成","description":"截图"}
            ]}
            规则：
            1. selector 优先使用元素 id / CSS / [data-testid='x']；如果只能通过文本定位，使用 text=可见文本。
            2. goto 的 value 是相对路径或以 http 开头的完整 URL。
            3. 断言动作要具体，expected 值放在 value；assertVisible/Hidden 使用 selector，value 为空。
            4. wait 的 value 为毫秒数字字符串。
            5. 不要编造页面元素；用户没提到的动作不要增加。
            """;

    public CompileResult compile(String nl, String titleHint, Boolean useLlm) {
        String input = nl == null ? "" : nl.trim();
        if (input.isEmpty()) {
            throw new BusinessException("请输入自然语言测试描述");
        }
        List<String> warnings = new ArrayList<>();
        boolean attemptedLlm = llmClient.isEnabled() && !Boolean.FALSE.equals(useLlm);
        if (attemptedLlm) {
            try {
                return compileWithLlm(input, titleHint, warnings);
            } catch (Exception e) {
                log.warn("LLM compile failed, falling back to rules: {}", e.getMessage());
                warnings.add("LLM 解析失败，已回退本地规则引擎：" + rootMessage(e));
                CompileResult result = compileWithRules(input, titleHint, warnings);
                return new CompileResult(result.title(), result.summary() + " · LLM 兜底",
                        result.steps(), result.warnings(), "规则引擎（LLM 兜底）");
            }
        }
        return compileWithRules(input, titleHint, warnings);
    }

    private CompileResult compileWithRules(String nl, String titleHint, List<String> warnings) {
        List<StepDef> steps = new ArrayList<>();
        String[] lines = nl.replace("\r", "").split("\n|;|；");
        int lineNo = 0;
        for (String rawLine : lines) {
            lineNo++;
            String line = rawLine.trim();
            line = line.replaceFirst("^\\s*(?:步骤\\s*)?\\d+\\s*[.、):：]\\s*", "");
            line = line.replaceFirst("^\\s*[-*•]\\s*", "");
            line = line.trim();
            if (line.isEmpty() || line.startsWith("//") || line.startsWith("--")) {
                continue;
            }
            StepDef step;
            try {
                step = parseLine(line, lineNo, warnings);
            } catch (Exception e) {
                warnings.add("第 " + lineNo + " 行解析异常：" + rootMessage(e));
                step = null;
            }
            if (step != null) {
                steps.add(step);
            }
        }
        if (steps.isEmpty()) {
            String hint = warnings.isEmpty() ? "" : " 提示：" + String.join("；", warnings.subList(0, Math.min(2, warnings.size())));
            throw new BusinessException("未能识别出可执行步骤。" +
                    "请使用「打开 /demo/index.html」「点击 #login-btn」「断言文本包含 成功」等表述。" + hint);
        }
        List<StepDef> indexed = reindex(steps);
        String title = blank(titleHint) ? inferTitle(nl) : titleHint.trim();
        long assertions = indexed.stream().filter(StepDef::isAssertion).count();
        String summary = indexed.size() + " 个步骤 · " + assertions + " 个断言 · 本地规则引擎";
        return new CompileResult(title, summary, indexed, warnings, "规则引擎");
    }

    private CompileResult compileWithLlm(String nl, String titleHint, List<String> warnings) throws Exception {
        String userPrompt = "场景描述：\n" + nl + (blank(titleHint) ? "" : "\n\n期望标题：" + titleHint);
        String raw = llmClient.complete(SYSTEM_PROMPT, userPrompt);
        raw = stripCodeFence(raw);
        JsonNode root = objectMapper.readTree(raw);
        List<StepDef> steps = new ArrayList<>();
        JsonNode stepNodes = root.path("steps");
        if (!stepNodes.isArray()) {
            throw new IllegalStateException("LLM 未返回 steps 数组");
        }
        int i = 0;
        for (JsonNode node : stepNodes) {
            i++;
            String action = normalizeAction(node.path("action").asText(""));
            String selector = nullableText(node.path("selector"));
            String value = nullableText(node.path("value"));
            String desc = node.path("description").asText("");
            StepDef def = new StepDef(0, action, selector, value, desc);
            StepDef validated = validateStep(def, warnings, i);
            if (validated != null) {
                steps.add(validated);
            }
        }
        if (steps.isEmpty()) {
            throw new IllegalStateException("LLM 未生成有效步骤");
        }
        String title = root.path("title").asText("");
        if (blank(title)) {
            title = blank(titleHint) ? inferTitle(nl) : titleHint.trim();
        }
        List<StepDef> indexed = reindex(steps);
        long assertions = indexed.stream().filter(StepDef::isAssertion).count();
        String summary = root.path("summary").asText("");
        if (blank(summary)) {
            summary = indexed.size() + " 个步骤 · " + assertions + " 个断言";
        }
        return new CompileResult(title.trim(), summary + " · LLM 引擎", indexed, warnings, "LLM 引擎");
    }

    private StepDef parseLine(String line, int lineNo, List<String> warnings) {
        Matcher m;

        if ((m = GOTO.matcher(line)).matches()) {
            String value = cleanValue(m.group(1));
            if (value.isEmpty()) {
                warn(warnings, lineNo, "打开页面缺少 URL");
                return null;
            }
            return new StepDef(0, Actions.GOTO, null, value, "打开 " + value);
        }
        if ((m = RAW_URL.matcher(line)).matches()) {
            return new StepDef(0, Actions.GOTO, null, line, "打开 " + line);
        }
        if ((m = WAIT_VISIBLE.matcher(line)).matches()) {
            String target = clickSelector(m.group(1));
            return new StepDef(0, Actions.WAIT_FOR, target, "visible", "等待元素可见 " + target);
        }
        if ((m = WAIT_HIDDEN.matcher(line)).matches()) {
            String target = clickSelector(m.group(1));
            return new StepDef(0, Actions.WAIT_FOR, target, "hidden", "等待元素隐藏 " + target);
        }
        if ((m = WAIT_NUMBER.matcher(line)).matches()) {
            double number = Double.parseDouble(m.group(1));
            String unit = m.group(2);
            long ms = (unit == null || unit.equals("秒") || unit.equalsIgnoreCase("s"))
                    ? Math.round(number * 1000) : Math.round(number);
            return new StepDef(0, Actions.WAIT, null, String.valueOf(ms), "等待 " + ms + " 毫秒");
        }
        if ((m = SCREENSHOT.matcher(line)).matches()) {
            String label = cleanValue(m.group(1));
            return new StepDef(0, Actions.SCREENSHOT, null, blank(label) ? null : label,
                    blank(label) ? "截图" : "截图 " + label);
        }
        if ((m = FILL_IN.matcher(line)).matches()) {
            String selector = inputSelector(m.group(1));
            String value = cleanValue(m.group(2));
            if (value.isEmpty()) {
                warn(warnings, lineNo, "输入动作缺少内容");
                return null;
            }
            return new StepDef(0, Actions.FILL, selector, value, "在 " + selector + " 输入 " + value);
        }
        if ((m = FILL_WITH.matcher(line)).matches()) {
            String selector = inputSelector(m.group(1));
            String value = cleanValue(m.group(2));
            return new StepDef(0, Actions.FILL, selector, value, "在 " + selector + " 输入 " + value);
        }
        if ((m = FILL_TO.matcher(line)).matches()) {
            String value = cleanValue(m.group(1));
            String selector = inputSelector(m.group(2));
            return new StepDef(0, Actions.FILL, selector, value, "在 " + selector + " 输入 " + value);
        }
        if ((m = SELECT_IN.matcher(line)).matches()) {
            String selector = clickSelector(m.group(1));
            String value = cleanValue(m.group(2));
            return new StepDef(0, Actions.SELECT, selector, value, "在 " + selector + " 选择 " + value);
        }
        if ((m = SELECT_FROM.matcher(line)).matches()) {
            String value = cleanValue(m.group(1));
            String selector = clickSelector(m.group(2));
            return new StepDef(0, Actions.SELECT, selector, value, "在 " + selector + " 选择 " + value);
        }
        if ((m = SELECT_OF.matcher(line)).matches()) {
            String selector = clickSelector(m.group(1));
            String value = cleanValue(m.group(2));
            return new StepDef(0, Actions.SELECT, selector, value, "在 " + selector + " 选择 " + value);
        }
        if ((m = PRESS_IN.matcher(line)).matches()) {
            String selector = clickSelector(m.group(1));
            String key = cleanValue(m.group(2));
            return new StepDef(0, Actions.PRESS, selector, key, "在 " + selector + " 按下 " + key);
        }
        if ((m = PRESS.matcher(line)).matches()) {
            String key = cleanValue(m.group(1));
            return new StepDef(0, Actions.PRESS, null, key, "按下 " + key);
        }
        if ((m = UPLOAD_IN.matcher(line)).matches()) {
            String selector = clickSelector(m.group(1));
            String value = cleanValue(m.group(2));
            return new StepDef(0, Actions.UPLOAD, selector, value, "上传文件 " + value + " 到 " + selector);
        }
        if ((m = UPLOAD_TO.matcher(line)).matches()) {
            String value = cleanValue(m.group(1));
            String selector = clickSelector(m.group(2));
            return new StepDef(0, Actions.UPLOAD, selector, value, "上传文件 " + value + " 到 " + selector);
        }
        if ((m = HOVER.matcher(line)).matches()) {
            String selector = clickSelector(m.group(1));
            return new StepDef(0, Actions.HOVER, selector, null, "悬停 " + selector);
        }
        if ((m = UNCHECK.matcher(line)).matches()) {
            String selector = clickSelector(m.group(1));
            return new StepDef(0, Actions.UNCHECK, selector, null, "取消勾选 " + selector);
        }
        if ((m = CHECK.matcher(line)).matches()) {
            String selector = clickSelector(m.group(1));
            return new StepDef(0, Actions.CHECK, selector, null, "勾选 " + selector);
        }
        if ((m = SCROLL.matcher(line)).matches()) {
            String selector = clickSelector(m.group(1));
            return new StepDef(0, Actions.SCROLL, selector, null, "滚动到 " + selector);
        }
        if ((m = CLICK.matcher(line)).matches()) {
            String selector = clickSelector(m.group(1));
            return new StepDef(0, Actions.CLICK, selector, null, "点击 " + selector);
        }
        if ((m = ASSERT.matcher(line)).matches()) {
            StepDef assertion = parseAssertion(m.group(1), lineNo, warnings);
            if (assertion != null) {
                return assertion;
            }
        }
        warn(warnings, lineNo, "未识别：" + line);
        return null;
    }

    private StepDef parseAssertion(String rest, int lineNo, List<String> warnings) {
        Matcher m;
        if ((m = ASSERT_TITLE.matcher(rest)).matches()) {
            String expected = cleanValue(m.group(1));
            return new StepDef(0, Actions.ASSERT_TITLE, null, expected, "断言标题包含 " + expected);
        }
        if ((m = ASSERT_URL.matcher(rest)).matches()) {
            String expected = cleanValue(m.group(1));
            return new StepDef(0, Actions.ASSERT_URL, null, expected, "断言地址包含 " + expected);
        }
        if ((m = ASSERT_TEXT.matcher(rest)).matches()) {
            String expected = cleanValue(m.group(1));
            return new StepDef(0, Actions.ASSERT_TEXT, null, expected, "断言页面文本包含 " + expected);
        }
        if ((m = ASSERT_COUNT.matcher(rest)).matches()) {
            String selector = clickSelector(m.group(1));
            String expected = m.group(2);
            return new StepDef(0, Actions.ASSERT_COUNT, selector, expected,
                    "断言元素数量为 " + expected + " · " + selector);
        }
        if ((m = ASSERT_VALUE.matcher(rest)).matches()) {
            String selector = clickSelector(m.group(1));
            String expected = cleanValue(m.group(2));
            return new StepDef(0, Actions.ASSERT_VALUE, selector, expected,
                    "断言 " + selector + " 的值包含 " + expected);
        }
        if ((m = ASSERT_HIDDEN.matcher(rest)).matches()) {
            String selector = clickSelector(m.group(1));
            return new StepDef(0, Actions.ASSERT_HIDDEN, selector, null, "断言元素不可见 " + selector);
        }
        if ((m = ASSERT_VISIBLE.matcher(rest)).matches()) {
            String selector = clickSelector(m.group(1));
            return new StepDef(0, Actions.ASSERT_VISIBLE, selector, null, "断言元素可见 " + selector);
        }
        if ((m = ASSERT_CONTAINS.matcher(rest)).matches() && looksLikeSelector(m.group(1))) {
            String selector = clickSelector(m.group(1));
            String expected = cleanValue(m.group(2));
            return new StepDef(0, Actions.ASSERT_VALUE, selector, expected,
                    "断言 " + selector + " 的内容包含 " + expected);
        }
        warn(warnings, lineNo, "断言格式未识别：" + rest);
        return null;
    }

    private StepDef validateStep(StepDef step, List<String> warnings, int index) {
        String action = step.action();
        if (!Actions.ALL.contains(action)) {
            warnings.add("第 " + index + " 个 LLM 步骤 action 不合法：" + action);
            return null;
        }
        if (Actions.needsSelector(action) && blank(step.selector())) {
            warnings.add("第 " + index + " 个步骤缺少 selector：" + action);
            return null;
        }
        if (Actions.needsValue(action) && blank(step.value())) {
            warnings.add("第 " + index + " 个步骤缺少 value：" + action);
            return null;
        }
        String value = step.value();
        if (Actions.WAIT.equals(action) && value != null) {
            value = normalizeWait(value);
        }
        String description = blank(step.description())
                ? Actions.LABELS.getOrDefault(action, action) : step.description();
        return new StepDef(0, action, step.selector(), value, description);
    }

    private List<StepDef> reindex(List<StepDef> steps) {
        List<StepDef> result = new ArrayList<>(steps.size());
        for (int i = 0; i < steps.size(); i++) {
            result.add(steps.get(i).withIndex(i + 1));
        }
        return result;
    }

    private String normalizeAction(String raw) {
        String action = raw == null ? "" : raw.trim();
        if (Actions.ALL.contains(action)) {
            return action;
        }
        String lower = action.toLowerCase(Locale.ROOT);
        if (Actions.ALL.contains(lower)) {
            return lower;
        }
        return ACTION_ALIASES.getOrDefault(action, ACTION_ALIASES.getOrDefault(lower, action));
    }

    private String normalizeWait(String value) {
        String v = value.trim().toLowerCase(Locale.ROOT);
        Matcher m = Pattern.compile("^(\\d+(?:\\.\\d+)?)\\s*(秒|s|毫秒|ms)?$").matcher(v);
        if (!m.matches()) {
            return value;
        }
        double n = Double.parseDouble(m.group(1));
        if (m.group(2) == null || m.group(2).equals("秒") || m.group(2).equals("s")) {
            return String.valueOf(Math.round(n * 1000));
        }
        return String.valueOf(Math.round(n));
    }

    private String inferTitle(String nl) {
        for (String raw : nl.split("\n")) {
            String line = raw.trim();
            if (line.isEmpty()) {
                continue;
            }
            Matcher gotoMatcher = Pattern.compile("^(?:打开|访问|进入|open|goto|visit)\\s+(.+)$",
                    Pattern.CASE_INSENSITIVE).matcher(line);
            if (gotoMatcher.matches()) {
                String url = cleanValue(gotoMatcher.group(1));
                try {
                    URI uri = URI.create(url.startsWith("http") ? url : "http://demo" + (url.startsWith("/") ? url : "/" + url));
                    String host = uri.getHost() == null ? "demo" : uri.getHost();
                    String path = uri.getPath() == null ? "" : uri.getPath();
                    return "Web 冒烟 · " + host + path;
                } catch (Exception ignored) {
                    return "Web 冒烟 · " + url;
                }
            }
            return line.length() > 40 ? line.substring(0, 40) + "…" : line;
        }
        return "Web 自动化场景";
    }

    private String clickSelector(String raw) {
        String s = cleanValue(raw);
        if (looksLikeSelector(s)) {
            return s;
        }
        String text = s.replaceAll("\\s*(按钮|链接|选项卡|菜单|标签页)$", "").trim();
        if (text.isEmpty()) {
            text = s;
        }
        return "text=" + text;
    }

    private String inputSelector(String raw) {
        String s = cleanValue(raw);
        if (looksLikeSelector(s)) {
            return s;
        }
        String text = s.replaceAll("\\s*(输入框|文本框|输入区域|输入区)$", "").trim();
        if (text.isEmpty()) {
            text = s;
        }
        return "placeholder=" + text;
    }

    private boolean looksLikeSelector(String s) {
        if (s == null || s.isBlank()) {
            return false;
        }
        String v = s.trim();
        return v.startsWith("#") || v.startsWith(".") || v.startsWith("[") || v.startsWith("//")
                || v.startsWith("(") || v.startsWith("css=") || v.startsWith("xpath=")
                || v.startsWith("id=") || v.startsWith("name=") || v.startsWith("text=")
                || v.startsWith("data-testid=") || v.startsWith("placeholder=")
                || v.startsWith("//") || (v.contains("[") && v.contains("]"))
                || v.matches("^[a-zA-Z][\\w-]*\\s*[>+~].*");
    }

    private String cleanValue(String raw) {
        if (raw == null) {
            return "";
        }
        String s = raw.trim();
        while (s.startsWith(":") || s.startsWith("：")) {
            s = s.substring(1).trim();
        }
        s = stripQuotes(s);
        return s.trim();
    }

    private String stripQuotes(String s) {
        if (s.length() < 2) {
            return s;
        }
        if ((s.startsWith("\"") && s.endsWith("\""))
                || (s.startsWith("'") && s.endsWith("'"))
                || (s.startsWith("“") && s.endsWith("”"))
                || (s.startsWith("「") && s.endsWith("」"))
                || (s.startsWith("『") && s.endsWith("』"))) {
            return s.substring(1, s.length() - 1).trim();
        }
        return s;
    }

    private String stripCodeFence(String raw) {
        String s = raw == null ? "" : raw.trim();
        if (s.startsWith("```")) {
            int firstNewline = s.indexOf('\n');
            if (firstNewline > 0) {
                s = s.substring(firstNewline + 1);
            }
            if (s.endsWith("```")) {
                s = s.substring(0, s.length() - 3);
            }
        }
        return s.trim();
    }

    private String nullableText(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return null;
        }
        String text = node.asText();
        return text == null || text.isBlank() ? null : text.trim();
    }

    private void warn(List<String> warnings, int lineNo, String message) {
        warnings.add("第 " + lineNo + " 行" + message);
    }

    private boolean blank(String s) {
        return s == null || s.isBlank();
    }

    private String rootMessage(Throwable e) {
        Throwable current = e;
        while (current.getCause() != null && current.getCause() != current) {
            current = current.getCause();
        }
        String msg = current.getMessage();
        if (msg == null || msg.isBlank()) {
            msg = e.getClass().getSimpleName();
        }
        return msg.length() > 200 ? msg.substring(0, 200) + "…" : msg;
    }
}

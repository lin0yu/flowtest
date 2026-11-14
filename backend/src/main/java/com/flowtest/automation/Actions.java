package com.flowtest.automation;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

public final class Actions {

    private Actions() {
    }

    public static final String GOTO = "goto";
    public static final String CLICK = "click";
    public static final String FILL = "fill";
    public static final String PRESS = "press";
    public static final String SELECT = "select";
    public static final String HOVER = "hover";
    public static final String CHECK = "check";
    public static final String UNCHECK = "uncheck";
    public static final String SCROLL = "scroll";
    public static final String WAIT = "wait";
    public static final String WAIT_FOR = "waitFor";
    public static final String UPLOAD = "upload";
    public static final String SCREENSHOT = "screenshot";
    public static final String ASSERT_TEXT = "assertText";
    public static final String ASSERT_TITLE = "assertTitle";
    public static final String ASSERT_URL = "assertUrl";
    public static final String ASSERT_VISIBLE = "assertVisible";
    public static final String ASSERT_HIDDEN = "assertHidden";
    public static final String ASSERT_VALUE = "assertValue";
    public static final String ASSERT_COUNT = "assertCount";

    public static final Set<String> ALL = Set.of(
            GOTO, CLICK, FILL, PRESS, SELECT, HOVER, CHECK, UNCHECK, SCROLL,
            WAIT, WAIT_FOR, UPLOAD, SCREENSHOT,
            ASSERT_TEXT, ASSERT_TITLE, ASSERT_URL, ASSERT_VISIBLE, ASSERT_HIDDEN,
            ASSERT_VALUE, ASSERT_COUNT
    );

    public static final Map<String, String> LABELS = new LinkedHashMap<>();

    static {
        LABELS.put(GOTO, "打开页面");
        LABELS.put(CLICK, "点击");
        LABELS.put(FILL, "输入");
        LABELS.put(PRESS, "按键");
        LABELS.put(SELECT, "选择");
        LABELS.put(HOVER, "悬停");
        LABELS.put(CHECK, "勾选");
        LABELS.put(UNCHECK, "取消勾选");
        LABELS.put(SCROLL, "滚动到");
        LABELS.put(WAIT, "等待");
        LABELS.put(WAIT_FOR, "等待元素");
        LABELS.put(UPLOAD, "上传文件");
        LABELS.put(SCREENSHOT, "截图");
        LABELS.put(ASSERT_TEXT, "断言文本");
        LABELS.put(ASSERT_TITLE, "断言标题");
        LABELS.put(ASSERT_URL, "断言地址");
        LABELS.put(ASSERT_VISIBLE, "断言可见");
        LABELS.put(ASSERT_HIDDEN, "断言隐藏");
        LABELS.put(ASSERT_VALUE, "断言值");
        LABELS.put(ASSERT_COUNT, "断言数量");
    }

    public static boolean needsSelector(String action) {
        return Set.of(CLICK, FILL, PRESS, SELECT, HOVER, CHECK, UNCHECK, SCROLL,
                WAIT_FOR, UPLOAD, ASSERT_VISIBLE, ASSERT_HIDDEN, ASSERT_VALUE, ASSERT_COUNT).contains(action);
    }

    public static boolean needsValue(String action) {
        return Set.of(GOTO, FILL, PRESS, SELECT, WAIT, WAIT_FOR, UPLOAD,
                ASSERT_TEXT, ASSERT_TITLE, ASSERT_URL, ASSERT_VALUE, ASSERT_COUNT).contains(action);
    }
}

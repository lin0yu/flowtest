package com.flowtest.automation;

import java.util.Objects;

/**
 * 一条可执行的测试步骤。selector/value 的含义由 action 决定。
 */
public record StepDef(int index, String action, String selector, String value, String description) {

    public StepDef {
        action = action == null ? "" : action.trim();
        selector = blankToNull(selector);
        value = blankToNull(value);
        description = description == null ? "" : description.trim();
    }

    public StepDef withIndex(int newIndex) {
        return new StepDef(newIndex, action, selector, value, description);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    public boolean isAssertion() {
        return Objects.requireNonNullElse(action, "").startsWith("assert");
    }
}

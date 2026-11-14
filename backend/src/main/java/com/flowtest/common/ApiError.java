package com.flowtest.common;

public record ApiError(int status, String message, String path, String timestamp) {
}

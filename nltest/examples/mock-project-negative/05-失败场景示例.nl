# @title 模拟项目 · 失败场景（断言不通过，用于验证报告标红）
# @tags mock,negative
打开 /mock/reset
在 placeholder=请输入用户名 输入 admin
在 placeholder=请输入密码 输入 admin123
点击 text=登 录
等待 text=测试任务 出现
断言文本包含 这个任务根本不存在

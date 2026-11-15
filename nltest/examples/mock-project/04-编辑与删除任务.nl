# @title 模拟项目 · 编辑与删除任务
# @tags mock,regression,edit
打开 /mock/reset
在 placeholder=请输入用户名 输入 admin
在 placeholder=请输入密码 输入 admin123
点击 text=登 录
等待页面文本包含 任务总数
点击 text=测试任务
等待页面文本包含 共 3 条任务
点击表格行 SAR 认证辐射测试 的 编辑
等待 placeholder=请输入任务名称 出现
在 placeholder=请输入任务名称 输入 SAR 认证辐射测试-已修订
点击 text=确定
断言文本包含 保存成功
断言文本包含 SAR 认证辐射测试-已修订
点击表格行 SAR 认证辐射测试-已修订 的 删除
等待 .el-message-box 出现
点击 css=.el-message-box__btns .el-button--primary
断言文本包含 删除成功
断言元素 text=SAR 认证辐射测试-已修订 隐藏
截图 删除完成

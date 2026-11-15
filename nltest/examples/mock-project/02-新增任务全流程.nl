# @title 模拟项目 · 新增任务全流程
# @tags mock,smoke,create
打开 /mock/reset
在 placeholder=请输入用户名 输入 admin
在 placeholder=请输入密码 输入 admin123
点击 text=登 录
等待页面文本包含 任务总数
点击 text=测试任务
等待页面文本包含 共 3 条任务
点击 text=新增任务
等待 placeholder=请输入任务名称 出现
在 placeholder=请输入任务名称 输入 辐射认证冒烟任务
在 placeholder=请输入测试型号 输入 Greenland-09
选择下拉 .stage-select 为 样机阶段
选择下拉 .cert-select 为 型号核准
选择日期 .deadline-picker 为 20
上传 .el-upload__input /tmp/flowtest-report.pdf
点击 text=确定
断言文本包含 新增成功
断言文本包含 辐射认证冒烟任务
断言元素 表格行 辐射认证冒烟任务 的 样机阶段 列 的值为 样机阶段
断言元素 表格行 辐射认证冒烟任务 的 认证类型 列 的值为 型号核准
截图 新增任务成功

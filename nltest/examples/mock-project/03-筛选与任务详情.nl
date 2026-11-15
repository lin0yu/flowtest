# @title 模拟项目 · 筛选与任务详情
# @tags mock,regression,detail
打开 /mock/reset
在 placeholder=请输入用户名 输入 admin
在 placeholder=请输入密码 输入 admin123
点击 text=登 录
等待页面文本包含 任务总数
点击 text=测试任务
等待页面文本包含 共 3 条任务
选择下拉 .status-select 为 已审核
断言文本包含 射频天线一致性测试
断言元素 表格行 射频天线一致性测试 的 状态 列 的值为 已审核
点击表格行 射频天线一致性测试 的 查看
等待页面文本包含 任务详情
断言文本包含 射频天线一致性测试
断言文本包含 Greenland-02
截图 任务详情页

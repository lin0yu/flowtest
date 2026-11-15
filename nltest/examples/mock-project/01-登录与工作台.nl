# @title 模拟项目 · 登录与工作台
# @tags mock,smoke,login
打开 /mock/reset
在 placeholder=请输入用户名 输入 admin
在 placeholder=请输入密码 输入 admin123
点击 text=登 录
等待页面文本包含 任务总数
断言文本包含 欢迎回来，admin
断言文本包含 任务总数
断言文本包含 最近任务
截图 登录后进入工作台

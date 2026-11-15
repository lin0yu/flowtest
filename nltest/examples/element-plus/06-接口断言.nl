# @title 接口响应体字段断言
# @tags element-plus,api
打开 /element-lab
点击 text=调用登录接口
断言接口 /api/auth/login 返回 200|body.user.username=admin
断言文本包含 接口调用成功

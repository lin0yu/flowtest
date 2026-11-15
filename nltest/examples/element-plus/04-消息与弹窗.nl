# @title Element Plus 消息提示与对话框
# @tags element-plus,dialog
打开 /element-lab
点击 text=触发提示
断言文本包含 新增成功
点击 text=打开弹窗
断言元素 .el-dialog 可见
点击 text=确定
断言元素 .el-dialog 隐藏

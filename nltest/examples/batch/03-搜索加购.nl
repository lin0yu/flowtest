打开 /demo/index.html
在 #username 输入 ${demoUser}
在 #password 输入 ${demoPassword}
点击 #login-btn
断言文本包含 欢迎回来，admin
在 #search 输入 机械键盘
点击 #search-btn
断言元素 [data-testid='product-101'] 可见
点击 [data-testid='add-101']
断言元素 #cart-count 的值为 1
截图 登录并加购完成

const products = [
  {
    id: 101,
    name: "Aurora 机械键盘",
    category: "Keyboard",
    desc: "75% 配列 · 热插拔轴体 · 三模连接，为长时间编码准备的手感。",
    price: 699,
    icon: "⌨️",
    tag: "BEST SELLER",
    gradient: "linear-gradient(135deg, #eef2ff, #c7d2fe)"
  },
  {
    id: 102,
    name: "Vision 4K 显示器",
    category: "Display",
    desc: "27 英寸 · 4K IPS · 98% DCI-P3，让每一行代码都清晰锐利。",
    price: 2499,
    icon: "🖥️",
    tag: "NEW",
    gradient: "linear-gradient(135deg, #ecfeff, #a5f3fc)"
  },
  {
    id: 103,
    name: "Glide 无线鼠标",
    category: "Mouse",
    desc: "轻量化 58g · 26000 DPI · 静音微动，滑动像呼吸一样自然。",
    price: 329,
    icon: "🖱️",
    tag: "TRENDING",
    gradient: "linear-gradient(135deg, #f5f3ff, #ddd6fe)"
  },
  {
    id: 104,
    name: "Pulse 降噪耳机",
    category: "Audio",
    desc: "40mm 动圈 · 混合降噪 · 60 小时续航，隔离世界的噪音。",
    price: 899,
    icon: "🎧",
    tag: "EDITOR'S PICK",
    gradient: "linear-gradient(135deg, #fdf2f8, #fbcfe8)"
  },
  {
    id: 105,
    name: "Halo 桌面氛围灯",
    category: "Lighting",
    desc: "无极调光 · 1600 万色 · 磁吸底座，给深夜调试一点温度。",
    price: 259,
    icon: "💡",
    tag: "COZY",
    gradient: "linear-gradient(135deg, #fffbeb, #fde68a)"
  },
  {
    id: 106,
    name: "Link 8 合 1 扩展坞",
    category: "Hub",
    desc: "HDMI 2.1 · 100W PD · 千兆网口，一根线连接整个工作台。",
    price: 459,
    icon: "🔌",
    tag: "PRO",
    gradient: "linear-gradient(135deg, #f0fdf4, #bbf7d0)"
  }
];

const state = {
  cart: 0,
  loggedIn: false,
  keyword: ""
};

const grid = document.getElementById("product-grid");
const resultText = document.getElementById("result-text");
const emptyState = document.getElementById("empty-state");
const cartPill = document.querySelector(".cart-pill");
const cartCount = document.getElementById("cart-count");
const toast = document.getElementById("toast");
const loginForm = document.getElementById("login-form");
const loginMessage = document.getElementById("login-message");
const welcome = document.getElementById("welcome");
const userBadge = document.getElementById("user-badge");

function renderProducts() {
  const keyword = state.keyword.trim().toLowerCase();
  const visible = products.filter((product) => {
    if (!keyword) return true;
    return (product.name + " " + product.category + " " + product.desc)
      .toLowerCase()
      .includes(keyword);
  });

  grid.innerHTML = visible.map((product) => `
    <article class="product-card" data-testid="product-${product.id}">
      <div class="product-visual" style="background:${product.gradient}">
        <span class="product-tag">${product.tag}</span>
        <span aria-hidden="true">${product.icon}</span>
      </div>
      <div class="product-body">
        <div class="product-category">${product.category}</div>
        <h3 class="product-name">${product.name}</h3>
        <p class="product-desc">${product.desc}</p>
        <div class="product-foot">
          <div class="price">¥${product.price.toLocaleString("zh-CN")}<small>起</small></div>
          <button type="button" class="add-btn" data-testid="add-${product.id}" data-product-id="${product.id}">
            加入购物车
          </button>
        </div>
      </div>
    </article>
  `).join("");

  if (visible.length === 0) {
    grid.classList.add("hidden");
    emptyState.classList.remove("hidden");
    resultText.textContent = "共 0 件商品";
  } else {
    grid.classList.remove("hidden");
    emptyState.classList.add("hidden");
    resultText.textContent = keyword
      ? `找到 ${visible.length} 件与“${state.keyword.trim()}”相关的商品`
      : `共 ${visible.length} 件商品`;
  }

  grid.querySelectorAll(".add-btn").forEach((button) => {
    button.addEventListener("click", () => addToCart(Number(button.dataset.productId)));
  });
}

function addToCart(productId) {
  const product = products.find((item) => item.id === productId);
  if (!product) return;
  state.cart += 1;
  cartCount.textContent = String(state.cart);
  cartPill.classList.remove("bump");
  void cartPill.offsetWidth;
  cartPill.classList.add("bump");
  showToast(`已加入购物车：${product.name}`);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function doSearch() {
  state.keyword = document.getElementById("search").value;
  renderProducts();
}

document.getElementById("search-btn").addEventListener("click", doSearch);
document.getElementById("search").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    doSearch();
  }
});
document.getElementById("reset-search").addEventListener("click", () => {
  document.getElementById("search").value = "";
  state.keyword = "";
  renderProducts();
});

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  loginMessage.classList.remove("error");

  if (!username || !password) {
    loginMessage.textContent = "请输入用户名和密码";
    loginMessage.classList.add("error");
    return;
  }
  if (username === "admin" && password === "admin123") {
    state.loggedIn = true;
    loginForm.classList.add("hidden");
    welcome.classList.remove("hidden");
    loginMessage.textContent = "";
    userBadge.textContent = "A";
    showToast("登录成功，欢迎回来");
  } else {
    loginMessage.textContent = "用户名或密码错误";
    loginMessage.classList.add("error");
    showToast("登录失败，请检查账号密码");
  }
});

document.getElementById("logout-btn").addEventListener("click", () => {
  state.loggedIn = false;
  welcome.classList.add("hidden");
  loginForm.classList.remove("hidden");
  document.getElementById("username").value = "";
  document.getElementById("password").value = "";
  loginMessage.textContent = "";
  userBadge.textContent = "客";
  showToast("已退出登录");
});

const modal = document.getElementById("script-modal");
document.getElementById("show-script").addEventListener("click", () => {
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
});
document.querySelectorAll("[data-close-modal]").forEach((element) => {
  element.addEventListener("click", () => {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  });
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  }
});

document.getElementById("open-studio").addEventListener("click", () => {
  const studioUrl = window.location.port === "8080"
    ? "http://localhost:5173/studio"
    : "/studio";
  window.open(studioUrl, "_blank");
});

renderProducts();

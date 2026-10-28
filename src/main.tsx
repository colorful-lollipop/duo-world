import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { fetchConfig } from "./lib/config";
import "./styles.css";

// 提前取一次部署配置：分享链接可能需要把 localhost 换成本机局域网地址
void fetchConfig();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary
    fallback={(reset) => (
      <div className="status-page">
        <div className="status-card">
          <span className="join-emoji">🫧</span>
          <h1>页面刚刚绊了一下</h1>
          <p className="muted">小屋还在，点一下就能回来；如果一直这样，刷新一下页面。</p>
          <button className="primary" onClick={reset}>
            再试一次
          </button>
          <button className="text-button" onClick={() => location.reload()}>
            刷新页面
          </button>
        </div>
      </div>
    )}
  >
    <App />
  </ErrorBoundary>,
);

// PWA：生产环境注册离线壳（开发时没有 sw.js，跳过）
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* 注册失败不影响玩游戏 */
    });
  });
}

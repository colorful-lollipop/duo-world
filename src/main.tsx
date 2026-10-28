import ReactDOM from "react-dom/client";
import App from "./App";
import { fetchConfig } from "./lib/config";
import "./styles.css";

// 提前取一次部署配置：分享链接可能需要把 localhost 换成本机局域网地址
void fetchConfig();

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);

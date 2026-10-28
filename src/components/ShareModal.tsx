import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { copyText } from "../lib/browser";
import { buildRoomLink, fetchConfig, getCachedShareBase, getShareBase } from "../lib/config";

export function ShareModal({
  code,
  onClose,
  notify,
}: {
  code: string;
  onClose: () => void;
  notify: (text: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [base, setBase] = useState(() => getCachedShareBase());
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const url = buildRoomLink(base, code);
  const swapped = !publicUrl && base !== location.origin;

  useEffect(() => {
    let live = true;
    getShareBase().then((b) => {
      if (live) setBase(b);
    });
    fetchConfig().then((cfg) => {
      if (live) setPublicUrl(cfg.publicUrl);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, url, {
      width: 232,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#3A2618", light: "#FFF8F1" },
    }).catch(() => {});
  }, [url]);

  return (
    <Modal title="把 TA 叫进小屋" onClose={onClose}>
      <div className="share-box">
        <canvas ref={canvasRef} className="qr-canvas" aria-label="房间二维码" />
        <p className="share-code">
          房间号 <b>{code}</b>
        </p>
        <p className="muted">让 TA 扫一下二维码，或把下面的链接发过去。</p>
        <div className="share-link">{url}</div>
        <div className="button-row">
          <button
            className="primary"
            onClick={async () => {
              const ok = await copyText(url);
              notify(ok ? "链接已复制，发给 TA 吧" : "复制失败了，长按链接试试");
            }}
          >
            <Icon name="copy" size={18} /> 复制邀请链接
          </button>
          <button
            className="secondary"
            onClick={async () => {
              const ok = await copyText(code);
              notify(ok ? "房间号已复制" : "复制失败了");
            }}
          >
            复制房间号
          </button>
        </div>
        <p className="small-print muted">
          {publicUrl
            ? "分享链接使用的是部署时设置的公网地址。"
            : swapped
              ? "你现在用的是本机地址，链接已经自动换成局域网地址；如果 TA 还是打不开，检查一下电脑防火墙。"
              : "小提示：两个人在同一个 WiFi 下最稳；在外网就部署到一台能访问的服务器，或设置 PUBLIC_URL。"}
        </p>
      </div>
    </Modal>
  );
}

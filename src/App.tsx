import { useEffect, useState } from "react";
import { RoomPage } from "./pages/RoomPage";
import { HomePage } from "./pages/HomePage";
import { LegalPage } from "./pages/LegalPage";
import { currentPath } from "./lib/router";
import { LEGAL_PRIVACY, LEGAL_TERMS } from "./lib/legal";

export default function App() {
  const [path, setPath] = useState(currentPath());

  useEffect(() => {
    const onPop = () => setPath(currentPath());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const match = path.match(/^\/r\/([a-zA-Z0-9]{4,10})\/?$/);
  if (match) {
    return <RoomPage key={match[1].toUpperCase()} code={match[1].toUpperCase()} />;
  }
  if (/^\/terms\/?$/.test(path)) {
    return <LegalPage doc={LEGAL_TERMS} />;
  }
  if (/^\/privacy\/?$/.test(path)) {
    return <LegalPage doc={LEGAL_PRIVACY} />;
  }
  return <HomePage />;
}

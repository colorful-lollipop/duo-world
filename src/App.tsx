import { useEffect, useState } from "react";
import { RoomPage } from "./pages/RoomPage";
import { HomePage } from "./pages/HomePage";
import { currentPath } from "./lib/router";

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
  return <HomePage />;
}

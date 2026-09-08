import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerReceiptServiceWorker } from "./lib/shared-receipt";

createRoot(document.getElementById("root")!).render(<App />);

registerReceiptServiceWorker();

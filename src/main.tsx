import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerReceiptServiceWorker } from "./lib/shared-receipt";
import { AppThemeProvider } from "./components/AppThemeProvider";

const root = document.getElementById("root");
if (root) createRoot(root).render(<AppThemeProvider><App /></AppThemeProvider>);

registerReceiptServiceWorker();

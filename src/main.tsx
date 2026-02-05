import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initCopilotBackend } from "./services/copilot-backend";

// Initialize Copilot backend event routing
initCopilotBackend();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

import React from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App";

const sentryDsn =
  import.meta.env.VITE_SENTRY_DSN ??
  "https://8ab67175daed999e8c432a93d8f98e49@o4510750015094784.ingest.us.sentry.io/4510750016012288";

Sentry.init({
  dsn: sentryDsn,
  enabled: Boolean(sentryDsn),
  release: __APP_VERSION__,
});

Sentry.metrics.count("app_open", 1, {
  attributes: {
    env: import.meta.env.MODE,
    platform: "macos",
  },
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

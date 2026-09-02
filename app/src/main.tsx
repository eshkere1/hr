import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./hooks/useAuth";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* На GitHub Pages сайт живёт в подпапке /hr/, локально — в корне.
        BASE_URL подставляет Vite, поэтому один и тот же код работает и там,
        и там: править адрес руками перед выкладкой не нужно. */}
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

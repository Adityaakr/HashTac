import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ChainProvider } from "./providers/chain-provider";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ChainProvider>
      <App />
    </ChainProvider>
  </React.StrictMode>
);

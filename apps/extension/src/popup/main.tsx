import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { createChromePopupData } from "./data";
import "./styles.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App data={createChromePopupData()} />
    </StrictMode>,
  );
}

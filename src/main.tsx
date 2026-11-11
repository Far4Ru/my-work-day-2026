import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import TimeOfDayBackground from "./TimeOfDayBackground";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TimeOfDayBackground />
    <App />
  </React.StrictMode>,
);

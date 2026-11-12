import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import TimeOfDayBackground from "./backgrounds/TimeOfDayBackground";
import "./styles/base.css";
import "./styles/background.css";
import "./styles/boardGrid.css";
import "./styles/boardEdges.css";
import "./styles/shell.css";
import "./styles/header.css";
import "./styles/workspace.css";
import "./styles/tasks.css";
import "./styles/calendar.css";
import "./styles/reports.css";
import "./styles/responsive.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div className="background-track" aria-hidden="true">
      <TimeOfDayBackground />
    </div>
    <App />
  </React.StrictMode>,
);

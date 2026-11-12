import type { Dispatch, SetStateAction } from "react";
import type { ReportPeriod } from "../data/model";
import { minutesLabel } from "../lib/dates";
import type { buildReportSummary } from "./reportSummary";

interface ReportPageProps {
  view: "statistics" | "reports";
  period: ReportPeriod;
  setPeriod: Dispatch<SetStateAction<ReportPeriod>>;
  summary: ReturnType<typeof buildReportSummary>;
}

export default function ReportPage({
  view,
  period,
  setPeriod,
  summary,
}: ReportPageProps) {
  return (
    <>
      <div className="period-tabs" role="group" aria-label="Период">
        {(
          [
            ["day", "День"],
            ["week", "Неделя"],
            ["month", "Месяц"],
            ["year", "Год"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className={period === value ? "active" : ""}
            onClick={() => setPeriod(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "statistics" ? (
        <div className="statistics-page">
          <section
            className="panel statistics-period-panel"
            aria-label="Показатели за период"
          >
            <div className="stats-row">
              <div className="stat">
                <span>Запланировано</span>
                <strong>{summary.plannedCount}</strong>
              </div>
              <div className="stat">
                <span>Выполнено</span>
                <strong>{summary.completedCount}</strong>
              </div>
              <div className="stat">
                <span>Учтено времени</span>
                <strong>{minutesLabel(summary.minutes)}</strong>
              </div>
              <div className="stat">
                <span>Дней с записями</span>
                <strong>{summary.days}</strong>
              </div>
            </div>
          </section>
        </div>
      ) : (
        <section className="panel report-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">ИТОГИ ПЕРИОДА</p>
              <h2>Отчёт за период</h2>
            </div>
          </div>
          <textarea
            className="report-markdown"
            aria-label="Отчёт в формате Markdown"
            value={summary.markdown}
            readOnly
            spellCheck={false}
          />
        </section>
      )}
    </>
  );
}

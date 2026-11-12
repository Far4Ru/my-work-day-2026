import type { Dispatch, SetStateAction } from "react";
import type { ReportPeriod } from "../data/model";
import { dateFromIsoWeekKey, dateKey, isoWeekKey } from "../lib/dates";
import Icon from "../ui/Icon";
import type { View } from "../boards/types";

interface DateHeaderProps {
  view: View;
  headerDate: string;
  ready: boolean;
  reportPeriod: ReportPeriod;
  selectedDate: string;
  setSelectedDate: Dispatch<SetStateAction<string>>;
  moveSelectedDate: (amount: number) => void;
}

export default function DateHeader({
  view,
  headerDate,
  ready,
  reportPeriod,
  selectedDate,
  setSelectedDate,
  moveSelectedDate,
}: DateHeaderProps) {
  return (
    <div className="header-date-slot">
      <header className="page-header" tabIndex={0}>
        <div>
          <h1>
            {view === "tasks"
              ? "Задачи дня"
              : view === "calendar"
                ? "Календарь"
                : view === "statistics"
                  ? "Статистика"
                  : "Отчёт"}
          </h1>
          <p className="subtitle">{headerDate}</p>
        </div>
      </header>
      {ready && (
        <div className="date-toolbar">
          <button
            aria-label="Предыдущий период"
            onClick={() => moveSelectedDate(-1)}
          >
            <Icon name="chevron-left" />
          </button>
          <label>
            {view === "tasks" || view === "calendar"
              ? "Дата"
              : reportPeriod === "day"
                ? "День"
                : reportPeriod === "week"
                  ? "Неделя"
                  : reportPeriod === "month"
                    ? "Месяц"
                    : "Год"}
            {view === "tasks" ||
            view === "calendar" ||
            reportPeriod === "day" ? (
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => {
                  if (event.target.value) setSelectedDate(event.target.value);
                }}
              />
            ) : reportPeriod === "week" ? (
              <input
                type="week"
                value={isoWeekKey(selectedDate)}
                onChange={(event) => {
                  const monday = dateFromIsoWeekKey(event.target.value);
                  if (monday) setSelectedDate(monday);
                }}
              />
            ) : reportPeriod === "month" ? (
              <input
                type="month"
                value={selectedDate.slice(0, 7)}
                onChange={(event) => {
                  if (event.target.value)
                    setSelectedDate(`${event.target.value}-01`);
                }}
              />
            ) : (
              <input
                key={selectedDate.slice(0, 4)}
                type="number"
                min="1000"
                max="9999"
                step="1"
                defaultValue={selectedDate.slice(0, 4)}
                onBlur={(event) => {
                  const year = event.target.value;
                  if (/^\d{4}$/.test(year) && Number(year) >= 1000) {
                    setSelectedDate(`${year}-01-01`);
                  } else {
                    event.currentTarget.value = selectedDate.slice(0, 4);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
            )}
          </label>
          <button
            aria-label="Следующий период"
            onClick={() => moveSelectedDate(1)}
          >
            <Icon name="chevron-right" />
          </button>
          <button
            className="today-button"
            onClick={() => setSelectedDate(dateKey(new Date()))}
          >
            Сегодня
          </button>
        </div>
      )}
    </div>
  );
}

import type { Dispatch, FormEvent, SetStateAction } from "react";
import type { ActiveTimer, TimeEntry } from "../data/model";
import {
  clockTime,
  dateKeyFromTimestamp,
  formatDate,
  minutesLabel,
} from "../lib/dates";
import { hasEditableClockTimes } from "../lib/timeEntries";
import Icon from "../ui/Icon";

interface CalendarTimeEntriesProps {
  timer: ActiveTimer | null;
  selectedDate: string;
  now: number;
  stopTimer: () => void;
  dayEntries: TimeEntry[];
  dayMinutes: number;
  editingEntryId: string | null;
  entryTitle: string;
  setEntryTitle: Dispatch<SetStateAction<string>>;
  entryStart: string;
  setEntryStart: Dispatch<SetStateAction<string>>;
  entryEnd: string;
  setEntryEnd: Dispatch<SetStateAction<string>>;
  entryMinutes: string;
  setEntryMinutes: Dispatch<SetStateAction<string>>;
  saveEntryEdit: (event: FormEvent<HTMLFormElement>) => void;
  setEditingEntryId: Dispatch<SetStateAction<string | null>>;
  editEntry: (entry: TimeEntry) => void;
  deleteEntry: (entry: TimeEntry) => void;
}

export default function CalendarTimeEntries({
  timer,
  selectedDate,
  now,
  stopTimer,
  dayEntries,
  dayMinutes,
  editingEntryId,
  entryTitle,
  setEntryTitle,
  entryStart,
  setEntryStart,
  entryEnd,
  setEntryEnd,
  entryMinutes,
  setEntryMinutes,
  saveEntryEdit,
  setEditingEntryId,
  editEntry,
  deleteEntry,
}: CalendarTimeEntriesProps) {
  return (
    <div className="calendar-time-section">
      <div className="section-heading">
        <h3>Учтённое время</h3>
        <strong>{minutesLabel(dayMinutes)}</strong>
      </div>
      {timer && (
        <div className="hub-day-row active-time-row">
          <span className="time-duration">…идёт</span>
          <span className="hub-row-title">{timer.title}</span>
          {dateKeyFromTimestamp(timer.startedAt) !== selectedDate && (
            <span className="task-tag">
              {formatDate(dateKeyFromTimestamp(timer.startedAt), {
                day: "numeric",
                month: "short",
              })}
            </span>
          )}
          <small>
            {clockTime(new Date(timer.startedAt))}–{clockTime(new Date(now))}
          </small>
          <button
            className="mini-action"
            title="Остановить и сохранить"
            aria-label="Остановить таймер и сохранить время"
            onClick={stopTimer}
          >
            <Icon name="stop" />
          </button>
        </div>
      )}
      <div className="calendar-time-list">
        {dayEntries.length === 0 && !timer && (
          <p className="empty-state">Записей за этот день нет.</p>
        )}
        {dayEntries.map((entry) =>
          editingEntryId === entry.id ? (
            <form
              className="hub-edit-row"
              key={entry.id}
              onSubmit={saveEntryEdit}
            >
              <input
                aria-label="Название записи"
                value={entryTitle}
                onChange={(event) => setEntryTitle(event.target.value)}
                required
              />
              {hasEditableClockTimes(entry) ? (
                <>
                  <input
                    aria-label="Начало"
                    type="time"
                    value={entryStart}
                    onChange={(event) => setEntryStart(event.target.value)}
                    required
                  />
                  <input
                    aria-label="Конец"
                    type="time"
                    value={entryEnd}
                    onChange={(event) => setEntryEnd(event.target.value)}
                    required
                  />
                </>
              ) : (
                <input
                  aria-label="Минуты старой записи"
                  type="number"
                  min="1"
                  step="1"
                  value={entryMinutes}
                  onChange={(event) => setEntryMinutes(event.target.value)}
                  required
                />
              )}
              <button
                type="submit"
                title="Сохранить"
                aria-label="Сохранить запись времени"
              >
                <Icon name="save" />
              </button>
              <button
                type="button"
                title="Отмена"
                aria-label="Отменить редактирование времени"
                onClick={() => setEditingEntryId(null)}
              >
                <Icon name="close" />
              </button>
            </form>
          ) : (
            <div className="hub-day-row" key={entry.id}>
              <span className="time-duration">
                {minutesLabel(entry.minutes)}
              </span>
              <span className="hub-row-title">{entry.title}</span>
              {entry.startTime && (
                <small>
                  {entry.startTime}
                  {entry.endTime && `–${entry.endTime}`}
                </small>
              )}
              <button
                className="mini-action"
                title="Редактировать"
                aria-label={`Редактировать запись ${entry.title}`}
                onClick={() => editEntry(entry)}
              >
                <Icon name="edit" />
              </button>
              <button
                className="mini-action danger-text"
                title="Удалить"
                aria-label={`Удалить запись ${entry.title}`}
                onClick={() => deleteEntry(entry)}
              >
                <Icon name="delete" />
              </button>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

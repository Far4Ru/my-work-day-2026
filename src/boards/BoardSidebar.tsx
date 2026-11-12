import type { Dispatch, RefObject, SetStateAction } from "react";
import type { Board } from "../data/model";
import Icon from "../ui/Icon";
import type { View } from "./types";

interface BoardSidebarProps {
  board: Board;
  boardNameInput: RefObject<HTMLInputElement | null>;
  boardNameDraft: string;
  setBoardNameDraft: Dispatch<SetStateAction<string>>;
  editingBoardName: boolean;
  setEditingBoardName: Dispatch<SetStateAction<boolean>>;
  saveBoardName: () => Promise<void>;
  view: View;
  setView: Dispatch<SetStateAction<View>>;
  confirmingBoardDelete: boolean;
  setConfirmingBoardDelete: Dispatch<SetStateAction<boolean>>;
  onDeleteBoard: (id: string) => Promise<boolean>;
  onOpenBoardGrid: () => void;
}

export default function BoardSidebar({
  board,
  boardNameInput,
  boardNameDraft,
  setBoardNameDraft,
  editingBoardName,
  setEditingBoardName,
  saveBoardName,
  view,
  setView,
  confirmingBoardDelete,
  setConfirmingBoardDelete,
  onDeleteBoard,
  onOpenBoardGrid,
}: BoardSidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand-slot">
        <div className="brand" tabIndex={0}>
          <img
            className="brand-mark"
            src={`${import.meta.env.BASE_URL}icons/logo.svg`}
            alt=""
            aria-hidden="true"
          />
          <span>
            My Work Day<small>Личный рабочий день</small>
          </span>
        </div>
        <button
          className="brand-grid-button"
          type="button"
          onClick={onOpenBoardGrid}
        >
          <span className="brand-grid-icon" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
          <span className="brand-grid-label">Все доски</span>
        </button>
      </div>
      <div className="board-identity">
        <div
          className={`board-identity-row${editingBoardName ? " board-identity-row--editing" : ""}`}
        >
          <input
            ref={boardNameInput}
            aria-label="Название доски"
            title="Название доски"
            maxLength={80}
            readOnly={!editingBoardName}
            value={boardNameDraft}
            onChange={(event) => setBoardNameDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && editingBoardName) {
                void saveBoardName();
              }
              if (event.key === "Escape") {
                setBoardNameDraft(board.name);
                setEditingBoardName(false);
              }
            }}
          />
          <button
            type="button"
            aria-label={
              editingBoardName ? "Сохранить название" : "Редактировать название"
            }
            title={editingBoardName ? "Сохранить" : "Редактировать"}
            onClick={() => {
              if (editingBoardName) {
                void saveBoardName();
              } else {
                setEditingBoardName(true);
              }
            }}
          >
            <Icon name={editingBoardName ? "save" : "edit"} />
          </button>
        </div>
      </div>
      <nav aria-label="Основная навигация" className="navigation">
        {(
          [
            ["tasks", "Задачи"],
            ["calendar", "Календарь"],
            ["statistics", "Статистика"],
            ["reports", "Отчёты"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={view === key ? "nav-button active" : "nav-button"}
            onClick={() => setView(key)}
          >
            <Icon name={key} />
            {label}
          </button>
        ))}
      </nav>
      <div className="board-delete-area">
        {confirmingBoardDelete ? (
          <div className="board-delete-confirmation">
            <span>Удалить доску и все её данные?</span>
            <div>
              <button
                type="button"
                onClick={() => void onDeleteBoard(board.id)}
              >
                Удалить
              </button>
              <button
                type="button"
                onClick={() => setConfirmingBoardDelete(false)}
              >
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <button
            className="board-delete-button"
            type="button"
            onClick={() => setConfirmingBoardDelete(true)}
          >
            Удалить доску
          </button>
        )}
      </div>
    </aside>
  );
}

import { useLayoutEffect, useRef, useState } from "react";
import type { Board } from "../data/model";
import Icon from "../ui/Icon";

interface BoardGridProps {
  boards: Board[];
  activeBoardId: string;
  allowBoardCreation: boolean;
  onAllowBoardCreationChange: (allow: boolean) => void;
  onClose: () => void;
  onSelect: (id: string) => void;
  onMove: (sourceId: string, targetId: string) => void;
  onReorder: (boardIds: string[]) => void;
}

export default function BoardGrid({
  boards,
  activeBoardId,
  allowBoardCreation,
  onAllowBoardCreationChange,
  onClose,
  onSelect,
  onMove,
  onReorder,
}: BoardGridProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [previewOrder, setPreviewOrder] = useState<string[] | null>(null);
  const previewOrderRef = useRef<string[] | null>(null);
  const previousRects = useRef<Map<string, DOMRect> | null>(null);
  const cardElements = useRef(new Map<string, HTMLButtonElement>());
  const listElement = useRef<HTMLDivElement>(null);
  const suppressSelection = useRef(false);
  const boardsById = new Map(boards.map((board) => [board.id, board]));
  const displayedBoards = previewOrder
    ? previewOrder.map((id) => boardsById.get(id)!).filter(Boolean)
    : boards;

  useLayoutEffect(() => {
    const before = previousRects.current;
    previousRects.current = null;
    if (
      !before ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    cardElements.current.forEach((element, id) => {
      if (id === draggedId) return;
      const oldRect = before.get(id);
      if (!oldRect) return;
      const newRect = element.getBoundingClientRect();
      const offsetX = oldRect.left - newRect.left;
      const offsetY = oldRect.top - newRect.top;
      if (Math.abs(offsetX) < 1 && Math.abs(offsetY) < 1) return;
      element.animate(
        [
          { transform: `translate(${offsetX}px, ${offsetY}px)` },
          { transform: "translate(0, 0)" },
        ],
        { duration: 240, easing: "cubic-bezier(0.25, 0.8, 0.25, 1)" },
      );
    });
  }, [previewOrder, draggedId]);

  function previewMove(targetId: string, pointerX: number, pointerY: number) {
    const ids = previewOrderRef.current;
    if (!draggedId || !ids || draggedId === targetId) return;
    const list = listElement.current;
    const target = cardElements.current.get(targetId);
    if (!list || !target) return;

    const listRect = list.getBoundingClientRect();
    const targetLeft = listRect.left + target.offsetLeft - list.scrollLeft;
    const targetTop = listRect.top + target.offsetTop - list.scrollTop;
    if (
      pointerX < targetLeft ||
      pointerX > targetLeft + target.offsetWidth ||
      pointerY < targetTop ||
      pointerY > targetTop + target.offsetHeight
    ) {
      return;
    }

    const fromIndex = ids.indexOf(draggedId);
    const toIndex = ids.indexOf(targetId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

    previousRects.current = new Map(
      [...cardElements.current].map(([id, element]) => [
        id,
        element.getBoundingClientRect(),
      ]),
    );
    const nextIds = [...ids];
    nextIds.splice(fromIndex, 1);
    nextIds.splice(toIndex, 0, draggedId);
    previewOrderRef.current = nextIds;
    setPreviewOrder(nextIds);
  }

  function finishDrag() {
    setDraggedId(null);
    setPreviewOrder(null);
    previewOrderRef.current = null;
    previousRects.current = null;
    suppressSelection.current = true;
    window.setTimeout(() => {
      suppressSelection.current = false;
    }, 0);
  }

  return (
    <>
      <h2
        className="board-grid-title"
        data-text="Все доски"
        aria-label="Все доски"
      >
        Все доски
      </h2>
      <label className="board-grid-add-toggle">
        <input
          type="checkbox"
          checked={allowBoardCreation}
          onChange={(event) => onAllowBoardCreationChange(event.target.checked)}
        />
        <span>Добавлять доски</span>
      </label>
      <div
        ref={listElement}
        className="board-grid-list"
        aria-label="Порядок досок"
      >
        {displayedBoards.map((board, index) => (
          <button
            key={board.id}
            ref={(element) => {
              if (element) cardElements.current.set(board.id, element);
              else cardElements.current.delete(board.id);
            }}
            type="button"
            className={[
              "board-grid-card",
              board.id === activeBoardId && "board-grid-card--active",
              board.id === draggedId && "board-grid-card--dragged",
            ]
              .filter(Boolean)
              .join(" ")}
            draggable
            aria-label={`${board.name}, позиция ${index + 1} из ${boards.length}. Открыть доску или переместить стрелками.`}
            onClick={() => {
              if (!suppressSelection.current) onSelect(board.id);
            }}
            onKeyDown={(event) => {
              const offset =
                event.key === "ArrowLeft" || event.key === "ArrowUp"
                  ? -1
                  : event.key === "ArrowRight" || event.key === "ArrowDown"
                    ? 1
                    : 0;
              if (!offset || !boards[index + offset]) return;
              event.preventDefault();
              onMove(board.id, boards[index + offset].id);
            }}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", board.id);
              const ids = boards.map((item) => item.id);
              previewOrderRef.current = ids;
              setPreviewOrder(ids);
              setDraggedId(board.id);
            }}
            onDragEnter={(event) => {
              previewMove(board.id, event.clientX, event.clientY);
            }}
            onDragOver={(event) => {
              if (draggedId) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              const ids = previewOrderRef.current;
              if (
                ids &&
                ids.some((id, position) => id !== boards[position].id)
              ) {
                onReorder(ids);
              }
              finishDrag();
            }}
            onDragEnd={finishDrag}
          >
            <span className="board-grid-card-top">
              <span className="board-grid-card-number">
                {String(index + 1).padStart(2, "0")}
              </span>
            </span>
            <span className="board-grid-card-silhouette" aria-hidden="true">
              <span />
            </span>
            <span className="board-grid-card-name">{board.name}</span>
            {board.id === activeBoardId && (
              <span className="board-grid-card-current">Текущая</span>
            )}
          </button>
        ))}
      </div>
      <button className="board-grid-back" type="button" onClick={onClose}>
        <Icon name="arrow-left" />
        <span className="board-grid-back-label">Вернуться к доске</span>
      </button>
    </>
  );
}

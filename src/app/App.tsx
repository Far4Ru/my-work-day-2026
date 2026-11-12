import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { edgeAction } from "../boards/boardNavigation";
import type { CarouselDirection } from "../boards/boardNavigation";
import BoardContent from "../boards/BoardContent";
import BoardGrid from "../boards/BoardGrid";
import { database } from "../data/database";
import type { Board } from "../data/model";
import Icon from "../ui/Icon";

const BOARD_CREATION_SETTING_KEY = "todo-did:allow-board-creation";

interface BoardTransition {
  fromId: string;
  toId: string;
  direction: CarouselDirection;
  moving: boolean;
}

function App() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [allowBoardCreation, setAllowBoardCreation] = useState(() => {
    try {
      return (
        window.localStorage.getItem(BOARD_CREATION_SETTING_KEY) !== "false"
      );
    } catch {
      return true;
    }
  });
  const [transition, setTransition] = useState<BoardTransition | null>(null);
  const [gridPhase, setGridPhase] = useState<
    "closed" | "opening" | "open" | "closing"
  >("closed");

  useLayoutEffect(() => {
    const root = document.getElementById("root");
    root?.classList.toggle(
      "board-grid-background-visible",
      gridPhase === "open",
    );

    return () => root?.classList.remove("board-grid-background-visible");
  }, [gridPhase]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        BOARD_CREATION_SETTING_KEY,
        String(allowBoardCreation),
      );
    } catch {
      // The toggle still works for this session when browser storage is blocked.
    }
  }, [allowBoardCreation]);

  const [boardError, setBoardError] = useState("");
  const [shiftPressed, setShiftPressed] = useState(false);
  const navigating = useRef(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      setShiftPressed(event.key === "Shift" || event.shiftKey);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      setShiftPressed(event.key === "Shift" ? false : event.shiftKey);
    };
    const onPointerMove = (event: PointerEvent) => {
      setShiftPressed(event.shiftKey);
    };
    const onBlur = () => setShiftPressed(false);

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([database.boards(), database.selectedBoardId()])
      .then(([storedBoards, selectedId]) => {
        if (cancelled) return;
        setBoards(storedBoards);
        const selectedBoard = storedBoards.find(
          (board) => board.id === selectedId,
        );
        setActiveBoardId(selectedBoard?.id ?? storedBoards[0]?.id ?? null);
      })
      .catch(() => {
        if (!cancelled)
          setBoardError("Не удалось загрузить доски из IndexedDB.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!transition || transition.moving) return;

    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        setTransition((current) =>
          current ? { ...current, moving: true } : null,
        );
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [transition]);

  useEffect(() => {
    if (!transition?.moving) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timeout = window.setTimeout(
      () => {
        setActiveBoardId(transition.toId);
        setTransition(null);
        navigating.current = false;
      },
      reducedMotion ? 0 : 920,
    );

    return () => window.clearTimeout(timeout);
  }, [transition]);

  useEffect(() => {
    if (gridPhase !== "opening") return;

    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => setGridPhase("open"));
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [gridPhase]);

  useEffect(() => {
    if (gridPhase !== "closing") return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timeout = window.setTimeout(
      () => {
        setGridPhase("closed");
        navigating.current = false;
      },
      reducedMotion ? 0 : 1220,
    );
    return () => window.clearTimeout(timeout);
  }, [gridPhase]);

  useEffect(() => {
    if (gridPhase !== "open") return;

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeBoardGrid();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [gridPhase]);

  function openBoardGrid() {
    if (navigating.current || gridPhase !== "closed") return;
    navigating.current = true;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setGridPhase("opening");
  }

  function closeBoardGrid() {
    if (gridPhase !== "open") return;
    setGridPhase("closing");
  }

  async function selectBoardFromGrid(id: string) {
    if (gridPhase !== "open") return;
    if (id === activeBoardId) {
      closeBoardGrid();
      return;
    }
    try {
      await database.saveSelectedBoardId(id);
      setActiveBoardId(id);
      setBoardError("");
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setGridPhase("closing"));
      });
    } catch {
      setBoardError("Не удалось открыть доску.");
    }
  }

  async function reorderBoardsInGrid(orderedIds: string[]) {
    const boardsById = new Map(boards.map((board) => [board.id, board]));
    setBoards(
      orderedIds.map((id, position) => ({
        ...boardsById.get(id)!,
        position,
      })),
    );
    try {
      await database.reorderBoards(orderedIds);
      setBoardError("");
    } catch {
      void database
        .boards()
        .then(setBoards)
        .catch(() => {});
      setBoardError("Не удалось изменить порядок досок.");
    }
  }

  function moveBoardInGrid(sourceId: string, targetId: string) {
    const fromIndex = boards.findIndex((board) => board.id === sourceId);
    const toIndex = boards.findIndex((board) => board.id === targetId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

    const orderedIds = boards.map((board) => board.id);
    orderedIds.splice(fromIndex, 1);
    orderedIds.splice(toIndex, 0, sourceId);
    void reorderBoardsInGrid(orderedIds);
  }

  async function renameBoard(id: string, name: string): Promise<boolean> {
    const board = boards.find((item) => item.id === id);
    if (!board) return false;

    try {
      const updated = { ...board, name };
      await database.saveBoard(updated);
      setBoards((current) =>
        current.map((item) => (item.id === id ? updated : item)),
      );
      setBoardError("");
      return true;
    } catch {
      setBoardError("Не удалось сохранить название доски.");
      return false;
    }
  }

  async function selectBoard(
    targetId: string,
    direction: CarouselDirection,
  ): Promise<void> {
    if (navigating.current || !activeBoardId || targetId === activeBoardId) {
      return;
    }

    navigating.current = true;
    try {
      await database.saveSelectedBoardId(targetId);
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      setBoardError("");
      setTransition({
        fromId: activeBoardId,
        toId: targetId,
        direction,
        moving: false,
      });
    } catch {
      navigating.current = false;
      setBoardError("Не удалось перейти на другую доску.");
    }
  }

  async function createBoard(direction: CarouselDirection): Promise<void> {
    if (!allowBoardCreation || navigating.current || !activeBoardId) return;

    navigating.current = true;
    const currentIndex = boards.findIndex(
      (board) => board.id === activeBoardId,
    );
    const insertIndex = currentIndex + (direction === 1 ? 1 : 0);
    let number = boards.length + 1;
    while (boards.some((board) => board.name === `Доска ${number}`)) {
      number += 1;
    }

    const board: Board = {
      id: crypto.randomUUID(),
      name: `Доска ${number}`,
      position: insertIndex,
    };

    try {
      const updatedBoards = await database.insertBoard(board, insertIndex);
      setBoards(updatedBoards);
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      setBoardError("");
      setTransition({
        fromId: activeBoardId,
        toId: board.id,
        direction,
        moving: false,
      });
    } catch {
      navigating.current = false;
      setBoardError("Не удалось создать доску.");
      void database
        .boards()
        .then(setBoards)
        .catch(() => {});
    }
  }

  function useEdge(direction: CarouselDirection, shiftKey: boolean) {
    if (!activeBoardId) return;
    const action = edgeAction(
      boards,
      activeBoardId,
      direction,
      allowBoardCreation && shiftKey,
    );
    if (action.kind === "create") {
      if (allowBoardCreation) void createBoard(direction);
      return;
    }

    void selectBoard(action.targetId, direction);
  }

  async function removeBoard(id: string): Promise<boolean> {
    if (navigating.current || id !== activeBoardId) return false;

    navigating.current = true;
    const currentIndex = boards.findIndex((board) => board.id === id);
    const neighbor = boards[currentIndex - 1] ?? boards[currentIndex + 1];
    const replacement: Board | undefined = neighbor
      ? undefined
      : {
          id: crypto.randomUUID(),
          name: "Моя доска",
          position: 0,
        };
    const nextBoardId = neighbor?.id ?? replacement!.id;

    try {
      await database.deleteBoard(id, nextBoardId, replacement);
      setBoards((current) => [
        ...current.filter((board) => board.id !== id),
        ...(replacement ? [replacement] : []),
      ]);
      setActiveBoardId(nextBoardId);
      setBoardError("");
      return true;
    } catch {
      setBoardError("Не удалось полностью удалить доску.");
      try {
        const [storedBoards, selectedId] = await Promise.all([
          database.boards(),
          database.selectedBoardId(),
        ]);
        setBoards(storedBoards);
        if (!storedBoards.some((board) => board.id === id)) {
          const selectedBoard = storedBoards.find(
            (board) => board.id === selectedId,
          );
          setActiveBoardId(selectedBoard?.id ?? storedBoards[0]?.id ?? null);
        }
      } catch {
        setBoardError("Не удалось загрузить список досок после удаления.");
      }
      return false;
    } finally {
      navigating.current = false;
    }
  }

  const activeBoard = boards.find((board) => board.id === activeBoardId);
  if (!activeBoard) {
    return (
      <div className="board-startup" role={boardError ? "alert" : "status"}>
        {boardError || "Загрузка доски…"}
      </div>
    );
  }

  const visibleBoards = transition
    ? [
        boards.find((board) => board.id === transition.fromId),
        boards.find((board) => board.id === transition.toId),
      ].filter((board): board is Board => board !== undefined)
    : [activeBoard];
  const edgeBoardId = transition?.toId ?? activeBoard.id;
  const gridMotionClass =
    gridPhase === "closed" ? "" : " board-slide--grid-transition";

  return (
    <>
      <div className="board-carousel-stage">
        {visibleBoards.map((board) => {
          let motionClass = "";
          if (transition?.fromId === board.id && transition.moving) {
            motionClass =
              transition.direction === 1
                ? "board-slide--left"
                : "board-slide--right";
          }
          if (transition?.toId === board.id && !transition.moving) {
            motionClass =
              transition.direction === 1
                ? "board-slide--right"
                : "board-slide--left";
          }
          if (gridPhase === "open") {
            motionClass = "board-slide--grid-hidden";
          }

          return (
            <div
              key={board.id}
              className={`board-slide ${motionClass}${gridMotionClass}`}
              inert={transition !== null || gridPhase !== "closed"}
            >
              <BoardContent
                board={board}
                onRenameBoard={renameBoard}
                onDeleteBoard={removeBoard}
                onOpenBoardGrid={openBoardGrid}
              />
            </div>
          );
        })}
        {gridPhase !== "closed" && (
          <div
            className={`board-grid-screen${gridPhase === "open" ? " board-grid-screen--visible" : ""}`}
            inert={gridPhase !== "open"}
          >
            <BoardGrid
              boards={boards}
              activeBoardId={activeBoard.id}
              allowBoardCreation={allowBoardCreation}
              onAllowBoardCreationChange={setAllowBoardCreation}
              onClose={closeBoardGrid}
              onSelect={(id) => void selectBoardFromGrid(id)}
              onMove={(sourceId, targetId) => {
                moveBoardInGrid(sourceId, targetId);
              }}
              onReorder={(ids) => void reorderBoardsInGrid(ids)}
            />
          </div>
        )}
      </div>

      {gridPhase === "closed" &&
        ([-1, 1] as const).map((direction) => {
          const isLeft = direction === -1;
          const action = edgeAction(
            boards,
            edgeBoardId,
            direction,
            allowBoardCreation && shiftPressed,
          );
          if (action.kind === "create" && !allowBoardCreation) return null;
          const label =
            action.kind === "create"
              ? isLeft
                ? "Добавить доску слева"
                : "Добавить доску справа"
              : isLeft
                ? "Предыдущая доска"
                : "Следующая доска";
          return (
            <button
              key={direction}
              type="button"
              className={`board-edge-button ${isLeft ? "board-edge-button--left" : "board-edge-button--right"}`}
              aria-label={label}
              title={
                allowBoardCreation ? `${label} — Shift меняет действие` : label
              }
              disabled={transition !== null}
              onPointerDown={(event) => setShiftPressed(event.shiftKey)}
              onClick={(event) => useEdge(direction, event.shiftKey)}
            >
              <span className="board-edge-button-face" aria-hidden="true">
                <Icon
                  name={
                    action.kind === "create"
                      ? "plus"
                      : isLeft
                        ? "chevron-left"
                        : "chevron-right"
                  }
                />
              </span>
            </button>
          );
        })}

      {boardError && (
        <div className="board-error" role="alert">
          {boardError}
        </div>
      )}
    </>
  );
}

export default App;

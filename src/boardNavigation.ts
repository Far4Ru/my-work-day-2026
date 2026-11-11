import type { Board } from "./model";

export type CarouselDirection = -1 | 1;

export type EdgeAction =
  { kind: "create" } | { kind: "navigate"; targetId: string };

export function edgeAction(
  boards: Board[],
  activeBoardId: string,
  direction: CarouselDirection,
  altPressed: boolean,
): EdgeAction {
  const currentIndex = boards.findIndex((board) => board.id === activeBoardId);
  if (currentIndex < 0 || boards.length === 1) {
    return { kind: "create" };
  }

  const nextIndex = currentIndex + direction;
  const hasNeighbor = nextIndex >= 0 && nextIndex < boards.length;
  if (hasNeighbor !== altPressed) {
    const targetIndex = hasNeighbor
      ? nextIndex
      : direction === -1
        ? boards.length - 1
        : 0;
    return { kind: "navigate", targetId: boards[targetIndex].id };
  }

  return { kind: "create" };
}

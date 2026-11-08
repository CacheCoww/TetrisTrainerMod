import {
  NUM_ROW,
  NUM_COLUMN,
  SQUARE_SIZE,
  BOARD_HEIGHT,
  DISPLAY_FULL_WIDTH,
} from "./constants.js";
import { PIECE_LOOKUP } from "./tetrominoes.js";

// Use the same existing canvas as the yellow hint.
const canvas = document.getElementById("live-hint-canvas");
if (!canvas) {
  throw new Error("Missing #live-hint-canvas in docs/index.html");
}
const ctx = canvas.getContext("2d");
canvas.width = DISPLAY_FULL_WIDTH;
canvas.height = BOARD_HEIGHT;

let showNextHint = true;
let visibleHint = null;

/** Convert a StackRabbit [rotation, xShift, yFromSpawn] to 4 board cells. */
function placementToCells(placement, pieceId) {
  const rotations = PIECE_LOOKUP[pieceId]?.[0];
  if (
    !rotations ||
    !Array.isArray(placement) ||
    placement.length !== 3 ||
    !placement.every(Number.isInteger)
  )
    return null;

  const [rotation, xShift, yFromSpawn] = placement;
  const shape =
    rotations[
      ((rotation % rotations.length) + rotations.length) % rotations.length
    ];
  const x = 3 + xShift;
  const y = (pieceId === "I" ? -2 : -1) + yFromSpawn;
  const cells = [];

  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c]) cells.push({ row: y + r, col: x + c });
    }
  }

  if (
    cells.length !== 4 ||
    cells.some(
      ({ row, col }) =>
        row < 0 || row >= NUM_ROW || col < 0 || col >= NUM_COLUMN
    )
  )
    return null;
  return cells;
}

/** Board AFTER the first piece locks AND all completed lines clear. */
function boardAfterFirstPlacement(boardStr, cells) {
  if (
    typeof boardStr !== "string" ||
    boardStr.length !== NUM_ROW * NUM_COLUMN ||
    /[^01]/.test(boardStr)
  ) {
    return null;
  }
  const board = Array.from({ length: NUM_ROW }, (_, r) =>
    Array.from({ length: NUM_COLUMN }, (_, c) =>
      Number(boardStr[r * NUM_COLUMN + c])
    )
  );
  for (const { row, col } of cells) {
    if (board[row][col] !== 0) return null;
    board[row][col] = 1;
  }
  const remainingRows = board.filter((row) => row.some((cell) => cell === 0));
  while (remainingRows.length < NUM_ROW) {
    remainingRows.unshift(Array(NUM_COLUMN).fill(0));
  }
  return remainingRows;
}

function drawCells(cells, { fill, stroke, width, dash = [] }) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  for (const { row, col } of cells) {
    const x = col * SQUARE_SIZE;
    const y = row * SQUARE_SIZE;
    ctx.fillRect(x + 2, y + 2, SQUARE_SIZE - 4, SQUARE_SIZE - 4);
    ctx.strokeRect(x + 2, y + 2, SQUARE_SIZE - 4, SQUARE_SIZE - 4);
  }
  ctx.restore();
}

function redrawHints() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!visibleHint) return;

  // Paint the future plan FIRST so the current recommendation is clearest.
  if (showNextHint && visibleHint.nextCells) {
    drawCells(visibleHint.nextCells, {
      fill: "rgba(64, 200, 255, 0.09)",
      stroke: "rgba(64, 200, 255, 0.60)",
      width: 1.5,
      dash: [4, 3],
    });
  }

  drawCells(visibleHint.currentCells, {
    fill: "rgba(255, 213, 74, 0.20)",
    stroke: "#FFD54A",
    width: 2,
  });
}

export function clearLiveHint() {
  visibleHint = null;
  redrawHints();
}

/** Toggle cyan next-piece preview without recalculating StackRabbit. */
export function setShowNextHint(enabled) {
  showNextHint = Boolean(enabled);
  redrawHints();
}

/**
 * Draw the best current placement plus, when available, its recommended
 * second placement. Returns current piece cells for optional coaching code.
 */
export function showLiveHint(move, currentPieceId, boardStr, nextPieceId) {
  visibleHint = null;
  const currentCells = placementToCells(move?.firstPlacement, currentPieceId);
  if (!currentCells) {
    console.warn("[LiveHint] Invalid current placement:", move?.firstPlacement);
    redrawHints();
    return null;
  }

  let nextCells = null;
  const hasSecond =
    Array.isArray(move?.secondPlacement) && nextPieceId && nextPieceId !== "-1";
  if (hasSecond) {
    const boardAfterFirst = boardAfterFirstPlacement(boardStr, currentCells);
    const proposed = placementToCells(move.secondPlacement, nextPieceId);
    if (
      boardAfterFirst &&
      proposed &&
      proposed.every(({ row, col }) => boardAfterFirst[row][col] === 0)
    ) {
      nextCells = proposed;
    } else {
      console.warn("[LiveHint] Skipping unverified next placement:", {
        nextPieceId,
        placement: move.secondPlacement,
      });
    }
  }

  visibleHint = { currentCells, nextCells };
  redrawHints();
  console.log("[LiveHint] Current cells:", currentCells);
  console.log("[LiveHint] Next-piece projected cells:", nextCells);
  return currentCells;
}

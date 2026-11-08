import {
  showLiveHint,
  clearLiveHint,
  setShowNextHint,
} from "./live_hint_overlay.js";

export class LiveHintManager {
  constructor() {
    const nextToggle = document.getElementById("live-hint-show-next");

    if (nextToggle) {
      const saved = localStorage.getItem("liveHintShowNext");

      if (saved !== null) {
        nextToggle.checked = saved === "true";
      }

      setShowNextHint(nextToggle.checked);

      nextToggle.addEventListener("change", () => {
        setShowNextHint(nextToggle.checked);

        localStorage.setItem("liveHintShowNext", String(nextToggle.checked));
      });
    }

    this.worker = new Worker("./wasm/stackrabbit-worker.js");
    this.ready = false;
    this.generation = 0;
    this.pending = null;
    this.inFlight = null;

    this.worker.onmessage = (event) => {
      const data = event.data;

      // Worker initialization confirmed.
      if (data.result === "ready") {
        this.ready = true;
        clearInterval(this.readyTimer);
        console.log("[LiveHint] StackRabbit ready");
        this.sendLatest();
        return;
      }

      const request = this.inFlight;
      if (!request) return;

      this.inFlight = null;

      // Only display results for the newest piece.
      if (request.generation === this.generation) {
        if (data.error) {
          console.error("[LiveHint] AI error:", data.error);
        } else {
          const result = data.result;

          // With the next piece known, prefer the
          // next-piece adjustment recommendation.
          const bestMove =
            result?.nextBox?.find((move) =>
              Array.isArray(move.secondPlacement)
            ) ?? result?.noNextBox?.[0];

          if (bestMove) {
            console.log("[LiveHint] Best move:", {
              piece: request.params.currentPiece,
              nextPiece: request.params.nextPiece,
              placement: bestMove.firstPlacement,
              score: bestMove.playoutScore,
              fullMove: bestMove,
            });
            console.log("[Coach] StackRabbit evaluation:", {
              placement: bestMove.firstPlacement,
              score: bestMove.playoutScore,
              shallowScore: bestMove.shallowEvalScore,
              evaluationFactors: bestMove.evalExplanation,
            });
            const cells = showLiveHint(
              bestMove,
              request.params.currentPiece,
              request.params.board,
              request.params.nextPiece
            );
          } else {
            console.warn("[LiveHint] No move found", result);
          }
        }
      }

      // If another piece spawned during computation,
      // start analyzing the newest piece.
      this.sendLatest();
    };

    this.worker.onerror = (error) => {
      console.error("[LiveHint] Worker error:", error);
    };

    // The existing WASM worker does not announce
    // readiness, so probe until it responds.
    this.readyTimer = setInterval(() => {
      if (!this.ready) {
        this.worker.postMessage(["ping", {}]);
      }
    }, 250);
  }

  onPieceSpawn(state) {
    this.generation++;
    clearLiveHint();
    this.pending = {
      generation: this.generation,
      params: {
        board: state.board,
        currentPiece: state.currentPiece,
        nextPiece: state.nextPiece,
        level: Math.max(state.level || 0, 18),
        lines: state.lines || 0,
        inputFrameTimeline:
          document.getElementById("engine-tap-speed")?.value || "X.....",
        playoutLength: 2,
        playoutCount: 49,
        pruningBreadth: 12,
        aggressionLevel:
          document.getElementById("engine-aggression-select")?.value || "safe",
      },
    };

    this.sendLatest();
  }

  onPieceLock() {
    this.generation++;
    this.pending = null;
    clearLiveHint();
  }

  sendLatest() {
    if (!this.ready || this.inFlight || !this.pending) {
      return;
    }

    this.inFlight = this.pending;
    this.pending = null;

    this.worker.postMessage(["getTopMovesHybrid", this.inFlight.params]);
  }
}

/**
 * Room 6: Shared Drawing
 * Realtime shared canvas with pen + erase
 * Users can draw or just watch
 * Syncs strokes via WebSocket
 */

import { useCallback, useEffect, useRef, useState } from "react";

const COLORS = ["#ffffff", "#ff6b6b", "#4ecdc4", "#ffe66d", "#95e1d3"];
const LINE_WIDTH = 3;
const ERASER_WIDTH = 20;

// Draw a single stroke on canvas (pure function, no hooks)
function drawStrokeOnCanvas(ctx, stroke) {
  if (!stroke.points || stroke.points.length < 2) return;

  ctx.beginPath();
  ctx.strokeStyle = stroke.tool === "eraser" ? "#1a1a2e" : stroke.color;
  ctx.lineWidth =
    stroke.tool === "eraser" ? ERASER_WIDTH : stroke.width || LINE_WIDTH;

  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (let i = 1; i < stroke.points.length; i++) {
    ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
  }
  ctx.stroke();
}

export function Room6Drawing({
  participantId,
  presenceCount,
  drawingStrokes,
  onStroke,
  onIdleWithOthers,
  hasInteracted,
  sendStroke,
  clearDrawing,
}) {
  const [tool, setTool] = useState("pen"); // 'pen' or 'eraser'
  const [color, setColor] = useState(COLORS[0]);
  const [isDrawing, setIsDrawing] = useState(false);

  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const currentStrokeRef = useRef([]);
  const strokeIdRef = useRef(0);
  const idleTrackingRef = useRef(null);
  const presenceCountRef = useRef(presenceCount);
  const hasInteractedRef = useRef(hasInteracted);

  // Keep refs updated
  useEffect(() => {
    presenceCountRef.current = presenceCount;
  }, [presenceCount]);

  useEffect(() => {
    hasInteractedRef.current = hasInteracted;
  }, [hasInteracted]);

  // Track idle time with others
  useEffect(() => {
    idleTrackingRef.current = setInterval(() => {
      if (presenceCountRef.current > 1 && !hasInteractedRef.current()) {
        onIdleWithOthers(1000);
      }
    }, 1000);

    return () => {
      if (idleTrackingRef.current) {
        clearInterval(idleTrackingRef.current);
      }
    };
  }, [onIdleWithOthers]);

  // Redraw canvas from stroke history
  const redrawCanvas = useCallback(() => {
    const ctx = contextRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;

    // Clear canvas
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw all strokes
    drawingStrokes.forEach((stroke) => {
      drawStrokeOnCanvas(ctx, stroke);
    });
  }, [drawingStrokes]);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas size
    const updateSize = () => {
      const container = canvas.parentElement;
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      contextRef.current = ctx;
    };

    updateSize();
    window.addEventListener("resize", updateSize);

    return () => {
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  // Redraw when strokes change
  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  // Get position from event
  const getPosition = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    if (e.touches) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }

    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  // Start drawing
  const handleStart = useCallback(
    (e) => {
      e.preventDefault();
      const pos = getPosition(e);

      setIsDrawing(true);
      currentStrokeRef.current = [pos];

      // Draw first point
      const ctx = contextRef.current;
      if (ctx) {
        ctx.beginPath();
        ctx.strokeStyle = tool === "eraser" ? "#1a1a2e" : color;
        ctx.lineWidth = tool === "eraser" ? ERASER_WIDTH : LINE_WIDTH;
        ctx.moveTo(pos.x, pos.y);
      }
    },
    [tool, color]
  );

  // Continue drawing
  const handleMove = useCallback(
    (e) => {
      if (!isDrawing) return;
      e.preventDefault();

      const pos = getPosition(e);
      currentStrokeRef.current.push(pos);

      // Draw to canvas
      const ctx = contextRef.current;
      if (ctx) {
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
      }
    },
    [isDrawing]
  );

  // End drawing
  const handleEnd = useCallback(
    (e) => {
      if (!isDrawing) return;
      e?.preventDefault();

      setIsDrawing(false);

      // Only save if we have points
      if (currentStrokeRef.current.length > 1) {
        strokeIdRef.current += 1;
        const strokeId = `${participantId}-${strokeIdRef.current}`;

        const stroke = {
          strokeId,
          points: currentStrokeRef.current,
          color,
          width: LINE_WIDTH,
          tool,
        };

        // Record stroke (marks as interaction)
        onStroke();

        // Send to server
        sendStroke(stroke);
      }

      currentStrokeRef.current = [];
    },
    [isDrawing, participantId, color, tool, onStroke, sendStroke]
  );

  // Handle clear
  const handleClear = () => {
    clearDrawing();
  };

  return (
    <div className="room6-content">
      <div className="drawing-toolbar">
        <div className="tool-group">
          <button
            className={`tool-btn ${tool === "pen" ? "active" : ""}`}
            onClick={() => setTool("pen")}
            title="Pen"
          >
            ✏️
          </button>
          <button
            className={`tool-btn ${tool === "eraser" ? "active" : ""}`}
            onClick={() => setTool("eraser")}
            title="Eraser"
          >
            🧽
          </button>
        </div>

        <div className="color-group">
          {COLORS.map((c) => (
            <button
              key={c}
              className={`color-btn ${color === c ? "active" : ""}`}
              style={{ backgroundColor: c }}
              onClick={() => setColor(c)}
              title={c}
            />
          ))}
        </div>

        <button className="clear-btn" onClick={handleClear}>
          Clear All
        </button>
      </div>

      <div className="drawing-canvas-container">
        <canvas
          ref={canvasRef}
          className="drawing-canvas"
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
        />
      </div>

      <div className="room-info">
        <div className="presence-indicator">
          <span className="presence-dot active" />
          <span>
            {presenceCount} {presenceCount === 1 ? "person" : "people"} in room
          </span>
        </div>
        <p className="room-note">
          Draw together or just watch. Strokes sync in real-time.
        </p>
      </div>
    </div>
  );
}

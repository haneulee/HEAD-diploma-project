/**
 * Room 6: Shared Drawing
 * Realtime shared canvas with pen + erase
 * Users can draw or just watch
 * Syncs strokes via WebSocket
 */

import { useCallback, useEffect, useRef, useState } from "react";

const COLORS = [
  "#ff0000", // red
  "#ffff00", // yellow
  "#00ff00", // green
  "#0000ff", // blue
  "#000000", // black
];
const LINE_WIDTH = 3;
const ERASER_WIDTH = 20;

// Draw a single stroke on canvas (pure function, no hooks)
function drawStrokeOnCanvas(ctx, stroke, scaleX = 1, scaleY = 1) {
  if (!stroke.points || stroke.points.length < 2) return;

  ctx.beginPath();
  ctx.strokeStyle = stroke.tool === "eraser" ? "#ffffff" : stroke.color;
  const baseWidth =
    stroke.tool === "eraser" ? ERASER_WIDTH : stroke.width || LINE_WIDTH;
  // Scale width so strokes look similar across devices
  const wScale = Math.min(scaleX, scaleY);
  ctx.lineWidth = baseWidth * wScale;

  ctx.moveTo(stroke.points[0].x * scaleX, stroke.points[0].y * scaleY);
  for (let i = 1; i < stroke.points.length; i++) {
    ctx.lineTo(stroke.points[i].x * scaleX, stroke.points[i].y * scaleY);
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
  const canvasSizeRef = useRef({ w: 0, h: 0 }); // CSS pixels
  const currentStrokeRef = useRef([]);
  const currentStrokeStyleRef = useRef({
    tool: "pen",
    color: COLORS[0],
    width: LINE_WIDTH,
  });
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

    const { w: canvasW, h: canvasH } = canvasSizeRef.current;
    if (!canvasW || !canvasH) return;

    // Clear canvas
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Draw all strokes
    drawingStrokes.forEach((stroke) => {
      const srcW = stroke.canvasW || canvasW;
      const srcH = stroke.canvasH || canvasH;
      const scaleX = srcW ? canvasW / srcW : 1;
      const scaleY = srcH ? canvasH / srcH : 1;
      drawStrokeOnCanvas(ctx, stroke, scaleX, scaleY);
    });

    // Also draw the in-progress stroke so it doesn't "disappear"
    if (currentStrokeRef.current.length > 1) {
      const s = currentStrokeStyleRef.current;
      drawStrokeOnCanvas(ctx, {
        points: currentStrokeRef.current,
        color: s.color,
        width: s.width,
        tool: s.tool,
      });
    }
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

      canvasSizeRef.current = { w: rect.width, h: rect.height };
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const ctx = canvas.getContext("2d");
      // Avoid cumulative scaling on resize
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
      currentStrokeStyleRef.current = {
        tool,
        color,
        width: LINE_WIDTH,
      };

      // Draw first point
      const ctx = contextRef.current;
      if (ctx) {
        ctx.beginPath();
        ctx.strokeStyle = tool === "eraser" ? "#ffffff" : color;
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
      const pts = currentStrokeRef.current;
      const last = pts[pts.length - 1];
      pts.push(pos);

      // Draw to canvas
      const ctx = contextRef.current;
      if (ctx) {
        // Re-apply style each move because redrawCanvas() can change it
        const s = currentStrokeStyleRef.current;
        ctx.strokeStyle = s.tool === "eraser" ? "#ffffff" : s.color;
        ctx.lineWidth =
          s.tool === "eraser" ? ERASER_WIDTH : s.width || LINE_WIDTH;

        // Draw a single segment (safe even if canvas was redrawn mid-stroke)
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
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

        const s = currentStrokeStyleRef.current;
        const { w: canvasW, h: canvasH } = canvasSizeRef.current;
        const stroke = {
          strokeId,
          points: currentStrokeRef.current,
          canvasW,
          canvasH,
          color: s.color,
          width: s.width || LINE_WIDTH,
          tool: s.tool,
        };

        // Record stroke (marks as interaction)
        onStroke();

        // Send to server
        sendStroke(stroke);
      }

      currentStrokeRef.current = [];
    },
    [isDrawing, participantId, onStroke, sendStroke]
  );

  // Handle clear
  const handleClear = () => {
    clearDrawing();
  };

  return (
    <div className="room4-content">
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
          <div className="color-picker-wrapper">
            <label className="color-picker-label" title="Custom color">
              <input
                type="color"
                className="color-picker"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
              <span className="color-picker-icon">🎨</span>
            </label>
          </div>
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

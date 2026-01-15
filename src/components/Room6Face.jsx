/**
 * Room 6: Face
 * Local-only face landmark detection (no remote video processing).
 * Sends only minimal 2D points (eyes/nose/mouth) at ~10–15fps.
 * Renders received points as thin ambient line traces on a canvas.
 */

import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const SEND_FPS = 12;
const STALE_MS = 4000;

// Minimal landmark indices (MediaPipe Face Mesh / FaceLandmarker)
// Order matters: receiver draws lines using the same order.
const FACE_PARTS = [
  // left eye (approx outline)
  { name: "leftEye", idx: [33, 159, 133, 145, 33] },
  // right eye
  { name: "rightEye", idx: [362, 386, 263, 374, 362] },
  // nose (bridge + tip)
  { name: "nose", idx: [168, 6, 1, 4] },
  // mouth
  { name: "mouth", idx: [61, 13, 291, 14, 61] },
];

function colorFromId(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsla(${hue}, 55%, 75%, 0.45)`;
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

export function Room6Face({ participantId, faceStates, sendFace }) {
  const [hasPermission, setHasPermission] = useState(null);
  const [error, setError] = useState(null);

  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const rafRef = useRef(null);
  const lastSendRef = useRef(0);
  const landmarkerRef = useRef(null);
  const runningRef = useRef(false);

  const localColor = useMemo(() => colorFromId(participantId), [participantId]);

  const setupCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const r = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(r.width * dpr);
    canvas.height = Math.floor(r.height * dpr);
    canvas.style.width = `${r.width}px`;
    canvas.style.height = `${r.height}px`;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  // Local camera stream (low-res)
  useEffect(() => {
    let stream;
    async function run() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 320 },
            height: { ideal: 240 },
            frameRate: { ideal: 15, max: 15 },
          },
          audio: false,
        });
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        // Don't await play(): on some mobile browsers it can hang without a user gesture.
        // We'll start detection once frames are available.
        video.play().catch(() => {});
        setHasPermission(true);
      } catch (e) {
        setHasPermission(false);
        setError(
          e?.name === "NotAllowedError"
            ? "Camera permission denied."
            : e?.message || "Could not access camera."
        );
      }
    }
    run();
    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Init face landmarker (WASM + model) after permission
  useEffect(() => {
    if (hasPermission !== true) return;
    let cancelled = false;
    async function init() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          },
          runningMode: "VIDEO",
          numFaces: 1,
        });
        if (cancelled) return;
        landmarkerRef.current = landmarker;
      } catch (e) {
        setError(e?.message || "Failed to initialize face detector.");
      }
    }
    init();
    return () => {
      cancelled = true;
      landmarkerRef.current = null;
    };
  }, [hasPermission]);

  // Resize observer
  useEffect(() => {
    setupCanvasSize();
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setupCanvasSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [setupCanvasSize]);

  const drawLines = useCallback((ctx, points, color) => {
    if (!points || points.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
  }, []);

  // Main loop: detect locally (throttled), and render all received faces.
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext("2d");
    runningRef.current = true;

    const loop = () => {
      if (!runningRef.current) return;
      const now = performance.now();

      // Clear
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      // Soft background for ambient feel
      ctx.fillStyle = "rgba(0,0,0,0.06)";
      ctx.fillRect(0, 0, w, h);

      // Render remote + local states (no IDs)
      const tNow = Date.now();
      Object.entries(faceStates || {}).forEach(([id, s]) => {
        if (!s?.points?.length) return;
        if (tNow - (s.timestamp || 0) > STALE_MS) return;
        const c = id === participantId ? localColor : colorFromId(id);
        const pts = s.points
          .map((p) => ({
            x: clamp01(p.x) * w,
            y: clamp01(p.y) * h,
          }));

        // Reconstruct parts in fixed order
        let offset = 0;
        for (const part of FACE_PARTS) {
          const count = part.idx.length;
          const seg = pts.slice(offset, offset + count);
          drawLines(ctx, seg, c);
          offset += count;
        }
      });

      // Local detection + send (10–15 fps)
      const minInterval = 1000 / SEND_FPS;
      if (now - lastSendRef.current >= minInterval && landmarkerRef.current) {
        lastSendRef.current = now;
        try {
          const res = landmarkerRef.current.detectForVideo(video, now);
          const landmarks = res?.faceLandmarks?.[0];
          if (landmarks && landmarks.length) {
            const out = [];
            for (const part of FACE_PARTS) {
              for (const idx of part.idx) {
                const lm = landmarks[idx];
                if (!lm) continue;
                out.push({ x: lm.x, y: lm.y });
              }
            }
            if (out.length) {
              sendFace({ points: out });
            }
          }
        } catch {
          // ignore detection errors frame-to-frame
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      runningRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [faceStates, participantId, localColor, drawLines, sendFace]);

  if (hasPermission === false) {
    return (
      <div className="room-permission-denied">
        <div className="permission-icon">🙂</div>
        <h3>Camera Required</h3>
        <p>{error}</p>
      </div>
    );
  }

  if (hasPermission === null) {
    return (
      <div className="room-loading">
        <div className="loading-spinner" />
        <p>Requesting camera access...</p>
      </div>
    );
  }

  return (
    <div className="face-room">
      <div className="face-stage" ref={containerRef}>
        <canvas ref={canvasRef} className="face-canvas" />
        {/* Hidden local video: used only for local landmark detection */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ display: "none" }}
        />
      </div>
      {error ? <p className="face-note">Note: {error}</p> : null}
    </div>
  );
}


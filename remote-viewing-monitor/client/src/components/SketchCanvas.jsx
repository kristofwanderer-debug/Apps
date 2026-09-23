import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";

// A touch/stylus/mouse-friendly freehand sketch canvas. Parent gets a ref
// with .exportDataUrl() and .clear() so it can pull the sketch out on
// "Next Stage" / "Finished" without the canvas needing to know about the
// session lifecycle itself.
const SketchCanvas = forwardRef(function SketchCanvas({ label }, ref) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  const getPos = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (point.clientX - rect.left) * scaleX, y: (point.clientY - rect.top) * scaleY };
  }, []);

  const start = useCallback((e) => {
    e.preventDefault();
    drawing.current = true;
    last.current = getPos(e);
  }, [getPos]);

  const move = useCallback((e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    last.current = pos;
  }, [getPos]);

  const end = useCallback(() => {
    drawing.current = false;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const prev = canvas.toDataURL();
      canvas.width = rect.width * dpr;
      canvas.height = 260 * dpr;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#f5f5f0";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (prev && prev.length > 100) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        img.src = prev;
      }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useImperativeHandle(ref, () => ({
    exportDataUrl: () => canvasRef.current.toDataURL("image/png"),
    clear: () => {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#f5f5f0";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    },
    isBlank: () => {
      // cheap heuristic: compare against a freshly-cleared canvas of the same size
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] !== 245 || data[i + 1] !== 245 || data[i + 2] !== 240) return false;
      }
      return true;
    },
  }));

  return (
    <div>
      <div className="canvas-wrap">
        <canvas
          ref={canvasRef}
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
      </div>
      <div className="canvas-toolbar">
        <span style={{ marginRight: "auto", color: "var(--text-dim)", fontSize: "0.8rem" }}>{label}</span>
        <button type="button" className="btn" onClick={() => ref.current?.clear()}>Clear</button>
      </div>
    </div>
  );
});

export default SketchCanvas;

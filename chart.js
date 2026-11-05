(function (g) {
  const green = "#00d35a";
  const orange = "#ff9f0a";
  const grid = "rgba(84,84,88,0.35)";

  function dprCanvas(c) {
    const r = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    c.width = Math.max(1, Math.floor(w * r));
    c.height = Math.max(1, Math.floor(h * r));
    const ctx = c.getContext("2d");
    ctx.setTransform(r, 0, 0, r, 0, 0);
    return { ctx, w, h };
  }

  function drawLine(canvas, points, marks, start) {
    const { ctx, w, h } = dprCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    if (!points || points.length === 0) {
      ctx.setLineDash([5, 6]);
      ctx.strokeStyle = grid;
      ctx.beginPath();
      ctx.moveTo(8, h * 0.6);
      ctx.lineTo(w - 8, h * 0.6);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    const vals = points.map(p => p.v);
    let min = Math.min(...vals), max = Math.max(...vals);
    if (start != null) { min = Math.min(min, start); max = Math.max(max, start); }
    if (max === min) { max = min + 1; }
    const pad = 16;
    const x = i => pad + (i / Math.max(points.length - 1, 1)) * (w - pad * 2);
    const y = v => h - pad - ((v - min) / (max - min)) * (h - pad * 2);
    if (start != null) {
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = grid;
      ctx.beginPath();
      ctx.moveTo(pad, y(start));
      ctx.lineTo(w - pad, y(start));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(x(i), y(p.v)) : ctx.moveTo(x(i), y(p.v)));
    ctx.strokeStyle = green;
    ctx.lineWidth = 2;
    ctx.stroke();
    const last = points[points.length - 1];
    ctx.lineTo(x(points.length - 1), h - pad);
    ctx.lineTo(x(0), h - pad);
    ctx.closePath();
    const grd = ctx.createLinearGradient(0, pad, 0, h);
    grd.addColorStop(0, "rgba(0,211,90,0.28)");
    grd.addColorStop(1, "rgba(0,211,90,0)");
    ctx.fillStyle = grd;
    ctx.fill();
    if (marks && marks.length) {
      const rows = {};
      marks.forEach((m, i) => {
        const idx = Math.min(points.length - 1, Math.max(0, points.findIndex(p => p.t >= m.t)));
        const px = x(idx < 0 ? points.length - 1 : idx);
        let row = 0;
        while (rows[row] && Math.abs(rows[row] - px) < 50) row++;
        rows[row] = px;
        ctx.fillStyle = m.color === "red" ? "#ff453a" : m.color === "blue" ? "#0a84ff" : green;
        ctx.font = "11px -apple-system, sans-serif";
        ctx.fillText(m.label, Math.min(px, w - 80), 14 + row * 14);
      });
    }
  }

  function drawCandles(canvas, candles, exitLine) {
    const { ctx, w, h } = dprCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    if (!candles || !candles.length) return;
    const highs = candles.map(c => c.h), lows = candles.map(c => c.l);
    let min = Math.min(...lows), max = Math.max(...highs);
    if (exitLine != null) { min = Math.min(min, exitLine); max = Math.max(max, exitLine); }
    if (max === min) max = min + 1;
    const volH = 32;
    const pad = 12;
    const chartH = h - volH - pad;
    const y = v => pad + (1 - (v - min) / (max - min)) * (chartH - pad);
    const bw = Math.max(2, (w - 8) / candles.length - 2);
    if (exitLine != null) {
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = orange;
      ctx.beginPath();
      ctx.moveTo(0, y(exitLine));
      ctx.lineTo(w, y(exitLine));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const maxV = Math.max(...candles.map(c => c.v || 0), 1);
    candles.forEach((c, i) => {
      const x = 4 + i * ((w - 8) / candles.length);
      const up = c.c >= c.o;
      ctx.strokeStyle = ctx.fillStyle = up ? "#00d35a" : "#ff453a";
      ctx.beginPath();
      ctx.moveTo(x + bw / 2, y(c.h));
      ctx.lineTo(x + bw / 2, y(c.l));
      ctx.stroke();
      const top = y(Math.max(c.o, c.c)), bot = y(Math.min(c.o, c.c));
      ctx.fillRect(x, top, bw, Math.max(1, bot - top));
      const vh = ((c.v || 0) / maxV) * (volH - 4);
      ctx.globalAlpha = 0.5;
      ctx.fillRect(x, h - vh, bw, vh);
      ctx.globalAlpha = 1;
    });
  }

  function drawRing(canvas, score, minScore) {
    const { ctx, w, h } = dprCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, rad = Math.min(cx, cy) - 6;
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(84,84,88,0.55)";
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.stroke();
    const s = score == null ? 0 : score;
    ctx.strokeStyle = s >= (minScore || 70) ? "#00d35a" : "#ffd60a";
    ctx.beginPath();
    ctx.arc(cx, cy, rad, -Math.PI / 2, -Math.PI / 2 + (s / 100) * Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "600 18px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(score == null ? "—" : String(score), cx, cy);
  }

  g.DeskCharts = { drawLine, drawCandles, drawRing };
})(window);

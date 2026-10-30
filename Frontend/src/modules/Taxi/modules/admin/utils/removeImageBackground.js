/**
 * Makes the flat background of an uploaded image transparent (flood fill from the 4 corners) so a map marker
 * has no box around it. Images that already have transparency are returned unchanged. Falls back to the original
 * image on any failure.
 */
export const removeImageBackground = (dataUrl, tolerance = 42) =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const maxSide = 512;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        const d = imageData.data;

        if (d[3] < 250) return resolve(dataUrl); // corner already transparent

        const bg = [d[0], d[1], d[2]];
        const isBg = (i) =>
          Math.abs(d[i] - bg[0]) <= tolerance && Math.abs(d[i + 1] - bg[1]) <= tolerance && Math.abs(d[i + 2] - bg[2]) <= tolerance;
        const seen = new Uint8Array(w * h);
        const stack = [];
        for (let x = 0; x < w; x += 1) stack.push(x, (h - 1) * w + x);
        for (let y = 0; y < h; y += 1) stack.push(y * w, y * w + (w - 1));

        while (stack.length) {
          const p = stack.pop();
          if (seen[p]) continue;
          seen[p] = 1;
          const i = p * 4;
          if (!isBg(i)) continue;
          d[i + 3] = 0;
          const x = p % w;
          if (x > 0) stack.push(p - 1);
          if (x < w - 1) stack.push(p + 1);
          if (p >= w) stack.push(p - w);
          if (p < w * (h - 1)) stack.push(p + w);
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });

const cleanedCache = new Map();

/** Cached version for map markers: resolves to the background-free image, or the original url if it can't be read. */
export const getTransparentMarkerSrc = (src) => {
  if (!src) return Promise.resolve(src);
  if (!cleanedCache.has(src)) cleanedCache.set(src, removeImageBackground(src));
  return cleanedCache.get(src);
};

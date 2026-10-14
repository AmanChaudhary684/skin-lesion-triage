export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image-load-failed'))
    img.src = src
  })
}

// Draw an image onto a canvas, scaled down so its longest side is at most maxSide.
export function drawScaled(img, maxSide) {
  const w0 = img.naturalWidth
  const h0 = img.naturalHeight
  const scale = Math.min(1, maxSide / Math.max(w0, h0))
  const w = Math.max(1, Math.round(w0 * scale))
  const h = Math.max(1, Math.round(h0 * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.fillStyle = '#ffffff' // flatten transparent PNGs onto white
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  return { canvas, ctx, w, h }
}

// Small JPEG data URL for the history list. Returns null if the image can't be read.
export async function makeThumb(src, maxSide = 240, quality = 0.72) {
  try {
    const img = await loadImage(src)
    const { canvas } = drawScaled(img, maxSide)
    return canvas.toDataURL('image/jpeg', quality)
  } catch {
    return null
  }
}

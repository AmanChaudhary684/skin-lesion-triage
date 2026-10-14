import { drawScaled, loadImage } from './images.js'

// Advisory checks only. They never block an upload: the model still runs, and the notes
// just help the person retake a poor photo.
export const THRESHOLDS = {
  minSide: 300, // shortest side in pixels
  maxAspect: 2, // wider/taller than 2:1 is probably not a close-up crop
  dark: 45, // mean brightness (0-255)
  bright: 235,
  blurVariance: 6, // variance of the Laplacian on a 256px copy; lower = smoother/blurrier
}

export function meanBrightness(gray) {
  let sum = 0
  for (let i = 0; i < gray.length; i++) sum += gray[i]
  return gray.length ? sum / gray.length : 0
}

// Variance of the 4-neighbour Laplacian: a standard cheap sharpness measure.
export function laplacianVariance(gray, w, h) {
  if (w < 3 || h < 3) return Infinity
  let sum = 0
  let sumSq = 0
  let n = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const v = gray[i - w] + gray[i + w] + gray[i - 1] + gray[i + 1] - 4 * gray[i]
      sum += v
      sumSq += v * v
      n++
    }
  }
  const mean = sum / n
  return sumSq / n - mean * mean
}

// Pure function (easy to test): pixel summary in, plain-language notes out.
export function assessQuality({ width, height, gray, gw, gh }) {
  const notes = []
  const t = THRESHOLDS
  const brightness = meanBrightness(gray)
  const blurScore = laplacianVariance(gray, gw, gh)
  const aspect = width / height

  if (Math.min(width, height) < t.minSide) {
    notes.push({
      id: 'resolution',
      level: 'warn',
      text: `This photo is small (${width} × ${height} px). A sharper, closer photo works better.`,
    })
  }
  if (aspect > t.maxAspect || aspect < 1 / t.maxAspect) {
    notes.push({
      id: 'shape',
      level: 'warn',
      text: 'This photo is very wide or tall. Crop it close to the lesion.',
    })
  }
  if (brightness < t.dark) {
    notes.push({
      id: 'dark',
      level: 'warn',
      text: 'This photo is dark. Retake it with even, bright light.',
    })
  } else if (brightness > t.bright) {
    notes.push({
      id: 'bright',
      level: 'warn',
      text: 'This photo looks washed out. Avoid flash glare.',
    })
  }
  if (blurScore < t.blurVariance) {
    notes.push({
      id: 'blur',
      level: 'warn',
      text: 'This photo may be out of focus. Hold steady and retake it if you can.',
    })
  }
  if (notes.length === 0) {
    notes.push({
      id: 'ok',
      level: 'ok',
      text: 'No problems spotted with size, light or focus.',
    })
  }
  return { notes, brightness, blurScore }
}

// Browser side: decode the image, take a 256px grayscale copy and assess it.
export async function analyzeImageUrl(url) {
  const img = await loadImage(url)
  const width = img.naturalWidth
  const height = img.naturalHeight
  const { ctx, w, h } = drawScaled(img, 256)
  const { data } = ctx.getImageData(0, 0, w, h)
  const gray = new Float32Array(w * h)
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]
  }
  return { width, height, aspect: width / height, ...assessQuality({ width, height, gray, gw: w, gh: h }) }
}

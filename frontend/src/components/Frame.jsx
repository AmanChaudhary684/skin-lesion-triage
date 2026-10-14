// A photo in a viewfinder frame. The crop marks are drawn in CSS (.frame::before).
// `aspect` is the ORIGINAL photo's width / height. The backend squares the heatmap to 224 x 224,
// so rendering it at the photo's aspect ratio puts it back in proportion next to the photo.
export default function Frame({ src, alt, aspect, caption, maxWidth = 380 }) {
  const ratio = aspect && Number.isFinite(aspect) ? aspect : 1
  const width = (ratio < 1 ? Math.round(maxWidth * ratio) : maxWidth) + 16 // + frame padding
  return (
    <figure className="frame-figure">
      <div className="frame" style={{ maxWidth: width }}>
        <img src={src} alt={alt} style={{ aspectRatio: String(ratio) }} />
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  )
}

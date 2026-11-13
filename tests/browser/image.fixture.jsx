// Matches the unoptimized image configuration used by the example's Next app.
/* eslint-disable @next/next/no-img-element -- This isolated preview models unoptimized Next images. */
export default function Image({ src, alt, fill, width, height, style, priority, unoptimized, ...props }) {
  void unoptimized;
  return <img {...props} src={typeof src === "string" ? src : src.src} alt={alt}
    width={fill ? undefined : width} height={fill ? undefined : height}
    style={{ ...(fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", color: "transparent" } : {}), ...style }}
    loading={priority ? "eager" : props.loading} />;
}

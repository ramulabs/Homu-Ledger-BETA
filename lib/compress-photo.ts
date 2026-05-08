/**
 * Compress an image File in the browser before uploading.
 *
 * Why: iPhone photos are routinely 3–8 MB and 4032×3024. For a transaction
 * receipt, that's overkill — 1600 px on the longest side is plenty to read
 * the text, and JPEG-q85 typically lands the file under ~400 KB. That's
 * 10× less data over the user's mobile connection and 10× less storage we
 * pay Supabase for. Equally important: smaller files upload faster and
 * are far less likely to stall on flaky 4G/5G.
 *
 * The compression runs entirely on the client via a `<canvas>`, so HEIC
 * photos straight from the iPhone Camera app are also normalised to JPEG
 * along the way (HEIC is supported by Safari/iOS-Chrome's canvas decoder).
 */

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;
// Skip compression entirely if the file is already small. Anything under
// ~500 KB has nothing to gain from a recompression pass and might even get
// LARGER if the original was already aggressively compressed.
const SKIP_IF_UNDER_BYTES = 500 * 1024;

export async function compressPhoto(file: File): Promise<File> {
  // Bail out for tiny files or non-images — caller still gets a usable File.
  if (!file.type.startsWith("image/")) return file;
  if (file.size < SKIP_IF_UNDER_BYTES) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Some browsers can't decode certain formats (very rare HEIC variants,
    // mostly). Fall back to the original — better than failing the upload.
    return file;
  }

  const { width, height } = bitmap;
  const longest = Math.max(width, height);
  const scale = longest > MAX_DIMENSION ? MAX_DIMENSION / longest : 1;
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) return file;

  // If our recompressed blob is somehow LARGER than the original (rare —
  // happens with already-tiny JPEGs), prefer the original.
  if (blob.size >= file.size) return file;

  // Rename to .jpg since we always re-encode to JPEG. Keep the original
  // basename so it's still recognisable in the Storage bucket listing.
  const baseName = file.name.replace(/\.[^./]+$/, "") || "photo";
  return new File([blob], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

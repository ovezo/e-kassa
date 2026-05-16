/** Browser `src` for DB `imageUrl` (`/api/product-images/…`). Matches Next `trailingSlash: true`. */
export function productImageDisplayUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl?.trim()) return null;
  const u = imageUrl.trim();
  if (u.startsWith("/api/product-images/") && !u.endsWith("/")) {
    return `${u}/`;
  }
  return u;
}

/**
 * Fallback déterministe via picsum.photos quand `main_photo_url` est null.
 * Le seed est stable par propriété → la même carte garde la même photo.
 * picsum.photos est déjà whitelisté dans next.config.ts.
 */
export function getCardPhotoUrl(
  property: { id: number; main_photo_url: string | null },
  width = 800,
  height = 600,
): string {
  if (property.main_photo_url) return property.main_photo_url;
  return `https://picsum.photos/seed/takussan-${property.id}/${width}/${height}`;
}

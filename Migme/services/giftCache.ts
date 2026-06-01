// Simple module-level cache for gift image URLs.
// Populated by GiftPickerModal when it fetches from /api/gifts,
// so PrivateChatTab can look up imageUrls for received/historical gift messages.

interface CachedGift {
  name: string;
  emoji: string;
  imageUrl?: string;
}

let cache: CachedGift[] = [];

export function updateGiftCache(gifts: CachedGift[]): void {
  cache = gifts;
}

export function lookupGiftByName(name: string): CachedGift | undefined {
  const lower = name.toLowerCase();
  return cache.find(g => g.name.toLowerCase() === lower);
}

export function lookupGiftByEmoji(emoji: string): CachedGift | undefined {
  return cache.find(g => g.emoji === emoji);
}

import React, { useEffect, useRef, useState } from "react";
import { View, Image, Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from "react-native-reanimated";
import LottieView from "lottie-react-native";
import { API_BASE } from "../services/auth";

// ── Lottie JSON cache ─────────────────────────────────────────────────────────
const _lottieCache: Record<string, object> = {};

function isLottieUrl(url: string): boolean {
  return url.endsWith(".json") || url.includes("/lottie");
}

function useLottieSource(url: string | null | undefined): object | null {
  const [data, setData] = useState<object | null>(() =>
    url && isLottieUrl(url) ? (_lottieCache[url] ?? null) : null
  );

  useEffect(() => {
    if (!url || !isLottieUrl(url)) { setData(null); return; }
    if (_lottieCache[url]) { setData(_lottieCache[url]); return; }
    let cancelled = false;
    fetch(url)
      .then(r => r.json())
      .then(json => {
        if (cancelled) return;
        _lottieCache[url] = json;
        setData(json);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [url]);

  return data;
}

// ── Avatar info cache (per-username, 5-min TTL) ───────────────────────────────
interface AvatarInfo {
  displayPicture: string | null;
  frameUrl: string | null;
  fetchedAt: number;
}

const _avatarInfoCache: Record<string, AvatarInfo> = {};
const AVATAR_CACHE_TTL = 5 * 60 * 1000;

// Pub/sub: notify all mounted AvatarWithFrame instances for a username
const _invalidationListeners = new Map<string, Set<() => void>>();

/**
 * Call after any frame purchase / equip / unequip so the next render
 * fetches fresh data instead of showing a stale (possibly wrong) frame.
 * Also notifies all currently-mounted AvatarWithFrame components for that
 * username so they immediately re-fetch without waiting for unmount/remount.
 */
export function invalidateAvatarCache(username: string): void {
  delete _avatarInfoCache[username];
  _invalidationListeners.get(username)?.forEach(cb => cb());
}

/**
 * Auto-fetches displayPicture + frameUrl for a username from
 * GET /api/user/:username/avatar.
 * Uses a module-level cache (5-min TTL) shared across all component instances.
 * Explicit props serve as immediate initial values while the cache/fetch runs.
 * Once fetched, cached data replaces any stale explicit values — this ensures
 * the frame shown is always the user's CURRENT frame, not a snapshot from when
 * the parent last loaded.
 */
function useAvatarInfo(
  username: string | null | undefined,
  explicitDisplayPicture: string | null | undefined,
  explicitFrameUrl: string | null | undefined,
): { displayPicture: string | null; frameUrl: string | null } {
  const getCached = (u: string): AvatarInfo | null => {
    const c = _avatarInfoCache[u];
    return c && Date.now() - c.fetchedAt < AVATAR_CACHE_TTL ? c : null;
  };

  const [info, setInfo] = useState<{ dp: string | null; fu: string | null }>(() => {
    if (username) {
      const cached = getCached(username);
      if (cached) return {
        dp: cached.displayPicture ?? explicitDisplayPicture ?? null,
        fu: cached.frameUrl,
      };
    }
    return { dp: explicitDisplayPicture ?? null, fu: explicitFrameUrl ?? null };
  });

  // Bump this counter to force a re-fetch (triggered by invalidateAvatarCache)
  const [refreshKey, setRefreshKey] = useState(0);

  // Subscribe to cache invalidation events for this username
  useEffect(() => {
    if (!username) return;
    const cb = () => setRefreshKey(k => k + 1);
    if (!_invalidationListeners.has(username)) {
      _invalidationListeners.set(username, new Set());
    }
    _invalidationListeners.get(username)!.add(cb);
    return () => {
      _invalidationListeners.get(username)?.delete(cb);
    };
  }, [username]);

  useEffect(() => {
    if (!username) {
      setInfo({ dp: explicitDisplayPicture ?? null, fu: explicitFrameUrl ?? null });
      return;
    }

    const cached = getCached(username);
    if (cached) {
      setInfo({
        dp: cached.displayPicture ?? explicitDisplayPicture ?? null,
        fu: cached.frameUrl,
      });
      return;
    }

    let cancelled = false;
    fetch(`${API_BASE}/api/user/${encodeURIComponent(username)}/avatar`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const entry: AvatarInfo = {
          // If the server returns null for displayPicture (e.g. no profile row yet),
          // fall back to the explicitly passed prop so existing avatar is not wiped.
          displayPicture: data.displayPicture ?? explicitDisplayPicture ?? null,
          frameUrl: data.frameUrl ?? null,
          fetchedAt: Date.now(),
        };
        _avatarInfoCache[username] = entry;
        setInfo({ dp: entry.displayPicture, fu: entry.frameUrl });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [username, refreshKey]);

  if (!username) {
    return { displayPicture: explicitDisplayPicture ?? null, frameUrl: explicitFrameUrl ?? null };
  }
  return { displayPicture: info.dp, frameUrl: info.fu };
}

// ── Frame sizing constants (tune these to match Lottie hole size) ─────────────
// How much larger the frame container is relative to the avatar size
const FRAME_SIZE_MULTIPLIER   = 1.45;
// How much larger the Lottie overlay is relative to the frame container
const LOTTIE_OVERLAY_SCALE    = 1.15;
// Scale factor applied to the avatar circle when a frame is present.
// Increase this if the avatar looks too small inside the Lottie hole.
const FRAME_AVATAR_SCALE      = 1.22;

// ── Component ─────────────────────────────────────────────────────────────────
interface AvatarWithFrameProps {
  username?: string | null;
  size?: number;
  displayPicture?: string | null;
  avatarFrameUrl?: string | null;
  initial?: string;
  backgroundColor?: string;
  style?: object;
  animateRing?: boolean;
  ringColor?: string;
}

export default function AvatarWithFrame({
  username,
  size = 40,
  displayPicture: explicitDisplayPicture,
  avatarFrameUrl: explicitFrameUrl,
  initial = "?",
  backgroundColor = "#7c3aed",
  style,
  animateRing = false,
  ringColor = "#f97316",
}: AvatarWithFrameProps) {
  const { displayPicture: rawDisplayPicture, frameUrl: avatarFrameUrl } = useAvatarInfo(
    username,
    explicitDisplayPicture,
    explicitFrameUrl,
  );

  // Normalize display picture URL (add API_BASE prefix if relative)
  const displayPicture = rawDisplayPicture
    ? (rawDisplayPicture.startsWith("http") ? rawDisplayPicture : `${API_BASE}${rawDisplayPicture}`)
    : null;

  // Normalize frame URL (add API_BASE prefix if relative, e.g. /api/shop/frames/.../lottie)
  const normalizedFrameUrl = avatarFrameUrl
    ? (avatarFrameUrl.startsWith("http") ? avatarFrameUrl : `${API_BASE}${avatarFrameUrl}`)
    : null;

  const hasFrame = !!normalizedFrameUrl;
  const isLottie = hasFrame && isLottieUrl(normalizedFrameUrl!);
  const lottieSource = useLottieSource(isLottie ? normalizedFrameUrl : null);

  const frameSize = hasFrame ? Math.round(size * FRAME_SIZE_MULTIPLIER) : size;
  const containerSize = hasFrame ? frameSize : animateRing ? size + 12 : size;

  const rotation = useSharedValue(0);
  const glowOpacity = useSharedValue(0.6);
  const glowScale = useSharedValue(1);

  const lottieRef = useRef<LottieView>(null);

  useEffect(() => {
    if (animateRing && !hasFrame) {
      rotation.value = withRepeat(
        withTiming(360, { duration: 3200, easing: Easing.linear }),
        -1,
        false
      );
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 900 }),
          withTiming(0.4, { duration: 900 })
        ),
        -1,
        true
      );
      glowScale.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 900 }),
          withTiming(0.96, { duration: 900 })
        ),
        -1,
        true
      );
    }
  }, [animateRing, hasFrame]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
    opacity: glowOpacity.value,
  }));
  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value }],
    opacity: glowOpacity.value * 0.5,
  }));

  const innerSize = hasFrame
    ? Math.round(size * FRAME_AVATAR_SCALE)
    : animateRing
    ? size - 4
    : size;

  return (
    <View
      style={[
        {
          width: containerSize,
          height: containerSize,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      {animateRing && !hasFrame && (
        <>
          <Animated.View
            style={[
              {
                position: "absolute",
                width: containerSize,
                height: containerSize,
                borderRadius: containerSize / 2,
                borderWidth: 2.5,
                borderColor: ringColor,
                borderStyle: "solid",
              },
              glowStyle,
            ]}
          />
          <Animated.View
            style={[
              {
                position: "absolute",
                width: containerSize,
                height: containerSize,
                borderRadius: containerSize / 2,
                borderWidth: 2,
                borderColor: ringColor,
                borderStyle: "dashed",
              },
              spinStyle,
            ]}
          />
        </>
      )}

      {/* Layer 1: Avatar photo */}
      <View
        style={{
          width: innerSize,
          height: innerSize,
          borderRadius: innerSize / 2,
          backgroundColor,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {displayPicture ? (
          <Image
            source={{ uri: displayPicture }}
            style={{ width: innerSize, height: innerSize, borderRadius: innerSize / 2 }}
          />
        ) : (
          <Text
            style={{
              color: "#fff",
              fontWeight: "700",
              fontSize: Math.round(innerSize * 0.4),
            }}
          >
            {initial}
          </Text>
        )}
      </View>

      {/* Layer 2: Frame overlay */}
      {hasFrame && (
        isLottie ? (
          lottieSource ? (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                width: frameSize * LOTTIE_OVERLAY_SCALE,
                height: frameSize * LOTTIE_OVERLAY_SCALE,
              }}
            >
              <LottieView
                ref={lottieRef}
                source={lottieSource as any}
                autoPlay
                loop
                style={{ width: "100%", height: "100%" }}
              />
            </View>
          ) : null
        ) : (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              width: frameSize,
              height: frameSize,
            }}
          >
            <Image
              source={{ uri: normalizedFrameUrl! }}
              style={{
                width: frameSize,
                height: frameSize,
                resizeMode: "contain",
              }}
            />
          </View>
        )
      )}
    </View>
  );
}

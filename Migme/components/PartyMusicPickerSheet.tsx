import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { Audio } from 'expo-av';
import { API_BASE } from '../services/auth';
import { restorePartyAudioSession } from '../services/partyService';
import { getAuthToken } from '../services/storage';

// Safe dynamic require — expo-media-library needs a native build (EAS).
// Gracefully degrades in Expo Go.
let MediaLibrary: typeof import('expo-media-library') | null = null;
try {
  MediaLibrary = require('expo-media-library');
} catch {
  MediaLibrary = null;
}

// expo-document-picker — lebih reliable dari MediaLibrary untuk pilih file.
// User tinggal browse file manager, pilih MP3/AAC/OGG.
let DocumentPicker: typeof import('expo-document-picker') | null = null;
try {
  DocumentPicker = require('expo-document-picker');
} catch {
  DocumentPicker = null;
}

const { height: SH } = Dimensions.get('window');
type Tab = 'merekomendasi' | 'karaoke' | 'lokal';

// ── iTunes Search API helper ──────────────────────────────────────────────────
const parseItunesTracks = (items: any[]): Track[] =>
  (items ?? [])
    .filter((t: any) => t.previewUrl && t.trackName)
    .map((t: any) => ({
      id:         String(t.trackId),
      title:      t.trackName ?? 'Unknown',
      artist:     t.artistName ?? '',
      coverUri:   (t.artworkUrl100 ?? t.artworkUrl60 ?? '').replace('100x100', '200x200'),
      previewUrl: t.previewUrl,
    }));

const itunesSearch = async (term: string, limit = 25, country = 'ID'): Promise<Track[]> => {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=${country}&media=music&limit=${limit}&explicit=no`;
  const res  = await fetch(url);
  const data = await res.json();
  return parseItunesTracks(data.results ?? []);
};

interface Track {
  id: string;
  title: string;
  artist: string;
  coverUri: string;
  previewUrl: string;
  isLocal?: boolean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Shared playback state lifted from parent so music survives modal close */
  soundRef: React.MutableRefObject<Audio.Sound | null>;
  playingId: string | null;
  setPlayingId: (id: string | null) => void;
  isPlaying: boolean;
  setIsPlaying: (v: boolean) => void;
  currentTrack: Track | null;
  setCurrentTrack: (t: Track | null) => void;
  /** Set true ketika user ini sendiri yang memutar musik (bukan sync dari orang lain) */
  setIsLocalPlayer?: (v: boolean) => void;
  /** WebSocket ref for broadcasting music sync to all room members */
  wsRef?: React.MutableRefObject<WebSocket | null>;
  roomId?: string;
  /** Is this user the room owner / allowed to control music */
  isOwner?: boolean;
}

export default function PartyMusicPickerSheet({
  visible,
  onClose,
  soundRef,
  playingId,
  setPlayingId,
  isPlaying,
  setIsPlaying,
  currentTrack,
  setCurrentTrack,
  setIsLocalPlayer,
  wsRef,
  roomId,
  isOwner = false,
}: Props) {
  const insets    = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SH)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  const [tab,            setTab]            = useState<Tab>('merekomendasi');
  const [volume,         setVolume]         = useState(0.5);
  const [volumeCommit,   setVolumeCommit]   = useState(0.5);
  const [loadingId,      setLoadingId]      = useState<string | null>(null);

  // Recommended + Search
  const [recTracks,      setRecTracks]      = useState<Track[]>([]);
  const [recLoading,     setRecLoading]     = useState(false);
  const [searchQuery,    setSearchQuery]    = useState('');
  const [searchResults,  setSearchResults]  = useState<Track[]>([]);
  const [searchLoading,  setSearchLoading]  = useState(false);
  const [isSearchMode,   setIsSearchMode]   = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Karaoke
  const [karTracks,      setKarTracks]      = useState<Track[]>([]);
  const [karLoading,     setKarLoading]     = useState(false);

  // Local
  const [localPerm,      setLocalPerm]      = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [localTracks,    setLocalTracks]    = useState<Track[]>([]);
  const [localScanning,  setLocalScanning]  = useState(false);

  // ── Animation ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 82, friction: 14 }),
        Animated.timing(bgOpacity,  { toValue: 1, duration: 240, useNativeDriver: true }),
      ]).start();
      if (recTracks.length === 0) loadRecommended();
      checkLocalPerm();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: SH, duration: 220, useNativeDriver: true }),
        Animated.timing(bgOpacity,  { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
      // ✅ Music is NOT stopped here — it keeps playing after modal closes
    }
  }, [visible]);

  // ── Upload local audio to server → return public URL ────────────────────────
  const uploadLocalTrack = useCallback(async (track: Track): Promise<Track> => {
    if (!track.isLocal) return track;
    try {
      const token = await getAuthToken();
      if (!token) return track; // fallback: tetap pakai URI lokal (hanya si pengirim yang dengar)

      const formData = new FormData();
      formData.append('audio', {
        uri:  track.previewUrl,
        name: `${track.title || 'audio'}.mp3`,
        type: 'audio/mpeg',
      } as any);

      const res = await fetch(`${API_BASE}/api/music/upload`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
        body:    formData,
      });

      if (!res.ok) throw new Error(`Upload HTTP ${res.status}`);
      const data = await res.json();
      if (data.url) {
        return { ...track, previewUrl: data.url };
      }
    } catch (err) {
      console.warn('[Music] upload local track gagal (fallback ke URI lokal):', err);
    }
    return track;
  }, []);

  // ── WebSocket music sync helper ──────────────────────────────────────────────
  const sendMusicSync = useCallback((action: 'play' | 'pause' | 'stop', track?: Track) => {
    if (!wsRef?.current || wsRef.current.readyState !== WebSocket.OPEN || !roomId) return;
    // Hanya kirim previewUrl jika berupa remote URL — local file path (/storage/...)
    // tidak bisa diputar di device lain sehingga tidak perlu dikirim.
    const remoteUrl =
      track?.previewUrl && track.previewUrl.startsWith('http')
        ? track.previewUrl
        : undefined;
    wsRef.current.send(JSON.stringify({
      type: 'PARTY_MUSIC',
      roomId,
      action,
      trackId:     track?.id,
      trackTitle:  track?.title,
      trackArtist: track?.artist,
      previewUrl:  remoteUrl,
      coverUri:    track?.coverUri,
    }));
  }, [wsRef, roomId]);

  // ── Stop sound helper (called only when user explicitly stops, or on unmount) ──
  const stopSound = useCallback(async () => {
    if (soundRef.current) {
      try { await soundRef.current.stopAsync(); } catch {}
      try { await soundRef.current.unloadAsync(); } catch {}
      soundRef.current = null;
    }
    setPlayingId(null);
    setIsPlaying(false);
    setCurrentTrack(null);
    setIsLocalPlayer?.(false);
    sendMusicSync('stop');
  }, [sendMusicSync, setIsLocalPlayer]);

  // Stop on component unmount only
  useEffect(() => () => { stopSound(); }, []);

  // ── Volume ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (soundRef.current) {
      soundRef.current.setVolumeAsync(volumeCommit).catch(() => {});
    }
  }, [volumeCommit]);

  // ── Fetch recommended (iTunes — lagu Indonesia) ──────────────────────────────
  const loadRecommended = async () => {
    setRecLoading(true);
    try {
      // Coba beberapa query Indonesia populer secara paralel, ambil yang pertama berhasil
      const queries = [
        'pop indonesia 2024',
        'dangdut koplo hits',
        'lagu hits indonesia',
      ];
      const results = await Promise.all(queries.map(q => itunesSearch(q, 20).catch(() => [])));
      // Gabung & deduplikasi
      const seen = new Set<string>();
      const merged: Track[] = [];
      for (const list of results) {
        for (const t of list) {
          if (!seen.has(t.id)) { seen.add(t.id); merged.push(t); }
        }
      }
      setRecTracks(merged.length > 0 ? merged.slice(0, 40) : FALLBACK_TRACKS);
    } catch {
      setRecTracks(FALLBACK_TRACKS);
    } finally {
      setRecLoading(false);
    }
  };

  // ── Search handler (debounced 500ms) ─────────────────────────────────────────
  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!text.trim()) {
      setIsSearchMode(false);
      setSearchResults([]);
      return;
    }
    setIsSearchMode(true);
    setSearchLoading(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const tracks = await itunesSearch(text.trim(), 30);
        setSearchResults(tracks);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 500);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setIsSearchMode(false);
    setSearchResults([]);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
  };

  // ── Fetch karaoke tracks (iTunes — instrumental/karaoke) ─────────────────────
  const loadKaraoke = useCallback(async () => {
    if (karTracks.length > 0) return;
    setKarLoading(true);
    try {
      const queries = [
        'karaoke indonesia',
        'instrumental pop melayu',
        'backing track indonesia',
      ];
      let found: Track[] = [];
      for (const q of queries) {
        const tracks = await itunesSearch(q, 20).catch(() => []);
        if (tracks.length > 0) {
          found = tracks;
          break;
        }
      }
      setKarTracks(found.length > 0 ? found : KARAOKE_FALLBACK);
    } catch {
      setKarTracks(KARAOKE_FALLBACK);
    } finally {
      setKarLoading(false);
    }
  }, [karTracks]);

  useEffect(() => {
    if (tab === 'karaoke' && karTracks.length === 0) loadKaraoke();
    if (tab === 'lokal') checkLocalPerm();
  }, [tab]);

  // ── Local permission check ───────────────────────────────────────────────────
  const checkLocalPerm = async () => {
    if (!MediaLibrary) {
      // Kalau MediaLibrary tidak ada, cukup set granted supaya DocumentPicker bisa tetap dipakai
      setLocalPerm(DocumentPicker ? 'granted' : 'denied');
      return;
    }
    try {
      const { status } = await MediaLibrary.getPermissionsAsync();
      if (status === 'granted') {
        setLocalPerm('granted');
        scanLocalAudio();
      } else if (status === 'undetermined') {
        // Auto-request sekali saat pertama buka tab lokal
        const { status: granted } = await MediaLibrary.requestPermissionsAsync();
        if (granted === 'granted') {
          setLocalPerm('granted');
          scanLocalAudio();
        } else {
          setLocalPerm('denied');
        }
      } else {
        setLocalPerm('denied');
      }
    } catch { setLocalPerm(DocumentPicker ? 'granted' : 'denied'); }
  };

  const requestLocalPerm = async () => {
    if (!MediaLibrary) { setLocalPerm(DocumentPicker ? 'granted' : 'denied'); return; }
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status === 'granted') {
        setLocalPerm('granted');
        scanLocalAudio();
      } else {
        setLocalPerm('denied');
      }
    } catch { setLocalPerm('denied'); }
  };

  const scanLocalAudio = async () => {
    if (!MediaLibrary) { setLocalScanning(false); return; }
    setLocalScanning(true);
    try {
      const media = await MediaLibrary.getAssetsAsync({
        mediaType: MediaLibrary.MediaType.audio,
        first: 50,
        sortBy: MediaLibrary.SortBy.modificationTime,
      });
      const tracks: Track[] = media.assets.map((a: any) => ({
        id:         a.id,
        title:      a.filename.replace(/\.[^.]+$/, ''),
        artist:     'Lokal',
        coverUri:   '',
        previewUrl: a.uri,
        isLocal:    true,
      }));
      setLocalTracks(tracks);
    } catch {
      setLocalTracks([]);
    } finally {
      setLocalScanning(false);
    }
  };

  // ── Pick single audio file via Document Picker ────────────────────────────────
  const [pickerLoading, setPickerLoading] = useState(false);

  const pickFileAndAdd = async () => {
    if (!DocumentPicker) return;
    setPickerLoading(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/mpeg', 'audio/mp3', 'audio/aac', 'audio/ogg',
               'audio/wav', 'audio/flac', 'audio/x-m4a', 'audio/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;
      const name  = asset.name ?? asset.uri.split('/').pop() ?? 'File Audio';
      const title = name.replace(/\.[^.]+$/, '');
      const newTrack: Track = {
        id:         `doc_${Date.now()}`,
        title,
        artist:     'File Saya',
        coverUri:   '',
        previewUrl: asset.uri,
        isLocal:    true,
      };
      // Tambahkan ke atas list lokal — duplikat (sama URI) diabaikan
      setLocalTracks(prev => {
        const isDup = prev.some(t => t.previewUrl === asset.uri);
        return isDup ? prev : [newTrack, ...prev];
      });
      // Langsung putar setelah dipilih
      handlePlay(newTrack);
    } catch (err) {
      console.warn('[Music] pickFileAndAdd error:', err);
    } finally {
      setPickerLoading(false);
    }
  };

  // ── Play / Pause ─────────────────────────────────────────────────────────────
  const handlePlay = async (track: Track) => {
    if (loadingId === track.id) return;

    // Same track → toggle pause/resume
    if (playingId === track.id && soundRef.current) {
      if (isPlaying) {
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
        sendMusicSync('pause', track);
      } else {
        await soundRef.current.playAsync();
        setIsPlaying(true);
        sendMusicSync('play', track);
      }
      return;
    }

    // New track — stop current, load new
    if (soundRef.current) {
      try { await soundRef.current.stopAsync(); } catch {}
      try { await soundRef.current.unloadAsync(); } catch {}
      soundRef.current = null;
    }
    setPlayingId(null);
    setIsPlaying(false);
    setCurrentTrack(null);

    setLoadingId(track.id);
    try {
      // ── Upload local file ke server supaya user lain bisa dengar ─────────────
      // uploadLocalTrack() mengganti previewUrl dari URI lokal ke URL publik server.
      // Kalau upload gagal, broadcastTrack tetap pakai URI lokal (hanya si pengirim yang dengar).
      const broadcastTrack = await uploadLocalTrack(track);

      // Audio mode: in own try-catch so if it fails, playback still proceeds
      // allowsRecordingIOS MUST be true — LiveKit needs playAndRecord category
      // on iOS. Setting false downgrades to playback category which breaks
      // headset routing and silences the mic when a new seat participant joins.
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          allowsRecordingIOS: true,
          staysActiveInBackground: true,
          playThroughEarpieceAndroid: false,
        });
      } catch (modeErr) {
        console.warn('[Music] setAudioModeAsync failed (non-fatal):', modeErr);
      }

      // Pengirim putar dari URI lokal (cepat, tidak perlu download lagi)
      const { sound } = await Audio.Sound.createAsync(
        { uri: track.previewUrl },
        { shouldPlay: false, volume: volumeCommit },
        (status) => {
          if (status.isLoaded && status.didJustFinish) {
            setPlayingId(null);
            setIsPlaying(false);
            setCurrentTrack(null);
            setIsLocalPlayer?.(false);
          }
        },
      );
      // Explicit playAsync — more reliable than shouldPlay:true
      await sound.playAsync();
      // Re-apply LiveKit audio routing — setAudioModeAsync above may have
      // overridden LiveKit's session and routed voice to loudspeaker.
      restorePartyAudioSession().catch(() => {});
      soundRef.current = sound;
      setPlayingId(track.id);
      setIsPlaying(true);
      setCurrentTrack(track);
      setIsLocalPlayer?.(true);
      // ✅ Broadcast pakai broadcastTrack (URL publik server untuk local, atau previewUrl asli)
      sendMusicSync('play', broadcastTrack);
    } catch (err) {
      console.error('[Music] handlePlay error:', err);
      setPlayingId(null);
      setIsPlaying(false);
      setCurrentTrack(null);
      setIsLocalPlayer?.(false);
    } finally {
      setLoadingId(null);
    }
  };

  // ── Play a track locally without broadcasting (called for remote sync) ───────
  const playTrackLocal = useCallback(async (track: Track) => {
    if (soundRef.current) {
      try { await soundRef.current.stopAsync(); } catch {}
      try { await soundRef.current.unloadAsync(); } catch {}
      soundRef.current = null;
    }
    setPlayingId(null);
    setIsPlaying(false);
    setCurrentTrack(null);
    try {
      try { await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, allowsRecordingIOS: true, staysActiveInBackground: true, playThroughEarpieceAndroid: false }); } catch {}
      const { sound } = await Audio.Sound.createAsync(
        { uri: track.previewUrl },
        { shouldPlay: false, volume: volumeCommit },
        (status) => {
          if (status.isLoaded && status.didJustFinish) {
            restorePartyAudioSession().catch(() => {});
            setPlayingId(null);
            setIsPlaying(false);
            setCurrentTrack(null);
          }
        },
      );
      await sound.playAsync();
      restorePartyAudioSession().catch(() => {});
      soundRef.current = sound;
      setPlayingId(track.id);
      setIsPlaying(true);
      setCurrentTrack(track);
    } catch (err) { console.error('[Music] playTrackLocal error:', err); }
  }, [volumeCommit]);

  const pauseLocal = useCallback(async () => {
    if (soundRef.current) {
      try { await soundRef.current.pauseAsync(); } catch {}
      setIsPlaying(false);
    }
  }, []);

  const stopLocal = useCallback(async () => {
    if (soundRef.current) {
      try { await soundRef.current.stopAsync(); } catch {}
      try { await soundRef.current.unloadAsync(); } catch {}
      soundRef.current = null;
    }
    setPlayingId(null);
    setIsPlaying(false);
    setCurrentTrack(null);
  }, []);

  // ── Render track row ─────────────────────────────────────────────────────────
  const TrackRow = ({ item }: { item: Track }) => {
    const active  = playingId === item.id;
    const loading = loadingId === item.id;
    return (
      <View style={ms.trackRow}>
        <View style={ms.cover}>
          {item.coverUri ? (
            <Image source={{ uri: item.coverUri }} style={ms.coverImg} />
          ) : (
            <View style={[ms.coverImg, ms.coverPlaceholder]}>
              <MaterialCommunityIcons name="music-note" size={20} color="rgba(255,255,255,0.4)" />
            </View>
          )}
          {active && (
            <View style={ms.playingDot}>
              <Animated.View style={ms.playingDotInner} />
            </View>
          )}
        </View>

        <View style={ms.trackInfo}>
          <Text style={[ms.trackTitle, active && ms.trackTitleActive]} numberOfLines={1}>
            {item.title}
          </Text>
          {item.artist ? (
            <Text style={ms.trackArtist} numberOfLines={1}>{item.artist}</Text>
          ) : null}
        </View>

        <TouchableOpacity
          style={[ms.playBtn, active && ms.playBtnActive, !item.previewUrl && ms.playBtnDisabled]}
          onPress={() => item.previewUrl && handlePlay(item)}
          activeOpacity={item.previewUrl ? 0.8 : 1}
        >
          {loading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons
                name={active && isPlaying ? 'pause' : 'play'}
                size={14}
                color="#fff"
                style={{ marginLeft: active && isPlaying ? 0 : 2 }}
              />
          }
        </TouchableOpacity>
      </View>
    );
  };

  const TAB_LABELS: { key: Tab; label: string }[] = [
    { key: 'merekomendasi', label: 'Rekomendasi' },
    { key: 'karaoke',       label: 'Karaoke' },
    { key: 'lokal',         label: 'Lokal' },
  ];

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[ms.overlay, { opacity: bgOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[ms.sheet, { paddingBottom: insets.bottom + 8, transform: [{ translateY: slideAnim }] }]}>
        <View style={ms.handle} />

        {/* Now Playing bar — shows even after closing the picker */}
        {currentTrack && (
          <View style={ms.nowPlayingBar}>
            <MaterialCommunityIcons name="music-note" size={14} color="#5EEAD4" />
            <Text style={ms.nowPlayingText} numberOfLines={1}>
              {isPlaying ? 'Sedang diputar: ' : 'Dijeda: '}
              <Text style={ms.nowPlayingTitle}>{currentTrack.title}</Text>
            </Text>
            <TouchableOpacity onPress={stopSound} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialCommunityIcons name="stop-circle-outline" size={18} color="rgba(255,100,100,0.85)" />
            </TouchableOpacity>
          </View>
        )}

        {/* Tab bar */}
        <View style={ms.tabBar}>
          {TAB_LABELS.map(({ key: t, label }) => {
            const active = tab === t;
            return (
              <TouchableOpacity key={t} style={ms.tabBtn} onPress={() => setTab(t)} activeOpacity={0.75}>
                <Text style={[ms.tabText, active && ms.tabTextActive]}>{label}</Text>
                {active && <View style={ms.tabUnderline} />}
              </TouchableOpacity>
            );
          })}
          <View style={{ flex: 1 }} />
        </View>

        {/* Content */}
        <View style={{ flex: 1 }}>
          {tab === 'merekomendasi' ? (
            <View style={{ flex: 1 }}>
              {/* Search bar */}
              <View style={ms.searchBar}>
                <Ionicons name="search" size={16} color="rgba(255,255,255,0.4)" style={{ marginRight: 8 }} />
                <TextInput
                  style={ms.searchInput}
                  placeholder="Cari lagu, artis..."
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={searchQuery}
                  onChangeText={handleSearchChange}
                  returnKeyType="search"
                  autoCorrect={false}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={clearSearch} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.35)" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Search mode */}
              {isSearchMode ? (
                searchLoading ? (
                  <View style={ms.centerBox}>
                    <ActivityIndicator color="#F59E0B" size="large" />
                    <Text style={ms.centerText}>Mencari lagu...</Text>
                  </View>
                ) : searchResults.length === 0 ? (
                  <View style={ms.centerBox}>
                    <Ionicons name="musical-notes-outline" size={44} color="rgba(255,255,255,0.2)" />
                    <Text style={ms.centerText}>Lagu tidak ditemukan</Text>
                  </View>
                ) : (
                  <FlatList
                    data={searchResults}
                    keyExtractor={i => `s_${i.id}`}
                    renderItem={({ item }) => <TrackRow item={item} />}
                    showsVerticalScrollIndicator={false}
                    ItemSeparatorComponent={() => <View style={ms.separator} />}
                  />
                )
              ) : recLoading ? (
                <View style={ms.centerBox}>
                  <ActivityIndicator color="#F59E0B" size="large" />
                  <Text style={ms.centerText}>Memuat lagu Indonesia...</Text>
                </View>
              ) : recTracks.length === 0 ? (
                <View style={ms.centerBox}>
                  <Text style={ms.centerText}>Tidak ada lagu tersedia</Text>
                  <TouchableOpacity style={ms.yellowBtn} onPress={loadRecommended}>
                    <Text style={ms.yellowBtnText}>Coba lagi</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <View style={ms.recHeader}>
                    <Text style={ms.recHeaderText}>🇮🇩  Lagu Populer Indonesia</Text>
                  </View>
                  <FlatList
                    data={recTracks}
                    keyExtractor={i => i.id}
                    renderItem={({ item }) => <TrackRow item={item} />}
                    showsVerticalScrollIndicator={false}
                    ItemSeparatorComponent={() => <View style={ms.separator} />}
                  />
                </>
              )}
            </View>
          ) : tab === 'karaoke' ? (
            /* ── KARAOKE TAB ── */
            karLoading ? (
              <View style={ms.centerBox}>
                <ActivityIndicator color="#EC4899" size="large" />
                <Text style={ms.centerText}>Memuat lagu karaoke...</Text>
              </View>
            ) : karTracks.length === 0 ? (
              <View style={ms.centerBox}>
                <MaterialCommunityIcons name="microphone-variant" size={44} color="rgba(255,255,255,0.2)" />
                <Text style={ms.centerText}>Tidak ada lagu karaoke</Text>
                <TouchableOpacity style={[ms.yellowBtn, { backgroundColor: '#EC4899' }]} onPress={loadKaraoke}>
                  <Text style={ms.yellowBtnText}>Coba lagi</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ flex: 1 }}>
                <View style={ms.karaokeHeader}>
                  <MaterialCommunityIcons name="microphone-variant" size={16} color="#EC4899" />
                  <Text style={ms.karaokeHeaderText}>Putar & nyanyikan bersama!</Text>
                </View>
                <FlatList
                  data={karTracks}
                  keyExtractor={i => `kar_${i.id}`}
                  renderItem={({ item }) => (
                    <TrackRow item={{ ...item, id: `kar_${item.id}`, previewUrl: item.previewUrl }} />
                  )}
                  showsVerticalScrollIndicator={false}
                  ItemSeparatorComponent={() => <View style={ms.separator} />}
                />
              </View>
            )
          ) : (
            /* ── LOCAL TAB ── */
            <View style={{ flex: 1 }}>

              {/* Toolbar: Pilih File (DocumentPicker) + Scan ulang (MediaLibrary) */}
              <View style={ms.localPickerBar}>
                {/* Tombol "Pilih File" — selalu tampil, disable kalau kedua modul tidak ada */}
                <TouchableOpacity
                  style={[ms.pickFileBtn, (!DocumentPicker && !MediaLibrary) && ms.pickFileBtnDisabled]}
                  onPress={DocumentPicker ? pickFileAndAdd : undefined}
                  activeOpacity={DocumentPicker ? 0.8 : 1}
                  disabled={pickerLoading}
                >
                  {pickerLoading ? (
                    <ActivityIndicator size="small" color="#111" />
                  ) : (
                    <MaterialCommunityIcons name="folder-open-outline" size={18} color="#111" />
                  )}
                  <Text style={ms.pickFileBtnText}>
                    {pickerLoading ? 'Membuka...' : 'Pilih File dari HP'}
                  </Text>
                </TouchableOpacity>

                {/* Scan ulang MediaLibrary */}
                {MediaLibrary && localPerm === 'granted' && (
                  <TouchableOpacity
                    style={ms.scanBtnSmall}
                    onPress={scanLocalAudio}
                    activeOpacity={0.75}
                    disabled={localScanning}
                  >
                    {localScanning
                      ? <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" />
                      : <MaterialCommunityIcons name="database-refresh-outline" size={18} color="rgba(255,255,255,0.7)" />
                    }
                  </TouchableOpacity>
                )}
              </View>

              <Text style={ms.localHint}>MP3 · AAC · OGG · WAV · FLAC · M4A</Text>

              {/* Kasus 1: tidak ada MediaLibrary DAN tidak ada DocumentPicker */}
              {!MediaLibrary && !DocumentPicker ? (
                <View style={ms.centerBox}>
                  <MaterialCommunityIcons name="music-off" size={44} color="rgba(255,255,255,0.15)" />
                  <Text style={[ms.centerText, { textAlign: 'center' }]}>
                    Fitur file lokal membutuhkan{'\n'}EAS Build (development client)
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, textAlign: 'center' }}>
                    Gunakan tab Rekomendasi atau Karaoke
                  </Text>
                </View>

              /* Kasus 2: MediaLibrary ada tapi belum diberi izin */
              ) : MediaLibrary && localPerm === 'denied' ? (
                <View style={ms.centerBox}>
                  <MaterialCommunityIcons name="folder-lock-outline" size={44} color="rgba(255,255,255,0.15)" />
                  <Text style={[ms.centerText, { textAlign: 'center' }]}>
                    Izin akses penyimpanan{'\n'}belum diberikan
                  </Text>
                  <TouchableOpacity style={ms.yellowBtn} onPress={requestLocalPerm}>
                    <Text style={ms.yellowBtnText}>Berikan Izin</Text>
                  </TouchableOpacity>
                  {DocumentPicker && (
                    <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 4, textAlign: 'center' }}>
                      Atau gunakan tombol "Pilih File dari HP" di atas
                    </Text>
                  )}
                </View>

              /* Kasus 3: sedang scanning */
              ) : localScanning && localTracks.length === 0 ? (
                <View style={ms.centerBox}>
                  <ActivityIndicator color="#F59E0B" size="large" />
                  <Text style={ms.centerText}>Memindai file audio...</Text>
                </View>

              /* Kasus 4: scan selesai tapi kosong */
              ) : localTracks.length === 0 ? (
                <View style={ms.centerBox}>
                  <MaterialCommunityIcons name="folder-music-outline" size={44} color="rgba(255,255,255,0.15)" />
                  <Text style={ms.centerText}>Tidak ada file audio ditemukan</Text>
                  {MediaLibrary && localPerm === 'granted' && (
                    <TouchableOpacity style={ms.scanBtn} onPress={scanLocalAudio}>
                      <MaterialCommunityIcons name="database-search-outline" size={16} color="#111" />
                      <Text style={ms.scanBtnText}>Scan ulang</Text>
                    </TouchableOpacity>
                  )}
                  {DocumentPicker && (
                    <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: 4, textAlign: 'center' }}>
                      Atau ketuk "Pilih File dari HP" di atas
                    </Text>
                  )}
                </View>

              /* Kasus 5: ada file — tampilkan list */
              ) : (
                <View style={{ flex: 1 }}>
                  {/* Header info jumlah file */}
                  <View style={ms.localListHeader}>
                    <MaterialCommunityIcons name="music-note-outline" size={13} color="rgba(255,255,255,0.35)" />
                    <Text style={ms.localListHeaderText}>{localTracks.length} file ditemukan</Text>
                    <Text style={ms.localListHeaderSub}>· diputar & dibroadcast ke semua peserta</Text>
                  </View>
                  <FlatList
                    data={localTracks}
                    keyExtractor={i => i.id}
                    renderItem={({ item }) => <TrackRow item={item} />}
                    showsVerticalScrollIndicator={false}
                    ItemSeparatorComponent={() => <View style={ms.separator} />}
                  />
                </View>
              )}
            </View>
          )}
        </View>

        {/* Volume bar */}
        <View style={ms.volumeBar}>
          <TouchableOpacity onPress={stopSound} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginRight: 4 }}>
            <Ionicons
              name={isPlaying ? 'volume-medium-outline' : 'volume-mute-outline'}
              size={22}
              color={isPlaying ? '#5EEAD4' : 'rgba(255,255,255,0.4)'}
            />
          </TouchableOpacity>
          <Slider
            style={ms.slider}
            minimumValue={0}
            maximumValue={1}
            value={volume}
            onValueChange={setVolume}
            onSlidingComplete={setVolumeCommit}
            minimumTrackTintColor="#5EEAD4"
            maximumTrackTintColor="rgba(255,255,255,0.18)"
            thumbTintColor="#5EEAD4"
          />
        </View>
      </Animated.View>
    </Modal>
  );
}

/** Export Track type so parent can type the shared state */
export type { Track as MusicTrack };

// ── Fallback hardcoded tracks (royalty-free samples) ────────────────────────
const FALLBACK_TRACKS: Track[] = [
  { id: 'f1', title: 'Sample Beat 1',  artist: 'SoundHelix', coverUri: 'https://picsum.photos/seed/song1/80/80', previewUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
  { id: 'f2', title: 'Sample Beat 2',  artist: 'SoundHelix', coverUri: 'https://picsum.photos/seed/song2/80/80', previewUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
  { id: 'f3', title: 'Sample Beat 3',  artist: 'SoundHelix', coverUri: 'https://picsum.photos/seed/song3/80/80', previewUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
  { id: 'f4', title: 'Sample Beat 4',  artist: 'SoundHelix', coverUri: 'https://picsum.photos/seed/song4/80/80', previewUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3' },
  { id: 'f5', title: 'Sample Beat 5',  artist: 'SoundHelix', coverUri: 'https://picsum.photos/seed/song5/80/80', previewUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3' },
  { id: 'f6', title: 'Sample Beat 6',  artist: 'SoundHelix', coverUri: 'https://picsum.photos/seed/song6/80/80', previewUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3' },
];

// ── Karaoke fallback tracks (royalty-free) ───────────────────────────────────
const KARAOKE_FALLBACK: Track[] = [
  { id: 'k1', title: 'Karaoke Beat 1', artist: 'Instrumental', coverUri: 'https://picsum.photos/seed/kar1/80/80', previewUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3' },
  { id: 'k2', title: 'Karaoke Beat 2', artist: 'Instrumental', coverUri: 'https://picsum.photos/seed/kar2/80/80', previewUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3' },
  { id: 'k3', title: 'Karaoke Beat 3', artist: 'Instrumental', coverUri: 'https://picsum.photos/seed/kar3/80/80', previewUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3' },
  { id: 'k4', title: 'Karaoke Beat 4', artist: 'Instrumental', coverUri: 'https://picsum.photos/seed/kar4/80/80', previewUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3' },
];

// ── Styles ───────────────────────────────────────────────────────────────────
const ms = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(13,13,21,0.94)',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    height: SH * 0.75,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.7,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: -8 },
    elevation: 28,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },

  // Now playing bar
  nowPlayingBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: 'rgba(94,234,212,0.08)',
    borderBottomWidth: 0.5, borderBottomColor: 'rgba(94,234,212,0.2)',
    gap: 8,
  },
  nowPlayingText: {
    flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.6)',
  },
  nowPlayingTitle: {
    color: '#5EEAD4', fontWeight: '700',
  },

  // Karaoke header
  karaokeHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 0.5, borderBottomColor: 'rgba(236,72,153,0.2)',
    backgroundColor: 'rgba(236,72,153,0.06)',
  },
  karaokeHeaderText: {
    fontSize: 12, color: '#EC4899', fontWeight: '600',
  },

  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 0,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  tabBtn: {
    marginRight: 18, paddingVertical: 13,
    alignItems: 'center', position: 'relative',
  },
  tabText: {
    fontSize: 13, fontWeight: '500',
    color: 'rgba(255,255,255,0.45)', letterSpacing: 0.2,
  },
  tabTextActive: { color: '#fff', fontWeight: '700' },
  tabUnderline: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 2, borderRadius: 1, backgroundColor: '#F59E0B',
  },

  // Track rows
  trackRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  cover: { marginRight: 14, position: 'relative' },
  coverImg: { width: 46, height: 46, borderRadius: 8 },
  coverPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  playingDot: {
    position: 'absolute', bottom: -3, right: -3,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#5EEAD4',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(13,13,21,0.94)',
  },
  playingDotInner: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: '#0D0D15',
  },
  trackInfo: { flex: 1, marginRight: 10 },
  trackTitle: { fontSize: 14, fontWeight: '500', color: 'rgba(255,255,255,0.9)', letterSpacing: 0.1 },
  trackTitleActive: { color: '#5EEAD4' },
  trackArtist: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  playBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  playBtnActive:    { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
  playBtnDisabled:  { opacity: 0.25 },
  separator: { height: 0.5, backgroundColor: 'rgba(255,255,255,0.06)', marginLeft: 76 },

  // Volume
  volumeBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    borderTopWidth: 0.5, borderTopColor: 'rgba(255,255,255,0.07)',
  },
  slider: { flex: 1, height: 36, marginLeft: 8 },

  // States
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, paddingHorizontal: 32 },
  localEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, paddingHorizontal: 32, position: 'relative' },
  centerText: { fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 20 },

  // Yellow button
  yellowBtn: {
    backgroundColor: '#EAB308',
    borderRadius: 100, paddingHorizontal: 36, paddingVertical: 13,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 8,
  },
  yellowBtnText: { fontSize: 14, fontWeight: '700', color: '#111', letterSpacing: 0.2 },

  // Scan button
  scanBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#EAB308',
    borderRadius: 100, paddingHorizontal: 20, paddingVertical: 11,
  },
  scanBtnFloat: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#EAB308',
    borderRadius: 100, paddingHorizontal: 18, paddingVertical: 10,
    position: 'absolute', bottom: 10, right: 16,
    elevation: 6,
    shadowColor: '#EAB308', shadowOpacity: 0.4, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  scanBtnText: { fontSize: 13, fontWeight: '700', color: '#111', letterSpacing: 0.2 },

  // Local tab — document picker bar
  localPickerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  pickFileBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F59E0B',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    elevation: 4,
    shadowColor: '#F59E0B',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  pickFileBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111',
    letterSpacing: 0.2,
  },
  pickFileBtnDisabled: {
    backgroundColor: 'rgba(245,158,11,0.3)',
    elevation: 0,
    shadowOpacity: 0,
  },
  scanBtnSmall: {
    width: 42, height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  localHint: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    letterSpacing: 0.5,
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  localListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  localListHeaderText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
  },
  localListHeaderSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.25)',
    flex: 1,
  },

  // Search bar
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 14, marginVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.12)',
  },
  searchInput: {
    flex: 1, fontSize: 14, color: '#fff',
    paddingVertical: 0,
  },

  // Recommended header
  recHeader: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  recHeaderText: {
    fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '600', letterSpacing: 0.3,
  },
});

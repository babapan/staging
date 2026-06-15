import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Dimensions, FlatList, Image, StyleSheet,
  Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getLiveHosts, challengePK, acceptPK, declinePK, cancelPK,
  type LiveHost, type PKBattle,
} from '../services/pkService';

// ─── Types ─────────────────────────────────────────────────────────────────────
type PKPhase = 'idle' | 'pending' | 'incoming' | 'active' | 'result';

interface Props {
  visible:       boolean;
  streamId:      string | null;
  myUsername:    string;
  myDisplayName: string | null;
  myAvatar:      string | null;
  wsEvent:       any | null;
  onClose:       () => void;
}

// ─── Avatar helper ─────────────────────────────────────────────────────────────
function AvatarCircle({ uri, size = 48, border }: { uri?: string | null; size?: number; border?: string }) {
  return (
    <View style={[avs.ring, border ? { borderColor: border, borderWidth: 2 } : null, { width: size + 6, height: size + 6, borderRadius: (size + 6) / 2 }]}>
      {uri
        ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
        : <View style={[avs.placeholder, { width: size, height: size, borderRadius: size / 2 }]}>
            <MaterialCommunityIcons name="account" size={size * 0.6} color="#888" />
          </View>}
    </View>
  );
}
const avs = StyleSheet.create({
  ring: { borderRadius: 99, borderWidth: 2, borderColor: 'transparent', padding: 2, alignItems: 'center', justifyContent: 'center' },
  placeholder: { backgroundColor: '#2a2a3a', alignItems: 'center', justifyContent: 'center' },
});

// ─── Countdown hook ────────────────────────────────────────────────────────────
function useCountdown(targetIso: string | null) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!targetIso) { setSecs(0); return; }
    const tick = () => setSecs(Math.max(0, Math.floor((new Date(targetIso).getTime() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso]);
  return secs;
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function PKBattleModal({
  visible, streamId, myUsername, myDisplayName, myAvatar, wsEvent, onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<PKPhase>('idle');
  const [battle, setBattle] = useState<PKBattle | null>(null);
  const [pendingBattleId, setPendingBattleId] = useState<number | null>(null);
  const [incomingBattle, setIncomingBattle] = useState<{ battleId: number; challengerStreamId: string; challengerUsername: string; challengerDisplayName: string | null; challengerAvatar: string | null } | null>(null);

  // ── Live hosts list
  const [hosts, setHosts] = useState<LiveHost[]>([]);
  const [hostsLoading, setHostsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const filteredHosts = hosts.filter(h =>
    !search.trim() || h.username.toLowerCase().includes(search.toLowerCase()) || (h.displayName ?? '').toLowerCase().includes(search.toLowerCase())
  );

  // ── Animations
  const sheetY   = useRef(new Animated.Value(700)).current;
  const overlayO = useRef(new Animated.Value(0)).current;
  const cardS    = useRef(new Animated.Value(0.8)).current;
  const resultS  = useRef(new Animated.Value(0.5)).current;

  const slideIn  = useCallback(() => Animated.spring(sheetY, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start(), [sheetY]);
  const slideOut = useCallback((cb?: () => void) => Animated.timing(sheetY, { toValue: 700, duration: 260, useNativeDriver: true }).start(cb), [sheetY]);
  const popIn    = useCallback(() => {
    Animated.parallel([
      Animated.spring(cardS, { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }),
      Animated.timing(overlayO, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [cardS, overlayO]);
  const fadeIn   = useCallback(() => Animated.timing(overlayO, { toValue: 1, duration: 300, useNativeDriver: true }).start(), [overlayO]);

  // ── Incoming 30s auto-decline
  const [incomingDeadline, setIncomingDeadline] = useState<string | null>(null);
  const incomingSecs = useCountdown(incomingDeadline);
  useEffect(() => {
    if (incomingSecs === 0 && phase === 'incoming' && incomingBattle) {
      handleDecline();
    }
  }, [incomingSecs]);

  // ── Pending 60s auto-cancel
  const [pendingDeadline, setPendingDeadline] = useState<string | null>(null);
  const pendingSecs = useCountdown(pendingDeadline);
  useEffect(() => {
    if (pendingSecs === 0 && phase === 'pending' && pendingBattleId) {
      handleCancel();
    }
  }, [pendingSecs]);

  // ── Battle timer (active phase)
  const battlesecs = useCountdown(battle?.endAt ?? null);

  // ── Score animation
  const [myScore,  setMyScore]  = useState(0);
  const [oppScore, setOppScore] = useState(0);
  const progressAnim = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const total = myScore + oppScore;
    const ratio = total > 0 ? myScore / total : 0.5;
    Animated.spring(progressAnim, { toValue: ratio, useNativeDriver: false, tension: 60, friction: 12 }).start();
  }, [myScore, oppScore]);

  // ── Result winner
  const [winner, setWinner] = useState<'challenger' | 'opponent' | 'tie' | null>(null);
  const [myRole, setMyRole] = useState<'challenger' | 'opponent'>('challenger');

  // ── Handle wsEvent from parent ────────────────────────────────────────────
  useEffect(() => {
    if (!wsEvent) return;
    const p = wsEvent;

    if (p.type === 'PK_CHALLENGE_RECEIVED') {
      setIncomingBattle({
        battleId: p.battleId, challengerStreamId: p.challengerStreamId,
        challengerUsername: p.challengerUsername, challengerDisplayName: p.challengerDisplayName ?? null,
        challengerAvatar: p.challengerAvatar ?? null,
      });
      setIncomingDeadline(new Date(Date.now() + 30_000).toISOString());
      cardS.setValue(0.8); overlayO.setValue(0);
      setPhase('incoming');
      popIn();
    }

    if (p.type === 'PK_DECLINED' || p.type === 'PK_CANCELLED') {
      if (phase === 'pending') {
        setPendingDeadline(null);
        cardS.setValue(0.8); overlayO.setValue(0);
        popIn();
        setPhase('idle');
      }
    }

    if (p.type === 'PK_STARTED') {
      const role = p.challengerStreamId === streamId ? 'challenger' : 'opponent';
      setMyRole(role);
      setBattle({
        id: p.battleId, challengerStreamId: p.challengerStreamId, opponentStreamId: p.opponentStreamId,
        challengerUsername: p.challengerUsername, opponentUsername: p.opponentUsername,
        challengerDisplayName: p.challengerDisplayName ?? null, opponentDisplayName: p.opponentDisplayName ?? null,
        challengerAvatar: p.challengerAvatar ?? null, opponentAvatar: p.opponentAvatar ?? null,
        challengerScore: 0, opponentScore: 0, durationSeconds: p.durationSeconds ?? 300,
        endAt: p.endAt, winner: null, status: 'active',
      });
      setMyScore(0); setOppScore(0);
      progressAnim.setValue(0.5);
      setPendingDeadline(null);
      setIncomingDeadline(null);
      overlayO.setValue(0);
      fadeIn();
      setPhase('active');
    }

    if (p.type === 'PK_SCORE_UPDATE') {
      setBattle(b => b ? { ...b, challengerScore: p.challengerScore, opponentScore: p.opponentScore } : b);
      setMyScore(myRole === 'challenger' ? p.challengerScore : p.opponentScore);
      setOppScore(myRole === 'challenger' ? p.opponentScore : p.challengerScore);
    }

    if (p.type === 'PK_ENDED') {
      const iAm = myRole;
      const iWon = (iAm === 'challenger' && p.winner === 'challenger') || (iAm === 'opponent' && p.winner === 'opponent');
      const tied = p.winner === 'tie';
      setWinner(tied ? 'tie' : iWon ? 'challenger' : 'opponent');
      setBattle(b => b ? { ...b, challengerScore: p.challengerScore, opponentScore: p.opponentScore, winner: p.winner } : b);
      resultS.setValue(0.5); overlayO.setValue(0);
      Animated.parallel([
        Animated.spring(resultS, { toValue: 1, useNativeDriver: true, tension: 70, friction: 9 }),
        Animated.timing(overlayO, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
      setPhase('result');
      // Auto-close after 6s
      setTimeout(() => { setPhase('idle'); setBattle(null); setWinner(null); onClose(); }, 6000);
    }
  }, [wsEvent]);

  // ── Open/close lifecycle ──────────────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      if (phase === 'idle') {
        sheetY.setValue(700);
        slideIn();
        loadHosts();
      }
    } else {
      if (phase === 'idle') sheetY.setValue(700);
    }
  }, [visible]);

  async function loadHosts() {
    setHostsLoading(true);
    const h = await getLiveHosts();
    setHosts(h);
    setHostsLoading(false);
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  async function handleChallenge(host: LiveHost) {
    if (!streamId) return;
    const res = await challengePK(streamId, host.id);
    if (res.ok && res.battleId) {
      setPendingBattleId(res.battleId);
      setPendingDeadline(new Date(Date.now() + 60_000).toISOString());
      setIncomingBattle(prev => prev ?? { battleId: res.battleId!, challengerStreamId: streamId, challengerUsername: host.username, challengerDisplayName: host.displayName, challengerAvatar: host.avatarUrl });
      slideOut(() => {
        cardS.setValue(0.8); overlayO.setValue(0);
        setPhase('pending');
        popIn();
      });
    }
  }

  async function handleAccept() {
    if (!streamId || !incomingBattle) return;
    setIncomingDeadline(null);
    await acceptPK(streamId, incomingBattle.battleId);
  }

  async function handleDecline() {
    if (!streamId || !incomingBattle) return;
    setIncomingDeadline(null);
    await declinePK(streamId, incomingBattle.battleId);
    setIncomingBattle(null);
    setPhase('idle');
    onClose();
  }

  async function handleCancel() {
    if (!streamId || !pendingBattleId) return;
    setPendingDeadline(null);
    await cancelPK(streamId, pendingBattleId);
    setPendingBattleId(null);
    setPhase('idle');
    sheetY.setValue(700);
    slideIn();
    loadHosts();
  }

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  if (!visible && phase !== 'active' && phase !== 'result') return null;

  // ── ACTIVE PHASE overlay — scoreboard image + overlaid data ────────────────
  if (phase === 'active' && battle) {
    const SW        = Dimensions.get('window').width;
    const imgH      = SW * (1024 / 1536);           // proportional height

    // Positions as fractions of SW (x) and imgH (y)
    // Based on 1536×1024 image analysis
    const AV        = Math.round(SW * 0.112);        // avatar circle diameter
    const AV_Y      = imgH * 0.390 - AV / 2;        // top edge of avatar
    const L_AV_X    = SW * 0.022 - AV / 2;          // left avatar: left edge
    const R_AV_X    = SW * 0.978 - AV / 2;          // right avatar: left edge
    const L_NM_X    = SW * 0.118;                    // left name box: left edge
    const R_NM_X    = SW * 0.570;                    // right name box: left edge
    const NM_W      = SW * 0.230;                    // name box width
    const NM_Y      = imgH * 0.285;                  // name text top
    const L_SC_X    = SW * 0.275;                    // left score center-x
    const R_SC_X    = SW * 0.595;                    // right score center-x
    const SC_Y      = imgH * 0.460;                  // score top

    const myAvPtr   = myRole === 'challenger' ? battle.challengerAvatar   : battle.opponentAvatar;
    const oppAvPtr  = myRole === 'challenger' ? battle.opponentAvatar     : battle.challengerAvatar;
    const myName    = myRole === 'challenger'
      ? (battle.challengerDisplayName ?? battle.challengerUsername)
      : (battle.opponentDisplayName   ?? battle.opponentUsername);
    const oppName   = myRole === 'challenger'
      ? (battle.opponentDisplayName   ?? battle.opponentUsername)
      : (battle.challengerDisplayName ?? battle.challengerUsername);

    const leftFlex  = progressAnim;
    const rightFlex = progressAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

    return (
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: overlayO, zIndex: 110 }]} pointerEvents="box-none">

        {/* ── SCOREBOARD IMAGE + overlaid elements ───────────────────── */}
        <View style={{ width: SW, height: imgH }} pointerEvents="none">
          {/* Background: PK scoreboard PNG (transparent BG) */}
          <Image
            source={require('../assets/images/pk_scoreboard.png')}
            style={{ width: SW, height: imgH }}
            resizeMode="stretch"
          />

          {/* ── Left avatar (my avatar) ── */}
          <View style={[s.sbAvContainer, { left: L_AV_X, top: AV_Y, width: AV, height: AV, borderRadius: AV / 2 }]}>
            {myAvPtr
              ? <Image source={{ uri: myAvPtr }} style={{ width: AV, height: AV, borderRadius: AV / 2 }} />
              : <View style={[s.sbAvPlaceholder, { width: AV, height: AV, borderRadius: AV / 2 }]}>
                  <Text style={{ fontSize: AV * 0.45 }}>👤</Text>
                </View>}
          </View>

          {/* ── Left host name ── */}
          <Text
            style={[s.sbName, { left: L_NM_X, top: NM_Y, width: NM_W, color: '#fff' }]}
            numberOfLines={1}
          >
            {myName}
          </Text>

          {/* ── Left score ── */}
          <Text style={[s.sbScore, { left: L_SC_X - 40, top: SC_Y, width: 80, textAlign: 'center' }]}>
            {myScore.toLocaleString()}
          </Text>

          {/* ── Right avatar (opponent) ── */}
          <View style={[s.sbAvContainer, { left: R_AV_X, top: AV_Y, width: AV, height: AV, borderRadius: AV / 2 }]}>
            {oppAvPtr
              ? <Image source={{ uri: oppAvPtr }} style={{ width: AV, height: AV, borderRadius: AV / 2 }} />
              : <View style={[s.sbAvPlaceholder, { width: AV, height: AV, borderRadius: AV / 2 }]}>
                  <Text style={{ fontSize: AV * 0.45 }}>👤</Text>
                </View>}
          </View>

          {/* ── Right host name ── */}
          <Text
            style={[s.sbName, { left: R_NM_X, top: NM_Y, width: NM_W, textAlign: 'right', color: '#fff' }]}
            numberOfLines={1}
          >
            {oppName}
          </Text>

          {/* ── Right score ── */}
          <Text style={[s.sbScore, { left: R_SC_X - 40, top: SC_Y, width: 80, textAlign: 'center' }]}>
            {oppScore.toLocaleString()}
          </Text>
        </View>

        {/* ── Timer pill (below scoreboard) ───────────────────────────── */}
        <View style={s.sbTimerRow} pointerEvents="none">
          <View style={s.sbTimerPill}>
            <Text style={s.sbTimerTxt}>{fmtTime(battlesecs)}</Text>
          </View>
        </View>

        {/* ── SPACER — camera shows here ─────────────────────────────── */}
        <View style={{ flex: 1 }} pointerEvents="none" />

        {/* ── Score ratio bar + hint (bottom) ───────────────────────── */}
        <LinearGradient
          colors={['rgba(0,0,0,0.0)', 'rgba(0,0,0,0.80)']}
          style={s.pkBottomGrad}
          pointerEvents="none"
        >
          <View style={s.pkBarTrack}>
            <Animated.View style={[s.pkBarLeft, { flex: leftFlex }]}>
              <LinearGradient colors={['#e83a3a','#ff6b81']} style={StyleSheet.absoluteFill} start={{x:0,y:0}} end={{x:1,y:0}} />
            </Animated.View>
            <View style={s.pkBarDivider} />
            <Animated.View style={[s.pkBarRight, { flex: rightFlex }]}>
              <LinearGradient colors={['#1e7de0','#6eb7ff']} style={StyleSheet.absoluteFill} start={{x:0,y:0}} end={{x:1,y:0}} />
            </Animated.View>
          </View>
          <Text style={s.pkHintTxt}>🎁 Kirim gift untuk menambah poin!</Text>
        </LinearGradient>
      </Animated.View>
    );
  }

  // ── RESULT PHASE overlay ────────────────────────────────────────────────────
  if (phase === 'result') {
    const myFinalScore  = myRole === 'challenger' ? (battle?.challengerScore ?? 0) : (battle?.opponentScore ?? 0);
    const oppFinalScore = myRole === 'challenger' ? (battle?.opponentScore  ?? 0) : (battle?.challengerScore ?? 0);
    const won  = winner === 'challenger';
    const tied = winner === 'tie';
    const colors = won ? ['#f9ca24','#f0932b'] : tied ? ['#636e72','#2d3436'] : ['#c0392b','#7f0000'];

    return (
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: overlayO, zIndex: 120 }]}>
        <LinearGradient colors={colors} style={[StyleSheet.absoluteFill, s.resultContainer]}>
          <Animated.View style={{ transform: [{ scale: resultS }], alignItems: 'center' }}>
            <Text style={s.resultEmoji}>{won ? '👑' : tied ? '🤝' : '💔'}</Text>
            <Text style={s.resultText}>{won ? 'MENANG!' : tied ? 'SERI' : 'KALAH'}</Text>
            <Text style={s.resultSub}>{won ? 'Kamu memenangkan PK Battle!' : tied ? 'Pertarungan berakhir seri!' : 'Lebih semangat next time!'}</Text>
            <View style={s.resultScoreRow}>
              <View style={s.resultScoreBox}>
                <Text style={s.resultScoreLabel}>Skor kamu</Text>
                <Text style={s.resultScoreNum}>{myFinalScore.toLocaleString()}</Text>
              </View>
              <View style={s.resultScoreDivider} />
              <View style={s.resultScoreBox}>
                <Text style={s.resultScoreLabel}>Skor lawan</Text>
                <Text style={s.resultScoreNum}>{oppFinalScore.toLocaleString()}</Text>
              </View>
            </View>
            <Text style={s.resultAutoClose}>Menutup otomatis...</Text>
          </Animated.View>
        </LinearGradient>
      </Animated.View>
    );
  }

  // ── IDLE PHASE — bottom sheet ────────────────────────────────────────────────
  if (phase === 'idle') {
    return (
      <View style={[StyleSheet.absoluteFill, { zIndex: 110 }]}>
        <TouchableWithoutFeedback onPress={() => { slideOut(() => onClose()); }}>
          <View style={s.backdrop} />
        </TouchableWithoutFeedback>
        <Animated.View style={[s.sheet, { transform: [{ translateY: sheetY }], paddingBottom: insets.bottom + 12 }]}>
          {/* Handle */}
          <View style={s.sheetHandle} />
          {/* Header */}
          <LinearGradient colors={['#ff4757','#c0392b']} style={s.sheetHeader} start={{x:0,y:0}} end={{x:1,y:1}}>
            <Text style={s.sheetTitle}>⚔️  PK Battle</Text>
            <TouchableOpacity onPress={() => { slideOut(() => onClose()); }} hitSlop={{top:8,bottom:8,left:8,right:8}}>
              <Ionicons name="close-circle" size={26} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          </LinearGradient>
          <Text style={s.sheetSub}>Tantang host lain untuk adu hadiah 5 menit!</Text>
          {/* Search */}
          <View style={s.searchRow}>
            <Ionicons name="search" size={17} color="#888" style={{ marginRight: 6 }} />
            <TextInput
              style={s.searchInput}
              placeholder="Cari username host..."
              placeholderTextColor="#666"
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={17} color="#555" />
              </TouchableOpacity>
            )}
          </View>
          {/* Refresh */}
          <TouchableOpacity style={s.refreshBtn} onPress={loadHosts}>
            <Ionicons name="refresh" size={15} color="#ff4757" />
            <Text style={s.refreshTxt}>Refresh</Text>
          </TouchableOpacity>
          {/* List */}
          {hostsLoading
            ? <ActivityIndicator color="#ff4757" style={{ marginTop: 30 }} size="large" />
            : filteredHosts.length === 0
              ? <View style={s.emptyBox}>
                  <Text style={s.emptyIcon}>📡</Text>
                  <Text style={s.emptyTxt}>Tidak ada host live saat ini</Text>
                  <Text style={s.emptyHint}>Coba lagi nanti atau refresh halaman</Text>
                </View>
              : <FlatList
                  data={filteredHosts}
                  keyExtractor={h => h.id}
                  renderItem={({ item: h }) => (
                    <View style={s.hostRow}>
                      <AvatarCircle uri={h.avatarUrl} size={42} />
                      <View style={s.hostInfo}>
                        <Text style={s.hostName} numberOfLines={1}>{h.displayName ?? h.username}</Text>
                        <Text style={s.hostUser}>@{h.username}  ·  👁 {h.viewerCount}</Text>
                      </View>
                      <TouchableOpacity style={s.challengeBtn} onPress={() => handleChallenge(h)} activeOpacity={0.8}>
                        <LinearGradient colors={['#ff4757','#c0392b']} style={s.challengeBtnGrad} start={{x:0,y:0}} end={{x:1,y:1}}>
                          <Text style={s.challengeBtnTxt}>Tantang</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                  )}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}
                />
          }
        </Animated.View>
      </View>
    );
  }

  // ── PENDING PHASE — waiting for opponent ─────────────────────────────────────
  if (phase === 'pending' && incomingBattle) {
    return (
      <Animated.View style={[StyleSheet.absoluteFill, s.centeredOverlay, { opacity: overlayO, zIndex: 110 }]}>
        <Animated.View style={[s.card, { transform: [{ scale: cardS }] }]}>
          <LinearGradient colors={['#1a1a2e','#16213e']} style={s.cardInner}>
            <Text style={s.cardTitle}>⏳ Menunggu...</Text>
            <PulsingRing>
              <AvatarCircle uri={incomingBattle.challengerAvatar} size={64} border="#ff4757" />
            </PulsingRing>
            <Text style={s.cardName}>{incomingBattle.challengerDisplayName ?? incomingBattle.challengerUsername}</Text>
            <Text style={s.cardSub}>@{incomingBattle.challengerUsername}</Text>
            <Text style={s.waitingTxt}>Menunggu persetujuan lawan...</Text>
            {pendingSecs > 0 && <Text style={s.countdownTxt}>Batal otomatis dalam {pendingSecs}s</Text>}
            <TouchableOpacity style={s.cancelBtn} onPress={handleCancel} activeOpacity={0.8}>
              <Text style={s.cancelBtnTxt}>Batalkan Tantangan</Text>
            </TouchableOpacity>
          </LinearGradient>
        </Animated.View>
      </Animated.View>
    );
  }

  // ── INCOMING PHASE — receive challenge ───────────────────────────────────────
  if (phase === 'incoming' && incomingBattle) {
    return (
      <Animated.View style={[StyleSheet.absoluteFill, s.centeredOverlay, { opacity: overlayO, zIndex: 110 }]}>
        <Animated.View style={[s.card, { transform: [{ scale: cardS }] }]}>
          <LinearGradient colors={['#1a0010','#2d0025']} style={s.cardInner}>
            {/* Glowing badge */}
            <LinearGradient colors={['#ff4757','#c0392b']} style={s.incomingBadge} start={{x:0,y:0}} end={{x:1,y:1}}>
              <Text style={s.incomingBadgeTxt}>⚔️  TANTANGAN PK!</Text>
            </LinearGradient>
            <View style={{ marginTop: 16 }}>
              <PulsingRing color="#ff4757">
                <AvatarCircle uri={incomingBattle.challengerAvatar} size={72} border="#ff4757" />
              </PulsingRing>
            </View>
            <Text style={s.incomingName}>{incomingBattle.challengerDisplayName ?? incomingBattle.challengerUsername}</Text>
            <Text style={s.incomingUser}>@{incomingBattle.challengerUsername}</Text>
            <Text style={s.incomingMsg}>mengundang kamu PK Battle!</Text>
            {incomingSecs > 0 && (
              <View style={s.incomingTimerRow}>
                <Ionicons name="time-outline" size={14} color="#ff4757" />
                <Text style={s.incomingTimer}> {incomingSecs}s tersisa</Text>
              </View>
            )}
            <View style={s.incomingBtnRow}>
              <TouchableOpacity style={s.declineBtn} onPress={handleDecline} activeOpacity={0.8}>
                <Text style={s.declineBtnTxt}>❌  Tolak</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.acceptBtn} onPress={handleAccept} activeOpacity={0.8}>
                <LinearGradient colors={['#2ed573','#17a54a']} style={s.acceptBtnGrad} start={{x:0,y:0}} end={{x:1,y:1}}>
                  <Text style={s.acceptBtnTxt}>✅  Terima</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </Animated.View>
      </Animated.View>
    );
  }

  return null;
}

// ─── Pulsing ring decoration ────────────────────────────────────────────────────
function PulsingRing({ children, color = '#ff4757' }: { children: React.ReactNode; color?: string }) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1.18, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1,    duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{
        position: 'absolute', width: 90, height: 90, borderRadius: 45,
        borderWidth: 2, borderColor: color, opacity: 0.45,
        transform: [{ scale: anim }],
      }} />
      {children}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  backdrop:         { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet:            { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#0d0d1a', borderTopLeftRadius: 22, borderTopRightRadius: 22, minHeight: 420, maxHeight: '78%' },
  sheetHandle:      { width: 40, height: 4, borderRadius: 2, backgroundColor: '#333', alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  sheetHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  sheetTitle:       { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 0.4 },
  sheetSub:         { color: '#aaa', fontSize: 12, textAlign: 'center', marginTop: 6, marginBottom: 10, paddingHorizontal: 20 },
  searchRow:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a2e', borderRadius: 12, marginHorizontal: 16, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 4 },
  searchInput:      { flex: 1, color: '#fff', fontSize: 13 },
  refreshBtn:       { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 4, marginBottom: 6 },
  refreshTxt:       { color: '#ff4757', fontSize: 12, marginLeft: 4 },
  emptyBox:         { alignItems: 'center', paddingTop: 40 },
  emptyIcon:        { fontSize: 36, marginBottom: 10 },
  emptyTxt:         { color: '#ccc', fontSize: 14, fontWeight: '600' },
  emptyHint:        { color: '#666', fontSize: 12, marginTop: 4 },
  hostRow:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1a1a2e' },
  hostInfo:         { flex: 1, marginLeft: 10 },
  hostName:         { color: '#fff', fontSize: 14, fontWeight: '700' },
  hostUser:         { color: '#888', fontSize: 12, marginTop: 2 },
  challengeBtn:     { borderRadius: 10, overflow: 'hidden' },
  challengeBtnGrad: { paddingHorizontal: 14, paddingVertical: 7 },
  challengeBtnTxt:  { color: '#fff', fontWeight: '700', fontSize: 13 },

  centeredOverlay:  { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.72)' },
  card:             { width: '84%', borderRadius: 24, overflow: 'hidden' },
  cardInner:        { padding: 28, alignItems: 'center' },
  cardTitle:        { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 18 },
  cardName:         { color: '#fff', fontSize: 17, fontWeight: '800', marginTop: 14 },
  cardSub:          { color: '#888', fontSize: 13, marginTop: 2 },
  waitingTxt:       { color: '#ccc', fontSize: 13, marginTop: 16, textAlign: 'center' },
  countdownTxt:     { color: '#ff6b81', fontSize: 12, marginTop: 6 },
  cancelBtn:        { marginTop: 22, borderWidth: 1.5, borderColor: '#ff4757', borderRadius: 12, paddingHorizontal: 28, paddingVertical: 10 },
  cancelBtnTxt:     { color: '#ff4757', fontWeight: '700', fontSize: 14 },

  incomingBadge:    { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20 },
  incomingBadgeTxt: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 1 },
  incomingName:     { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 14 },
  incomingUser:     { color: '#ff6b81', fontSize: 13, marginTop: 2 },
  incomingMsg:      { color: '#ccc', fontSize: 13, marginTop: 6, textAlign: 'center' },
  incomingTimerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  incomingTimer:    { color: '#ff4757', fontSize: 13, fontWeight: '700' },
  incomingBtnRow:   { flexDirection: 'row', gap: 12, marginTop: 22 },
  declineBtn:       { flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: '#555', alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  declineBtnTxt:    { color: '#ccc', fontWeight: '700', fontSize: 14 },
  acceptBtn:        { flex: 1, borderRadius: 12, overflow: 'hidden' },
  acceptBtnGrad:    { paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  acceptBtnTxt:     { color: '#fff', fontWeight: '800', fontSize: 14 },

  // Scoreboard image overlay
  sbAvContainer:    { position: 'absolute', overflow: 'hidden' },
  sbAvPlaceholder:  { backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  sbName:           {
    position: 'absolute',
    fontSize: 11, fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  sbScore:          {
    position: 'absolute',
    color: '#fff', fontSize: 18, fontWeight: '900', textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  sbTimerRow:       { alignItems: 'center', marginTop: 2 },
  sbTimerPill:      { backgroundColor: 'rgba(0,0,0,0.82)', borderRadius: 16, paddingHorizontal: 18, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  sbTimerTxt:       { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 1 },

  // Active phase progress bar (bottom)
  pkBottomGrad:     { paddingTop: 14, paddingBottom: 14, paddingHorizontal: 16 },
  pkBarTrack:       { height: 10, borderRadius: 5, flexDirection: 'row', overflow: 'hidden', backgroundColor: '#333', marginBottom: 8 },
  pkBarLeft:        { overflow: 'hidden' },
  pkBarRight:       { overflow: 'hidden' },
  pkBarDivider:     { width: 2, backgroundColor: '#fff', zIndex: 1 },
  pkHintTxt:        { color: 'rgba(255,255,255,0.8)', fontSize: 11, textAlign: 'center', fontWeight: '600' },

  // Result
  resultContainer:  { alignItems: 'center', justifyContent: 'center' },
  resultEmoji:      { fontSize: 72, marginBottom: 10 },
  resultText:       { color: '#fff', fontSize: 52, fontWeight: '900', letterSpacing: 2, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  resultSub:        { color: 'rgba(255,255,255,0.85)', fontSize: 14, marginTop: 8, textAlign: 'center' },
  resultScoreRow:   { flexDirection: 'row', marginTop: 28, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 16, overflow: 'hidden' },
  resultScoreBox:   { alignItems: 'center', paddingHorizontal: 28, paddingVertical: 16 },
  resultScoreLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  resultScoreNum:   { color: '#fff', fontSize: 26, fontWeight: '900', marginTop: 4 },
  resultScoreDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  resultAutoClose:  { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 20 },
});

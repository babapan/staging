// Custom entry point — registerGlobals() HARUS dipanggil sebelum apapun
// agar react-native-webrtc terdaftar ke RN runtime (wajib untuk LiveKit Room)
try {
  const { registerGlobals } = require('@livekit/react-native');
  registerGlobals();
} catch (e) {
  // Expo Go atau lingkungan tanpa native module — diabaikan, audio tidak aktif
}

import 'expo-router/entry';

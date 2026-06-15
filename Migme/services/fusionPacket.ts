/**
 * fusionPacket.ts
 *
 * TypeScript port of FusionPacket.java + FusionField.java from the Android client.
 *
 * Wire format (big-endian):
 *   [1]  packet marker  = 0x02
 *   [2]  PacketType     (short)
 *   [2]  transactionId  (short)
 *   [4]  contentLength  (int)  = sum of (6 + fieldValueLen) for every field
 *   --- repeated fields ---
 *   [2]  fieldNumber    (short)
 *   [4]  fieldLength    (int)
 *   [N]  fieldBytes     (big-endian for numeric types, UTF-8 for strings)
 */

export const PACKET_MARKER = 0x02;

// ─── PacketType enum ──────────────────────────────────────────────────────────
export enum PacketType {
  UNKNOWN           = -1,
  ERROR             =  0,
  OK                =  1,
  PING              =  2,
  PONG              =  3,
  ALERT             =  5,
  NOTIFICATION      = 14,
  CAPTCHA           = 16,
  CAPTCHA_RESPONSE  = 17,
  NEW_REGISTRATION  = 100,
  REGISTRATION      = 101,
  REGISTRATION_CHALLENGE = 102,
  REGISTRATION_RESPONSE  = 103,
  REGISTRATION_ERROR     = 104,
  LOGIN             = 200,
  LOGIN_CHALLENGE   = 201,
  LOGIN_RESPONSE    = 202,
  LOGIN_OK          = 203,
  SLIM_LOGIN        = 209,
  SLIM_LOGIN_OK     = 210,
  CREATE_SESSION    = 211,
  SLIM_LOGIN_CHALLENGE = 212,
  LOGOUT            = 300,
  SESSION_TERMINATED = 301,
  GET_CONTACTS      = 400,
  GROUP             = 401,
  CONTACT           = 402,
  GET_CONTACTS_COMPLETE = 403,
  PRESENCE          = 404,
  ADD_CONTACT       = 405,
  CONTACT_REQUEST   = 412,
  STATUS_MESSAGE    = 421,
  MESSAGE           = 500,
  LEAVE_PRIVATE_CHAT = 507,
  GET_CHATROOMS     = 700,
  CHATROOM          = 701,
  GET_CHATROOMS_COMPLETE = 702,
  JOIN_CHATROOM     = 703,
  LEAVE_CHATROOM    = 704,
  CREATE_CHATROOM   = 705,
  KICK_CHATROOM_PARTICIPANT = 706,
  GET_CHATROOM_PARTICIPANTS = 707,
  CHATROOM_PARTICIPANTS = 708,
  ADD_FAVORITE_CHATROOM    = 711,
  REMOVE_FAVORITE_CHATROOM = 712,
  CHATROOM_NOTIFICATION = 718,
  CHATROOM_USER_STATUS  = 720,
}

const PACKET_TYPE_LOOKUP = new Map<number, PacketType>();
for (const val of Object.values(PacketType)) {
  if (typeof val === 'number') PACKET_TYPE_LOOKUP.set(val, val as PacketType);
}
export function packetTypeFromValue(v: number): PacketType {
  return PACKET_TYPE_LOOKUP.get(v) ?? PacketType.UNKNOWN;
}

// ─── ClientType enum ──────────────────────────────────────────────────────────
export enum ClientType {
  ANDROID = 8,
  IOS     = 17,
}

// ─── ChatDestinationType enum ─────────────────────────────────────────────────
export enum ChatDestinationType {
  UNKNOWN           = 0,
  PRIVATE           = 1,
  GROUP_CHAT        = 2,
  CHATROOM          = 3,
  DISTRIBUTION_LIST = 4,
}

// ─── ContentType enum ─────────────────────────────────────────────────────────
export enum ContentType {
  TEXT  = 1,
  IMAGE = 2,
  AUDIO = 3,
  VIDEO = 4,
  FILE  = 5,
  EMOTE = 6,
}

// ─── Helper: big-endian encode/decode ────────────────────────────────────────

function writeInt16BE(buf: Uint8Array, offset: number, v: number): void {
  buf[offset]     = (v >> 8) & 0xff;
  buf[offset + 1] = v & 0xff;
}

function writeInt32BE(buf: Uint8Array, offset: number, v: number): void {
  buf[offset]     = (v >> 24) & 0xff;
  buf[offset + 1] = (v >> 16) & 0xff;
  buf[offset + 2] = (v >> 8)  & 0xff;
  buf[offset + 3] = v & 0xff;
}

function writeInt64BE(buf: Uint8Array, offset: number, v: bigint): void {
  const hi = Number(v >> 32n) >>> 0;
  const lo = Number(v & 0xFFFFFFFFn) >>> 0;
  writeInt32BE(buf, offset, hi);
  writeInt32BE(buf, offset + 4, lo);
}

function readInt16BE(buf: Uint8Array, offset: number): number {
  const v = ((buf[offset] << 8) | buf[offset + 1]);
  return v > 0x7fff ? v - 0x10000 : v;
}

function readInt32BE(buf: Uint8Array, offset: number): number {
  const v = ((buf[offset] << 24) | (buf[offset+1] << 16) | (buf[offset+2] << 8) | buf[offset+3]) >>> 0;
  return v > 0x7fffffff ? v - 0x100000000 : v;
}

function readUInt32BE(buf: Uint8Array, offset: number): number {
  return ((buf[offset] << 24) | (buf[offset+1] << 16) | (buf[offset+2] << 8) | buf[offset+3]) >>> 0;
}

function readInt64BEAsBigInt(buf: Uint8Array, offset: number): bigint {
  const hi = readUInt32BE(buf, offset);
  const lo = readUInt32BE(buf, offset + 4);
  return (BigInt(hi) << 32n) | BigInt(lo);
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8');

// ─── FusionField ─────────────────────────────────────────────────────────────
export class FusionField {
  private bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  static fromByte(v: number): FusionField {
    return new FusionField(new Uint8Array([v & 0xff]));
  }

  static fromBoolean(v: boolean): FusionField {
    return new FusionField(new Uint8Array([v ? 1 : 0]));
  }

  static fromShort(v: number): FusionField {
    const b = new Uint8Array(2);
    writeInt16BE(b, 0, v);
    return new FusionField(b);
  }

  static fromInt(v: number): FusionField {
    const b = new Uint8Array(4);
    writeInt32BE(b, 0, v);
    return new FusionField(b);
  }

  static fromLong(v: bigint): FusionField {
    const b = new Uint8Array(8);
    writeInt64BE(b, 0, v);
    return new FusionField(b);
  }

  static fromString(v: string): FusionField {
    return new FusionField(encoder.encode(v));
  }

  getBytes(): Uint8Array {
    return this.bytes;
  }

  length(): number {
    return this.bytes.length;
  }

  getByte(): number | null {
    if (this.bytes.length >= 1) return this.bytes[0];
    return null;
  }

  getBoolean(): boolean | null {
    const b = this.getByte();
    if (b === null) return null;
    return b !== 0;
  }

  getShort(): number | null {
    if (this.bytes.length >= 2) return readInt16BE(this.bytes, 0);
    return null;
  }

  getInt(): number | null {
    if (this.bytes.length >= 4) return readInt32BE(this.bytes, 0);
    return null;
  }

  getLong(): bigint | null {
    if (this.bytes.length >= 8) return readInt64BEAsBigInt(this.bytes, 0);
    return null;
  }

  getString(): string | null {
    try {
      return decoder.decode(this.bytes);
    } catch {
      return null;
    }
  }
}

// ─── FusionPacket ─────────────────────────────────────────────────────────────
export class FusionPacket {
  readonly type: PacketType;
  readonly transactionId: number;
  private fields: Map<number, FusionField> = new Map();
  private static txCounter = 1;

  constructor(type: PacketType, transactionId?: number) {
    this.type = type;
    this.transactionId = transactionId ?? FusionPacket.nextTxId();
  }

  static nextTxId(): number {
    const id = FusionPacket.txCounter & 0x7fff;
    FusionPacket.txCounter = (FusionPacket.txCounter + 1) & 0x7fff;
    return id;
  }

  // ── Field setters ──────────────────────────────────────────────────────────
  setBoolean(fieldNum: number, v: boolean): this {
    this.fields.set(fieldNum, FusionField.fromBoolean(v));
    return this;
  }
  setByte(fieldNum: number, v: number): this {
    this.fields.set(fieldNum, FusionField.fromByte(v));
    return this;
  }
  setShort(fieldNum: number, v: number): this {
    this.fields.set(fieldNum, FusionField.fromShort(v));
    return this;
  }
  setInt(fieldNum: number, v: number): this {
    this.fields.set(fieldNum, FusionField.fromInt(v));
    return this;
  }
  setLong(fieldNum: number, v: bigint): this {
    this.fields.set(fieldNum, FusionField.fromLong(v));
    return this;
  }
  setString(fieldNum: number, v: string): this {
    this.fields.set(fieldNum, FusionField.fromString(v));
    return this;
  }
  setBytes(fieldNum: number, v: Uint8Array): this {
    this.fields.set(fieldNum, new FusionField(v));
    return this;
  }

  // ── Field getters ──────────────────────────────────────────────────────────
  getField(fieldNum: number): FusionField | undefined {
    return this.fields.get(fieldNum);
  }
  getByte(fieldNum: number): number | null {
    return this.getField(fieldNum)?.getByte() ?? null;
  }
  getBoolean(fieldNum: number): boolean | null {
    return this.getField(fieldNum)?.getBoolean() ?? null;
  }
  getShort(fieldNum: number): number | null {
    return this.getField(fieldNum)?.getShort() ?? null;
  }
  getInt(fieldNum: number): number | null {
    return this.getField(fieldNum)?.getInt() ?? null;
  }
  getLong(fieldNum: number): bigint | null {
    return this.getField(fieldNum)?.getLong() ?? null;
  }
  getString(fieldNum: number): string | null {
    return this.getField(fieldNum)?.getString() ?? null;
  }

  // ── Serialise to bytes ─────────────────────────────────────────────────────
  /** Total content length = sum of (2 + 4 + fieldLen) for all fields */
  private contentLength(): number {
    let total = 0;
    for (const f of this.fields.values()) {
      total += 2 + 4 + f.length();
    }
    return total;
  }

  /** Total wire length = 1 + 2 + 2 + 4 + contentLength */
  totalLength(): number {
    return 9 + this.contentLength();
  }

  toBytes(): Uint8Array {
    const buf = new Uint8Array(this.totalLength());
    let off = 0;

    buf[off++] = PACKET_MARKER;
    writeInt16BE(buf, off, this.type); off += 2;
    writeInt16BE(buf, off, this.transactionId); off += 2;
    writeInt32BE(buf, off, this.contentLength()); off += 4;

    for (const [fieldNum, field] of this.fields) {
      writeInt16BE(buf, off, fieldNum); off += 2;
      writeInt32BE(buf, off, field.length()); off += 4;
      buf.set(field.getBytes(), off); off += field.length();
    }

    return buf;
  }

  // ── Deserialise from raw bytes ─────────────────────────────────────────────
  static fromBytes(data: Uint8Array): FusionPacket {
    let off = 0;

    if (data[off++] !== PACKET_MARKER) {
      throw new Error(`Invalid packet marker: expected 0x02, got 0x${data[0].toString(16)}`);
    }

    const typeVal = readInt16BE(data, off); off += 2;
    const txId    = readInt16BE(data, off); off += 2;
    const contentLen = readUInt32BE(data, off); off += 4;

    if (contentLen > 358400) throw new Error(`Content length too large: ${contentLen}`);

    const type = packetTypeFromValue(typeVal);
    const pkt  = new FusionPacket(type, txId);

    let remaining = contentLen;
    while (remaining > 0) {
      if (off + 6 > data.length) throw new Error('Truncated field header');
      const fieldNum = readInt16BE(data, off); off += 2;
      const fieldLen = readUInt32BE(data, off); off += 4;
      if (fieldLen > 358400) throw new Error(`Field length too large: ${fieldLen}`);
      if (off + fieldLen > data.length) throw new Error('Truncated field value');
      const fieldBytes = data.slice(off, off + fieldLen); off += fieldLen;
      pkt.fields.set(fieldNum, new FusionField(fieldBytes));
      remaining -= 6 + fieldLen;
    }

    return pkt;
  }

  toString(): string {
    return `FusionPacket[type=${PacketType[this.type]}(${this.type}) txId=${this.transactionId} fields=${this.fields.size}]`;
  }
}

// ─── SHA-1 XOR-fold password hash (mirrors Tools.getSha1HashCode) ─────────────
/**
 * Computes SHA-1 of `challenge + password`, then XOR-folds the 20-byte
 * digest into a single 32-bit signed integer (4 bytes at a time).
 * This mirrors Tools.getSha1HashCode() in the Android client.
 */
export async function sha1PasswordHash(challenge: string, password: string): Promise<number> {
  const input = encoder.encode(challenge + password);
  const hashBuf = await crypto.subtle.digest('SHA-1', input);
  const hashBytes = new Uint8Array(hashBuf);

  let value = 0;
  for (let i = 0; i < hashBytes.length; i += 4) {
    const chunk =
      (((hashBytes[i]     & 0xff) << 24) |
       ((hashBytes[i + 1] & 0xff) << 16) |
       ((hashBytes[i + 2] & 0xff) << 8)  |
        (hashBytes[i + 3] & 0xff));
    value = (value ^ chunk) | 0;
  }
  return value;
}

/**
 * Fallback hash (non-SHA1 path): Java's String.hashCode() on
 * (challenge + password.toLowerCase()).
 * Mirrors: (challenge + password.toLowerCase()).hashCode()
 */
export function javaStringHashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i);
  }
  return h | 0;
}

// ─── Pre-built packet factories ───────────────────────────────────────────────
export const Packets = {
  /**
   * Build LOGIN packet — mirrors LoginConfig.createLoginPacket()
   * Fields from FusionPktLogin.java:
   *   1=protocolVersion(short), 2=clientType(byte), 3=clientVersion(short),
   *   5=username(string),       7=userAgent(string), 8=deviceName(string),
   *   9=initialPresence(byte),  11=fontHeight(int),  12=screenWidth(int),
   *   13=screenHeight(int),     15=language(string), 16=themeId(int),
   *   18=sessionId(string),     19=streamUserEvents(bool),
   *   23=appMenuVersion(int),   25=vgSize(int),      26=stickerSize(int)
   */
  login(username: string, sessionId?: string): FusionPacket {
    const pkt = new FusionPacket(PacketType.LOGIN);
    pkt.setShort(1, 1);                       // protocolVersion = 1
    pkt.setByte(2, ClientType.ANDROID);       // clientType = ANDROID(8) / IOS(17)
    pkt.setShort(3, 312);                     // clientVersion (3.12)
    pkt.setString(5, username);               // username
    pkt.setString(7, 'mig33/android/3.12.239.567'); // userAgent
    pkt.setString(8, 'droid');               // deviceName
    pkt.setByte(9, 1);                        // initialPresence = AVAILABLE(1)
    pkt.setInt(11, 36);                       // fontHeight
    pkt.setInt(12, 300);                      // screenWidth
    pkt.setInt(13, 400);                      // screenHeight
    pkt.setString(15, 'en-US');              // language
    pkt.setInt(16, 1);                        // themeId
    if (sessionId) pkt.setString(18, sessionId); // sessionId
    pkt.setBoolean(19, false);               // streamUserEvents
    pkt.setInt(23, 1);                        // appMenuVersion
    pkt.setInt(25, 64);                       // virtualGiftPixelSize
    pkt.setInt(26, 400);                      // stickerPixelSize
    return pkt;
  },

  /**
   * Build LOGIN_RESPONSE packet — mirrors FusionPktLoginResponse.java
   *   field 1 = passwordHash (int)
   */
  loginResponse(passwordHash: number): FusionPacket {
    const pkt = new FusionPacket(PacketType.LOGIN_RESPONSE);
    pkt.setInt(1, passwordHash);
    return pkt;
  },

  /** PING packet */
  ping(): FusionPacket {
    return new FusionPacket(PacketType.PING);
  },

  /** PONG packet */
  pong(): FusionPacket {
    return new FusionPacket(PacketType.PONG);
  },

  /** LOGOUT packet */
  logout(): FusionPacket {
    return new FusionPacket(PacketType.LOGOUT);
  },

  /**
   * JOIN_CHATROOM — mirrors FusionPktJoinChatroom.java
   *   field 1 = chatroomName (string)
   *   field 2 = retrievePinned (bool)
   */
  joinChatroom(chatroomName: string, retrievePinned = true): FusionPacket {
    const pkt = new FusionPacket(PacketType.JOIN_CHATROOM);
    pkt.setString(1, chatroomName);
    pkt.setBoolean(2, retrievePinned);
    return pkt;
  },

  /**
   * LEAVE_CHATROOM — mirrors FusionPktLeaveChatroom.java
   *   field 1 = chatroomName (string)
   */
  leaveChatroom(chatroomName: string): FusionPacket {
    const pkt = new FusionPacket(PacketType.LEAVE_CHATROOM);
    pkt.setString(1, chatroomName);
    return pkt;
  },

  /**
   * MESSAGE to chatroom — mirrors FusionPktMessage.java
   *   1=messageType(byte),   2=source(string),       3=chatType(byte),
   *   4=destination(string), 6=contentType(short),   8=content(string)
   */
  chatroomMessage(
    source: string,
    chatroomName: string,
    text: string,
  ): FusionPacket {
    const pkt = new FusionPacket(PacketType.MESSAGE);
    pkt.setByte(1, 1);                              // messageType = FUSION(1)
    pkt.setString(2, source);                       // source = username
    pkt.setByte(3, ChatDestinationType.CHATROOM);   // chatType = CHATROOM(3)
    pkt.setString(4, chatroomName);                 // destination
    pkt.setShort(6, ContentType.TEXT);              // contentType = TEXT(1)
    pkt.setString(8, text);                         // content
    return pkt;
  },

  /**
   * PRIVATE MESSAGE — mirrors FusionPktMessage.java
   */
  privateMessage(
    source: string,
    destination: string,
    text: string,
  ): FusionPacket {
    const pkt = new FusionPacket(PacketType.MESSAGE);
    pkt.setByte(1, 1);                               // messageType = FUSION(1)
    pkt.setString(2, source);                        // source
    pkt.setByte(3, ChatDestinationType.PRIVATE);     // chatType = PRIVATE(1)
    pkt.setString(4, destination);                   // destination
    pkt.setShort(6, ContentType.TEXT);               // contentType = TEXT(1)
    pkt.setString(8, text);                          // content
    return pkt;
  },
};

// ─── Stream buffer: accumulate TCP chunks into complete packets ───────────────
const MIN_PACKET_HEADER = 9; // 1 + 2 + 2 + 4

export class PacketStreamBuffer {
  private buf: Uint8Array = new Uint8Array(0);

  feed(chunk: Uint8Array): FusionPacket[] {
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf);
    merged.set(chunk, this.buf.length);
    this.buf = merged;

    const packets: FusionPacket[] = [];

    while (this.buf.length >= MIN_PACKET_HEADER) {
      if (this.buf[0] !== PACKET_MARKER) {
        // Alignment error — scan for next 0x02
        const next = this.buf.indexOf(PACKET_MARKER, 1);
        if (next === -1) { this.buf = new Uint8Array(0); break; }
        this.buf = this.buf.slice(next);
        continue;
      }

      const contentLen = readUInt32BE(this.buf, 5);
      const totalLen   = MIN_PACKET_HEADER + contentLen;

      if (this.buf.length < totalLen) break; // wait for more data

      try {
        const pkt = FusionPacket.fromBytes(this.buf.slice(0, totalLen));
        packets.push(pkt);
      } catch (e) {
        // skip malformed packet
      }

      this.buf = this.buf.slice(totalLen);
    }

    return packets;
  }

  clear(): void {
    this.buf = new Uint8Array(0);
  }
}

export interface Emoticon {
  key: string;
  label: string;
  unicode: string;
  image: ReturnType<typeof require>;
  hotkeys: string[];
}

import { EXTRA_EMOTICONS, EXTRA_EMOTICON_CATEGORIES } from './extraEmoticons';
export { EXTRA_EMOTICONS, EXTRA_EMOTICON_CATEGORIES };
export type { EmoticonCategory } from './extraEmoticons';

export interface Sticker {
  key: string;
  label: string;
  image: ReturnType<typeof require>;
}

export interface StickerPack {
  id: string;
  name: string;
  coverImage: ReturnType<typeof require>;
  stickers: Sticker[];
}

export const EMOTICONS: Emoticon[] = [
  { key: 'angel',    label: 'Angel',    unicode: '😇', image: require('../assets/emoticons/default-pack/e_angel_48.png'),    hotkeys: [':angel:', '(angel)', 'O:)', 'O:-)'] },
  { key: 'awesome',  label: 'Awesome',  unicode: '🤩', image: require('../assets/emoticons/default-pack/e_awesome_48.png'),  hotkeys: [':awesome:', '(awesome)', ':o)'] },
  { key: 'blank',    label: 'Blank',    unicode: '😑', image: require('../assets/emoticons/default-pack/e_blank_48.png'),    hotkeys: [':blank:', ':|', ':-|'] },
  { key: 'blush',    label: 'Blush',    unicode: '😊', image: require('../assets/emoticons/default-pack/e_blush_48.png'),    hotkeys: [':blush:', ':$', ':-$', '(blush)'] },
  { key: 'bored',    label: 'Bored',    unicode: '😒', image: require('../assets/emoticons/default-pack/e_bored_48.png'),    hotkeys: [':bored:', '(bored)'] },
  { key: 'cheeky',   label: 'Cheeky',   unicode: '😜', image: require('../assets/emoticons/default-pack/e_cheeky_48.png'),   hotkeys: [':cheeky:', ':P', ':-P', ':p', ':-p'] },
  { key: 'confused', label: 'Confused', unicode: '😕', image: require('../assets/emoticons/default-pack/e_confused_48.png'), hotkeys: [':confused:', ':/', ':-/', ':S', ':-S'] },
  { key: 'cool',     label: 'Cool',     unicode: '😎', image: require('../assets/emoticons/default-pack/e_cool_48.png'),     hotkeys: [':cool:', 'B-)', 'B)', '8)'] },
  { key: 'cry',      label: 'Cry',      unicode: '😢', image: require('../assets/emoticons/default-pack/e_cry_48.png'),      hotkeys: [':cry:', ';(', ';-('] },
  { key: 'dance',    label: 'Dance',    unicode: '💃', image: require('../assets/emoticons/default-pack/e_dance_48.png'),    hotkeys: [':dance:', '(dance)'] },
  { key: 'doh',      label: 'Doh',      unicode: '🤦', image: require('../assets/emoticons/default-pack/e_doh_48.png'),      hotkeys: [':doh:', '(doh)'] },
  { key: 'drool',    label: 'Drool',    unicode: '🤤', image: require('../assets/emoticons/default-pack/e_drool_48.png'),    hotkeys: [':drool:', '(drool)', ':Q'] },
  { key: 'eh',       label: 'Eh',       unicode: '😅', image: require('../assets/emoticons/default-pack/e_eh_48.png'),       hotkeys: [':eh:', '(eh)'] },
  { key: 'geek',     label: 'Geek',     unicode: '🤓', image: require('../assets/emoticons/default-pack/e_geek_48.png'),     hotkeys: [':geek:', '(geek)'] },
  { key: 'grr',      label: 'Grr',      unicode: '😤', image: require('../assets/emoticons/default-pack/e_grr_48.png'),      hotkeys: [':grr:', '(grr)', '>:-(', '>:('] },
  { key: 'happy',    label: 'Happy',    unicode: '😄', image: require('../assets/emoticons/default-pack/e_happy_48.png'),    hotkeys: [':happy:', ':-)', ':)', '=)'] },
  { key: 'heart',    label: 'Heart',    unicode: '❤️',  image: require('../assets/emoticons/default-pack/e_heart_48.png'),    hotkeys: [':heart:', '<3', '(heart)', '(l)', '(L)'] },
  { key: 'hee',      label: 'Hee',      unicode: '😆', image: require('../assets/emoticons/default-pack/e_hee_48.png'),      hotkeys: [':hee:', ':-D', ':D', '=D', 'XD', 'xD'] },
  { key: 'hipster',  label: 'Hipster',  unicode: '🕶️', image: require('../assets/emoticons/default-pack/e_hipster_48.png'),  hotkeys: [':hipster:', '(hipster)'] },
  { key: 'hug',      label: 'Hug',      unicode: '🤗', image: require('../assets/emoticons/default-pack/e_hug_48.png'),      hotkeys: [':hug:', '(hug)', ':}'] },
  { key: 'kiss',     label: 'Kiss',     unicode: '😘', image: require('../assets/emoticons/default-pack/e_kiss_48.png'),     hotkeys: [':kiss:', ':-*', ':*', ':-x', ':x'] },
  { key: 'love',     label: 'Love',     unicode: '😍', image: require('../assets/emoticons/default-pack/e_love_48.png'),     hotkeys: [':love:', '(inlove)', '(love)'] },
  { key: 'nerd',     label: 'Nerd',     unicode: '🧐', image: require('../assets/emoticons/default-pack/e_nerd_48.png'),     hotkeys: [':nerd:', '(nerd)'] },
  { key: 'notme',    label: 'Not Me',   unicode: '🙅', image: require('../assets/emoticons/default-pack/e_notme_48.png'),    hotkeys: [':notme:', '(notme)'] },
  { key: 'poo',      label: 'Poo',      unicode: '💩', image: require('../assets/emoticons/default-pack/e_poo_48.png'),      hotkeys: [':poo:', '(poo)'] },
  { key: 'puke',     label: 'Puke',     unicode: '🤮', image: require('../assets/emoticons/default-pack/e_puke_48.png'),     hotkeys: [':puke:', '(puke)', ':&', ':-&'] },
  { key: 'rage',     label: 'Rage',     unicode: '😡', image: require('../assets/emoticons/default-pack/e_rage_48.png'),     hotkeys: [':rage:', '(rage)'] },
  { key: 'right',    label: 'Right',    unicode: '👍', image: require('../assets/emoticons/default-pack/e_right_48.png'),    hotkeys: [':right:', '(y)', '(Y)', '(thumbsup)'] },
  { key: 'rofl',     label: 'Rofl',     unicode: '🤣', image: require('../assets/emoticons/default-pack/e_rofl_48.png'),     hotkeys: [':rofl:', '(rofl)', 'lol', 'LOL'] },
  { key: 'sad',      label: 'Sad',      unicode: '😞', image: require('../assets/emoticons/default-pack/e_sad_48.png'),      hotkeys: [':sad:', ':-(', ':(', '=('] },
  { key: 'shock',    label: 'Shock',    unicode: '😱', image: require('../assets/emoticons/default-pack/e_shock_48.png'),    hotkeys: [':shock:', ':-O', ':O', ':o', ':-o', '8-O', '8O'] },
  { key: 'sick',     label: 'Sick',     unicode: '🤒', image: require('../assets/emoticons/default-pack/e_sick_48.png'),     hotkeys: [':sick:', '(sick)'] },
  { key: 'star',     label: 'Star',     unicode: '⭐', image: require('../assets/emoticons/default-pack/e_star_48.png'),     hotkeys: [':star:', '(star)', '(*)'] },
  { key: 'stare',    label: 'Stare',    unicode: '👀', image: require('../assets/emoticons/default-pack/e_stare_48.png'),    hotkeys: [':stare:', '(stare)'] },
  { key: 'sun',      label: 'Sun',      unicode: '☀️',  image: require('../assets/emoticons/default-pack/e_sun_48.png'),     hotkeys: [':sun:', '(sun)'] },
  { key: 'urk',      label: 'Urk',      unicode: '😬', image: require('../assets/emoticons/default-pack/e_urk_48.png'),     hotkeys: [':urk:', '(urk)', ':-X', ':X'] },
  { key: 'wail',     label: 'Wail',     unicode: '😭', image: require('../assets/emoticons/default-pack/e_wail_48.png'),     hotkeys: [':wail:', "(:'()", 'T_T', 'TT', ';_;'] },
  { key: 'wink',     label: 'Wink',     unicode: '😉', image: require('../assets/emoticons/default-pack/e_wink_48.png'),     hotkeys: [':wink:', ';-)', ';)', ';]'] },
  // ONE (UNO) game card color emoticons — matches COLOR_EMOTICONS in server/modules/botservice/games/one/oneCard.ts
  { key: 'uno_blue',   label: 'Blue',   unicode: '🔵', image: require('../assets/card/one/uno/uno_blue.png'),   hotkeys: ['(uno_blue)'] },
  { key: 'uno_green',  label: 'Green',  unicode: '🟢', image: require('../assets/card/one/uno/uno_green.png'),  hotkeys: ['(uno_green)'] },
  { key: 'uno_red',    label: 'Red',    unicode: '🔴', image: require('../assets/card/one/uno/uno_red.png'),    hotkeys: ['(uno_red)'] },
  { key: 'uno_yellow', label: 'Yellow', unicode: '🟡', image: require('../assets/card/one/uno/uno_yellow.png'), hotkeys: ['(uno_yellow)'] },
  // Cricket game — matches emoticonKey in server/modules/botservice/games/cricket/deck.ts
  // Format: (g-crX) mirrors Kotlin Deck.kt Card enum emoticonKey
  // Run cards
  { key: 'cr1',         label: 'One Run',          unicode: '1️⃣',  image: require('../assets/card/cricket/cr1.png'),         hotkeys: ['(g-cr1)'] },
  { key: 'cr2',         label: 'Two Runs',          unicode: '2️⃣',  image: require('../assets/card/cricket/cr2.png'),         hotkeys: ['(g-cr2)'] },
  { key: 'cr3',         label: 'Three Runs',        unicode: '3️⃣',  image: require('../assets/card/cricket/cr3.png'),         hotkeys: ['(g-cr3)'] },
  { key: 'cr4',         label: 'Four Runs',         unicode: '4️⃣',  image: require('../assets/card/cricket/cr4.png'),         hotkeys: ['(g-cr4)'] },
  { key: 'cr6',         label: 'Six Runs',          unicode: '6️⃣',  image: require('../assets/card/cricket/cr6.png'),         hotkeys: ['(g-cr6)'] },
  // Out cards
  { key: 'crBowled',    label: 'Bowled',            unicode: '🎳',  image: require('../assets/card/cricket/crBowled.png'),    hotkeys: ['(g-crBowled)'] },
  { key: 'crStumped',   label: 'Stumped',           unicode: '🧤',  image: require('../assets/card/cricket/crStumped.png'),   hotkeys: ['(g-crStumped)'] },
  { key: 'crCatch',     label: 'Catch',             unicode: '🤲',  image: require('../assets/card/cricket/crCatch.png'),     hotkeys: ['(g-crCatch)'] },
  { key: 'crHitWicket', label: 'Hit Wicket',        unicode: '🏏',  image: require('../assets/card/cricket/crHitWicket.png'), hotkeys: ['(g-crHitWicket)'] },
  { key: 'crLBW',       label: 'Leg Before Wicket', unicode: '🦵',  image: require('../assets/card/cricket/crLBW.png'),       hotkeys: ['(g-crLBW)'] },
  // Special cards
  { key: 'crRunOut',      label: 'Run Out',      unicode: '🏃',  image: require('../assets/card/cricket/crRunOut.png'),      hotkeys: ['(g-crRunOut)'] },
  { key: 'crThirdUmpire', label: 'Third Umpire', unicode: '🧑‍⚖️', image: require('../assets/card/cricket/crThirdUmpire.png'), hotkeys: ['(g-crThirdUmpire)'] },

  // Tebak Hati game — matches symbols in server/modules/botservice/games/tebakhati/tebakhati.ts
  { key: 'th_suami',   label: 'Suami',   unicode: '🤵', image: require('../assets/card/TebakHati/suami.png'),   hotkeys: ['(suami)'] },
  { key: 'th_istri',   label: 'Istri',   unicode: '👰', image: require('../assets/card/TebakHati/istri.png'),   hotkeys: ['(istri)'] },
  { key: 'th_duda',    label: 'Duda',    unicode: '🧔', image: require('../assets/card/TebakHati/duda.png'),    hotkeys: ['(duda)'] },
  { key: 'th_janda',   label: 'Janda',   unicode: '💃', image: require('../assets/card/TebakHati/janda.png'),   hotkeys: ['(janda)'] },
  { key: 'th_binor',   label: 'Binor',   unicode: '🧕', image: require('../assets/card/TebakHati/binor.png'),   hotkeys: ['(binor)'] },
  { key: 'th_pelakor', label: 'Pelakor', unicode: '💄', image: require('../assets/card/TebakHati/pelakor.png'), hotkeys: ['(pelakor)'] },

  // Dice game — matches diceStr() in server/modules/botservice/games/dice/dice.ts
  { key: 'd1', label: 'Dice 1', unicode: '⚀', image: require('../assets/card/Dice/dice/d1.png'), hotkeys: ['(d1)'] },
  { key: 'd2', label: 'Dice 2', unicode: '⚁', image: require('../assets/card/Dice/dice/d2.png'), hotkeys: ['(d2)'] },
  { key: 'd3', label: 'Dice 3', unicode: '⚂', image: require('../assets/card/Dice/dice/d3.png'), hotkeys: ['(d3)'] },
  { key: 'd4', label: 'Dice 4', unicode: '⚃', image: require('../assets/card/Dice/dice/d4.png'), hotkeys: ['(d4)'] },
  { key: 'd5', label: 'Dice 5', unicode: '⚄', image: require('../assets/card/Dice/dice/d5.png'), hotkeys: ['(d5)'] },
  { key: 'd6', label: 'Dice 6', unicode: '⚅', image: require('../assets/card/Dice/dice/d6.png'), hotkeys: ['(d6)'] },
  // LowCard game — 52 card hotkeys matching Card.toEmoticonHotkey() in server/modules/botservice/games/common/card.ts
  { key: 'lc_2c', label: '2♣', unicode: '🂢', image: require('../assets/card/lowcard/lowcard/lc_2c.png'), hotkeys: ['(2C)'] },
  { key: 'lc_3c', label: '3♣', unicode: '🂣', image: require('../assets/card/lowcard/lowcard/lc_3c.png'), hotkeys: ['(3C)'] },
  { key: 'lc_4c', label: '4♣', unicode: '🂤', image: require('../assets/card/lowcard/lowcard/lc_4c.png'), hotkeys: ['(4C)'] },
  { key: 'lc_5c', label: '5♣', unicode: '🂥', image: require('../assets/card/lowcard/lowcard/lc_5c.png'), hotkeys: ['(5C)'] },
  { key: 'lc_6c', label: '6♣', unicode: '🂦', image: require('../assets/card/lowcard/lowcard/lc_6c.png'), hotkeys: ['(6C)'] },
  { key: 'lc_7c', label: '7♣', unicode: '🂧', image: require('../assets/card/lowcard/lowcard/lc_7c.png'), hotkeys: ['(7C)'] },
  { key: 'lc_8c', label: '8♣', unicode: '🂨', image: require('../assets/card/lowcard/lowcard/lc_8c.png'), hotkeys: ['(8C)'] },
  { key: 'lc_9c', label: '9♣', unicode: '🂩', image: require('../assets/card/lowcard/lowcard/lc_9c.png'), hotkeys: ['(9C)'] },
  { key: 'lc_tc', label: '10♣', unicode: '🂪', image: require('../assets/card/lowcard/lowcard/lc_tc.png'), hotkeys: ['(TC)'] },
  { key: 'lc_jc', label: 'J♣', unicode: '🂫', image: require('../assets/card/lowcard/lowcard/lc_jc.png'), hotkeys: ['(JC)'] },
  { key: 'lc_qc', label: 'Q♣', unicode: '🂭', image: require('../assets/card/lowcard/lowcard/lc_qc.png'), hotkeys: ['(QC)'] },
  { key: 'lc_kc', label: 'K♣', unicode: '🂮', image: require('../assets/card/lowcard/lowcard/lc_kc.png'), hotkeys: ['(KC)'] },
  { key: 'lc_ac', label: 'A♣', unicode: '🂡', image: require('../assets/card/lowcard/lowcard/lc_ac.png'), hotkeys: ['(AC)'] },
  { key: 'lc_2d', label: '2♦', unicode: '🃂', image: require('../assets/card/lowcard/lowcard/lc_2d.png'), hotkeys: ['(2D)'] },
  { key: 'lc_3d', label: '3♦', unicode: '🃃', image: require('../assets/card/lowcard/lowcard/lc_3d.png'), hotkeys: ['(3D)'] },
  { key: 'lc_4d', label: '4♦', unicode: '🃄', image: require('../assets/card/lowcard/lowcard/lc_4d.png'), hotkeys: ['(4D)'] },
  { key: 'lc_5d', label: '5♦', unicode: '🃅', image: require('../assets/card/lowcard/lowcard/lc_5d.png'), hotkeys: ['(5D)'] },
  { key: 'lc_6d', label: '6♦', unicode: '🃆', image: require('../assets/card/lowcard/lowcard/lc_6d.png'), hotkeys: ['(6D)'] },
  { key: 'lc_7d', label: '7♦', unicode: '🃇', image: require('../assets/card/lowcard/lowcard/lc_7d.png'), hotkeys: ['(7D)'] },
  { key: 'lc_8d', label: '8♦', unicode: '🃈', image: require('../assets/card/lowcard/lowcard/lc_8d.png'), hotkeys: ['(8D)'] },
  { key: 'lc_9d', label: '9♦', unicode: '🃉', image: require('../assets/card/lowcard/lowcard/lc_9d.png'), hotkeys: ['(9D)'] },
  { key: 'lc_td', label: '10♦', unicode: '🃊', image: require('../assets/card/lowcard/lowcard/lc_td.png'), hotkeys: ['(TD)'] },
  { key: 'lc_jd', label: 'J♦', unicode: '🃋', image: require('../assets/card/lowcard/lowcard/lc_jd.png'), hotkeys: ['(JD)'] },
  { key: 'lc_qd', label: 'Q♦', unicode: '🃍', image: require('../assets/card/lowcard/lowcard/lc_qd.png'), hotkeys: ['(QD)'] },
  { key: 'lc_kd', label: 'K♦', unicode: '🃎', image: require('../assets/card/lowcard/lowcard/lc_kd.png'), hotkeys: ['(KD)'] },
  { key: 'lc_ad', label: 'A♦', unicode: '🃁', image: require('../assets/card/lowcard/lowcard/lc_ad.png'), hotkeys: ['(AD)'] },
  { key: 'lc_2h', label: '2♥', unicode: '🂲', image: require('../assets/card/lowcard/lowcard/lc_2h.png'), hotkeys: ['(2H)'] },
  { key: 'lc_3h', label: '3♥', unicode: '🂳', image: require('../assets/card/lowcard/lowcard/lc_3h.png'), hotkeys: ['(3H)'] },
  { key: 'lc_4h', label: '4♥', unicode: '🂴', image: require('../assets/card/lowcard/lowcard/lc_4h.png'), hotkeys: ['(4H)'] },
  { key: 'lc_5h', label: '5♥', unicode: '🂵', image: require('../assets/card/lowcard/lowcard/lc_5h.png'), hotkeys: ['(5H)'] },
  { key: 'lc_6h', label: '6♥', unicode: '🂶', image: require('../assets/card/lowcard/lowcard/lc_6h.png'), hotkeys: ['(6H)'] },
  { key: 'lc_7h', label: '7♥', unicode: '🂷', image: require('../assets/card/lowcard/lowcard/lc_7h.png'), hotkeys: ['(7H)'] },
  { key: 'lc_8h', label: '8♥', unicode: '🂸', image: require('../assets/card/lowcard/lowcard/lc_8h.png'), hotkeys: ['(8H)'] },
  { key: 'lc_9h', label: '9♥', unicode: '🂹', image: require('../assets/card/lowcard/lowcard/lc_9h.png'), hotkeys: ['(9H)'] },
  { key: 'lc_th', label: '10♥', unicode: '🂺', image: require('../assets/card/lowcard/lowcard/lc_th.png'), hotkeys: ['(TH)'] },
  { key: 'lc_jh', label: 'J♥', unicode: '🂻', image: require('../assets/card/lowcard/lowcard/lc_jh.png'), hotkeys: ['(JH)'] },
  { key: 'lc_qh', label: 'Q♥', unicode: '🂽', image: require('../assets/card/lowcard/lowcard/lc_qh.png'), hotkeys: ['(QH)'] },
  { key: 'lc_kh', label: 'K♥', unicode: '🂾', image: require('../assets/card/lowcard/lowcard/lc_kh.png'), hotkeys: ['(KH)'] },
  { key: 'lc_ah', label: 'A♥', unicode: '🂱', image: require('../assets/card/lowcard/lowcard/lc_ah.png'), hotkeys: ['(AH)'] },
  { key: 'lc_2s', label: '2♠', unicode: '🂢', image: require('../assets/card/lowcard/lowcard/lc_2s.png'), hotkeys: ['(2S)'] },
  { key: 'lc_3s', label: '3♠', unicode: '🂣', image: require('../assets/card/lowcard/lowcard/lc_3s.png'), hotkeys: ['(3S)'] },
  { key: 'lc_4s', label: '4♠', unicode: '🂤', image: require('../assets/card/lowcard/lowcard/lc_4s.png'), hotkeys: ['(4S)'] },
  { key: 'lc_5s', label: '5♠', unicode: '🂥', image: require('../assets/card/lowcard/lowcard/lc_5s.png'), hotkeys: ['(5S)'] },
  { key: 'lc_6s', label: '6♠', unicode: '🂦', image: require('../assets/card/lowcard/lowcard/lc_6s.png'), hotkeys: ['(6S)'] },
  { key: 'lc_7s', label: '7♠', unicode: '🂧', image: require('../assets/card/lowcard/lowcard/lc_7s.png'), hotkeys: ['(7S)'] },
  { key: 'lc_8s', label: '8♠', unicode: '🂨', image: require('../assets/card/lowcard/lowcard/lc_8s.png'), hotkeys: ['(8S)'] },
  { key: 'lc_9s', label: '9♠', unicode: '🂩', image: require('../assets/card/lowcard/lowcard/lc_9s.png'), hotkeys: ['(9S)'] },
  { key: 'lc_ts', label: '10♠', unicode: '🂪', image: require('../assets/card/lowcard/lowcard/lc_ts.png'), hotkeys: ['(TS)'] },
  { key: 'lc_js', label: 'J♠', unicode: '🂫', image: require('../assets/card/lowcard/lowcard/lc_js.png'), hotkeys: ['(JS)'] },
  { key: 'lc_qs', label: 'Q♠', unicode: '🂭', image: require('../assets/card/lowcard/lowcard/lc_qs.png'), hotkeys: ['(QS)'] },
  { key: 'lc_ks', label: 'K♠', unicode: '🂮', image: require('../assets/card/lowcard/lowcard/lc_ks.png'), hotkeys: ['(KS)'] },
  { key: 'lc_as', label: 'A♠', unicode: '🂡', image: require('../assets/card/lowcard/lowcard/lc_as.png'), hotkeys: ['(AS)'] },
];

export const EMOTICON_MAP: Record<string, string> = EMOTICONS.reduce<Record<string, string>>(
  (acc, e) => { acc[`:${e.key}:`] = e.unicode; return acc; },
  {}
);

export const UNICODE_TO_EMOTICON: Record<string, Emoticon> = EMOTICONS.reduce<Record<string, Emoticon>>(
  (acc, e) => { acc[e.unicode] = e; return acc; },
  {}
);

export type ParsedSegment =
  | { type: 'text'; content: string }
  | { type: 'emote'; image: ReturnType<typeof require>; label: string; key: string };

const _HOTKEY_TO_EMOTICON: Record<string, Emoticon> = {};
for (const e of [...EMOTICONS, ...EXTRA_EMOTICONS]) {
  for (const hk of e.hotkeys) {
    _HOTKEY_TO_EMOTICON[hk] = e;
  }
  // Also match the bare unicode character so messages sent with unicode render as images
  if (e.unicode) {
    _HOTKEY_TO_EMOTICON[e.unicode] = e;
  }
}

const _SORTED_HOTKEYS = Object.keys(_HOTKEY_TO_EMOTICON).sort((a, b) => b.length - a.length);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const _HOTKEY_REGEX = new RegExp(
  _SORTED_HOTKEYS.map(escapeRegex).join('|'),
  'g'
);

export function parseMessageWithEmoticons(text: string): ParsedSegment[] {
  if (!text) return [];
  const segments: ParsedSegment[] = [];
  let lastIndex = 0;
  const regex = new RegExp(_HOTKEY_REGEX.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const matchedHotkey = match[0];
    const emoticon = _HOTKEY_TO_EMOTICON[matchedHotkey];
    if (!emoticon) continue;

    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'emote', image: emoticon.image, label: emoticon.label, key: emoticon.key });
    lastIndex = match.index + matchedHotkey.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: 'text', content: text }];
}

export const STICKER_PACKS: StickerPack[] = [
  {
    id: 'chalk',
    name: 'Chalk',
    coverImage: require('../assets/emoticons/stickers/chalk/love_400x240.png'),
    stickers: [
      { key: 'chalk_brb',    label: 'BRB',    image: require('../assets/emoticons/stickers/chalk/brb_400x240.png') },
      { key: 'chalk_eat',    label: 'Eat',    image: require('../assets/emoticons/stickers/chalk/eat_400x240.png') },
      { key: 'chalk_fight',  label: 'Fight',  image: require('../assets/emoticons/stickers/chalk/fight_400x240.png') },
      { key: 'chalk_fist',   label: 'Fist',   image: require('../assets/emoticons/stickers/chalk/fist_400x240.png') },
      { key: 'chalk_great',  label: 'Great',  image: require('../assets/emoticons/stickers/chalk/great_400x240.png') },
      { key: 'chalk_hbd',    label: 'HBD',    image: require('../assets/emoticons/stickers/chalk/hbd_400x240.png') },
      { key: 'chalk_iluvu',  label: 'I Luvu', image: require('../assets/emoticons/stickers/chalk/iluvu_400x240.png') },
      { key: 'chalk_jump',   label: 'Jump',   image: require('../assets/emoticons/stickers/chalk/jump_400x240.png') },
      { key: 'chalk_love',   label: 'Love',   image: require('../assets/emoticons/stickers/chalk/love_400x240.png') },
      { key: 'chalk_poo',    label: 'Poo',    image: require('../assets/emoticons/stickers/chalk/poo_400x240.png') },
      { key: 'chalk_rainy',  label: 'Rainy',  image: require('../assets/emoticons/stickers/chalk/rainy_400x240.png') },
      { key: 'chalk_snail',  label: 'Snail',  image: require('../assets/emoticons/stickers/chalk/snail_400x240.png') },
      { key: 'chalk_toilet', label: 'Toilet', image: require('../assets/emoticons/stickers/chalk/toilet_400x240.png') },
      { key: 'chalk_woow',   label: 'Woow',   image: require('../assets/emoticons/stickers/chalk/woow_400x240.png') },
      { key: 'chalk_yaay',   label: 'Yaay',   image: require('../assets/emoticons/stickers/chalk/yaay_400x240.png') },
    ],
  },
  {
    id: 'coolgreybot',
    name: 'Greybot',
    coverImage: require('../assets/emoticons/stickers/coolgreybot/01_400x240.png'),
    stickers: [
      { key: 'cgb_01', label: '1',  image: require('../assets/emoticons/stickers/coolgreybot/01_400x240.png') },
      { key: 'cgb_02', label: '2',  image: require('../assets/emoticons/stickers/coolgreybot/02_400x240.png') },
      { key: 'cgb_03', label: '3',  image: require('../assets/emoticons/stickers/coolgreybot/03_400x240.png') },
      { key: 'cgb_04', label: '4',  image: require('../assets/emoticons/stickers/coolgreybot/04_400x240.png') },
      { key: 'cgb_05', label: '5',  image: require('../assets/emoticons/stickers/coolgreybot/05_400x240.png') },
      { key: 'cgb_06', label: '6',  image: require('../assets/emoticons/stickers/coolgreybot/06_400x240.png') },
      { key: 'cgb_07', label: '7',  image: require('../assets/emoticons/stickers/coolgreybot/07_400x240.png') },
      { key: 'cgb_08', label: '8',  image: require('../assets/emoticons/stickers/coolgreybot/08_400x240.png') },
      { key: 'cgb_09', label: '9',  image: require('../assets/emoticons/stickers/coolgreybot/09_400x240.png') },
      { key: 'cgb_10', label: '10', image: require('../assets/emoticons/stickers/coolgreybot/10_400x240.png') },
      { key: 'cgb_11', label: '11', image: require('../assets/emoticons/stickers/coolgreybot/11_400x240.png') },
      { key: 'cgb_12', label: '12', image: require('../assets/emoticons/stickers/coolgreybot/12_400x240.png') },
      { key: 'cgb_13', label: '13', image: require('../assets/emoticons/stickers/coolgreybot/13_400x240.png') },
      { key: 'cgb_14', label: '14', image: require('../assets/emoticons/stickers/coolgreybot/14_400x240.png') },
      { key: 'cgb_15', label: '15', image: require('../assets/emoticons/stickers/coolgreybot/15_400x240.png') },
    ],
  },
  {
    id: 'fruits',
    name: 'Fruits',
    coverImage: require('../assets/emoticons/stickers/fruits/apple_400x240.png'),
    stickers: [
      { key: 'fr_apple',         label: 'Apple',          image: require('../assets/emoticons/stickers/fruits/apple_400x240.png') },
      { key: 'fr_apple_bite',    label: 'Apple Bite',     image: require('../assets/emoticons/stickers/fruits/apple-bite_400x240.png') },
      { key: 'fr_apple_worm',    label: 'Apple Worm',     image: require('../assets/emoticons/stickers/fruits/apple-worm_400x240.png') },
      { key: 'fr_banana_fr',     label: 'Banana Friends', image: require('../assets/emoticons/stickers/fruits/banana-friends_400x240.png') },
      { key: 'fr_banana_happy',  label: 'Banana Happy',   image: require('../assets/emoticons/stickers/fruits/banana-happy_400x240.png') },
      { key: 'fr_banana_kiss',   label: 'Banana Kiss',    image: require('../assets/emoticons/stickers/fruits/banana-kiss_400x240.png') },
      { key: 'fr_orange',        label: 'Orange',         image: require('../assets/emoticons/stickers/fruits/orange_400x240.png') },
      { key: 'fr_orange_cry',    label: 'Orange Cry',     image: require('../assets/emoticons/stickers/fruits/orange-cry_400x240.png') },
      { key: 'fr_orange_knife',  label: 'Orange Knife',   image: require('../assets/emoticons/stickers/fruits/orange-knife_400x240.png') },
      { key: 'fr_pear',          label: 'Pear',           image: require('../assets/emoticons/stickers/fruits/pear_400x240.png') },
      { key: 'fr_pear_tired',    label: 'Pear Tired',     image: require('../assets/emoticons/stickers/fruits/pear-tired_400x240.png') },
      { key: 'fr_pear_tongue',   label: 'Pear Tongue',    image: require('../assets/emoticons/stickers/fruits/pear-tongue_400x240.png') },
      { key: 'fr_watermelon',    label: 'Watermelon',     image: require('../assets/emoticons/stickers/fruits/watermelon_400x240.png') },
      { key: 'fr_wm_angry',      label: 'WM Angry',       image: require('../assets/emoticons/stickers/fruits/watermelon-angry_400x240.png') },
      { key: 'fr_wm_shocked',    label: 'WM Shocked',     image: require('../assets/emoticons/stickers/fruits/watermelon-shocked_400x240.png') },
    ],
  },
  {
    id: 'migpal',
    name: 'Migpal',
    coverImage: require('../assets/emoticons/stickers/migpal/l01_400x240.png'),
    stickers: [
      { key: 'mp_l01', label: '1',  image: require('../assets/emoticons/stickers/migpal/l01_400x240.png') },
      { key: 'mp_l02', label: '2',  image: require('../assets/emoticons/stickers/migpal/l02_400x240.png') },
      { key: 'mp_l03', label: '3',  image: require('../assets/emoticons/stickers/migpal/l03_400x240.png') },
      { key: 'mp_l04', label: '4',  image: require('../assets/emoticons/stickers/migpal/l04_400x240.png') },
      { key: 'mp_l05', label: '5',  image: require('../assets/emoticons/stickers/migpal/l05_400x240.png') },
      { key: 'mp_l06', label: '6',  image: require('../assets/emoticons/stickers/migpal/l06_400x240.png') },
      { key: 'mp_l07', label: '7',  image: require('../assets/emoticons/stickers/migpal/l07_400x240.png') },
      { key: 'mp_l08', label: '8',  image: require('../assets/emoticons/stickers/migpal/l08_400x240.png') },
      { key: 'mp_l09', label: '9',  image: require('../assets/emoticons/stickers/migpal/l09_400x240.png') },
      { key: 'mp_l10', label: '10', image: require('../assets/emoticons/stickers/migpal/l10_400x240.png') },
      { key: 'mp_l11', label: '11', image: require('../assets/emoticons/stickers/migpal/l11_400x240.png') },
      { key: 'mp_l12', label: '12', image: require('../assets/emoticons/stickers/migpal/l12_400x240.png') },
      { key: 'mp_l13', label: '13', image: require('../assets/emoticons/stickers/migpal/l13_400x240.png') },
      { key: 'mp_l14', label: '14', image: require('../assets/emoticons/stickers/migpal/l14_400x240.png') },
      { key: 'mp_l15', label: '15', image: require('../assets/emoticons/stickers/migpal/l15_400x240.png') },
    ],
  },
  {
    id: 'migplay',
    name: 'Migplay',
    coverImage: require('../assets/emoticons/stickers/migplay/migplay01_400x240.png'),
    stickers: [
      { key: 'mplay_01', label: '1',  image: require('../assets/emoticons/stickers/migplay/migplay01_400x240.png') },
      { key: 'mplay_02', label: '2',  image: require('../assets/emoticons/stickers/migplay/migplay02_400x240.png') },
      { key: 'mplay_03', label: '3',  image: require('../assets/emoticons/stickers/migplay/migplay03_400x240.png') },
      { key: 'mplay_04', label: '4',  image: require('../assets/emoticons/stickers/migplay/migplay04_400x240.png') },
      { key: 'mplay_05', label: '5',  image: require('../assets/emoticons/stickers/migplay/migplay05_400x240.png') },
      { key: 'mplay_06', label: '6',  image: require('../assets/emoticons/stickers/migplay/migplay06_400x240.png') },
      { key: 'mplay_07', label: '7',  image: require('../assets/emoticons/stickers/migplay/migplay07_400x240.png') },
      { key: 'mplay_08', label: '8',  image: require('../assets/emoticons/stickers/migplay/migplay08_400x240.png') },
      { key: 'mplay_09', label: '9',  image: require('../assets/emoticons/stickers/migplay/migplay09_400x240.png') },
      { key: 'mplay_10', label: '10', image: require('../assets/emoticons/stickers/migplay/migplay10_400x240.png') },
      { key: 'mplay_11', label: '11', image: require('../assets/emoticons/stickers/migplay/migplay11_400x240.png') },
      { key: 'mplay_12', label: '12', image: require('../assets/emoticons/stickers/migplay/migplay12_400x240.png') },
      { key: 'mplay_13', label: '13', image: require('../assets/emoticons/stickers/migplay/migplay13_400x240.png') },
      { key: 'mplay_14', label: '14', image: require('../assets/emoticons/stickers/migplay/migplay14_400x240.png') },
      { key: 'mplay_15', label: '15', image: require('../assets/emoticons/stickers/migplay/migplay15_400x240.png') },
    ],
  },
  {
    id: 'pinkbot',
    name: 'Pinkbot',
    coverImage: require('../assets/emoticons/stickers/pinkbot/pinkbot-inlove_400x240.png'),
    stickers: [
      { key: 'pb_blowkiss',   label: 'Blow Kiss',  image: require('../assets/emoticons/stickers/pinkbot/pinkbot-blowkiss_400x240.png') },
      { key: 'pb_coffee',     label: 'Coffee',     image: require('../assets/emoticons/stickers/pinkbot/pinkbot-coffee_400x240.png') },
      { key: 'pb_cry',        label: 'Cry',        image: require('../assets/emoticons/stickers/pinkbot/pinkbot-cry_400x240.png') },
      { key: 'pb_evilplan',   label: 'Evil Plan',  image: require('../assets/emoticons/stickers/pinkbot/pinkbot-evilplan_400x240.png') },
      { key: 'pb_inlove',     label: 'In Love',    image: require('../assets/emoticons/stickers/pinkbot/pinkbot-inlove_400x240.png') },
      { key: 'pb_jealous',    label: 'Jealous',    image: require('../assets/emoticons/stickers/pinkbot/pinkbot-jealous_400x240.png') },
      { key: 'pb_puke',       label: 'Puke',       image: require('../assets/emoticons/stickers/pinkbot/pinkbot-puke_400x240.png') },
      { key: 'pb_rage',       label: 'Rage',       image: require('../assets/emoticons/stickers/pinkbot/pinkbot-rage_400x240.png') },
      { key: 'pb_scared',     label: 'Scared',     image: require('../assets/emoticons/stickers/pinkbot/pinkbot-scared_400x240.png') },
      { key: 'pb_shocked',    label: 'Shocked',    image: require('../assets/emoticons/stickers/pinkbot/pinkbot-shocked_400x240.png') },
      { key: 'pb_sleep',      label: 'Sleep',      image: require('../assets/emoticons/stickers/pinkbot/pinkbot-sleep_400x240.png') },
      { key: 'pb_speechless', label: 'Speechless', image: require('../assets/emoticons/stickers/pinkbot/pinkbot-speechless_400x240.png') },
      { key: 'pb_stressed',   label: 'Stressed',   image: require('../assets/emoticons/stickers/pinkbot/pinkbot-stressed_400x240.png') },
      { key: 'pb_tired',      label: 'Tired',      image: require('../assets/emoticons/stickers/pinkbot/pinkbot-tired_400x240.png') },
      { key: 'pb_umm',        label: 'Umm',        image: require('../assets/emoticons/stickers/pinkbot/pinkbot-umm_400x240.png') },
    ],
  },
];

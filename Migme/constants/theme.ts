/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

/**
 * User role colors — sourced from com/projectgoth/fusion:
 *
 * MessageData.SourceTypeEnum (MessageData.java):
 *   USER(1, Integer.MIN_VALUE)           → #2196F3  default blue
 *   GROUP_ADMIN_USER(3, 16565508)        → #FCC504  golden yellow
 *   MODERATOR_USER(4, 16565508)          → #FCC504  golden yellow
 *   TOP_MERCHANT_LVL1(12, 0x990099)     → #990099  purple
 *   TOP_MERCHANT_LVL2(13, 16723623)     → #FF2EA7  hot pink
 *   TOP_MERCHANT_LVL3(15, 0xFF0000)     → #FF0000  red
 *   GLOBAL_ADMIN(17, 16020514)          → #F47422  orange
 *
 * MerchantDetailsData.UserNameColorTypeEnum (MerchantDetailsData.java):
 *   DEFAULT(0) → TOP_MERCHANT_LVL1      → #990099  purple
 *   PINK(2)    → TOP_MERCHANT_LVL2      → #FF2EA7  hot pink
 *   RED(1)     → TOP_MERCHANT_LVL3      → #FF0000  red
 *
 * ChatRoomParticipant.getMessageSourceColorOverride():
 *   isGlobalAdmin()          → GLOBAL_ADMIN.colorHex()    → #F47422
 *   isModerator()            → MODERATOR_USER.colorHex()  → #FCC504
 *   isRoomOwner()/isGroupAdmin()/isGroupMod() → GROUP_ADMIN_USER.colorHex() → #FCC504
 *   isTopMerchant()          → usernameColorType.hex()    → #990099 / #FF2EA7 / #FF0000
 *   regular user             → null (user-chosen color)   → #2196F3 default
 *
 * Mentor = MERCHANT_MENTOR label — shares merchant color system (#990099 default).
 */
export const UserRoleColors = {
  /** Regular user — default blue, user may freely change via SET_COLOR */
  USER: '#2196F3',

  /** Global Administrator — orange, mirrors GLOBAL_ADMIN.colorHex() = 0xF47422 */
  ADMINISTRATOR: '#F47422',

  /** Merchant (Top Merchant LVL1 / default) — purple, mirrors TOP_MERCHANT_LVL1 = 0x990099 */
  MERCHANT: '#990099',

  /** Merchant Pink (Top Merchant LVL2) — hot pink, mirrors TOP_MERCHANT_LVL2 = 0xFF2EA7 */
  MERCHANT_PINK: '#FF2EA7',

  /** Merchant Red (Top Merchant LVL3) — red, mirrors TOP_MERCHANT_LVL3 = 0xFF0000 */
  MERCHANT_RED: '#FF0000',

  /**
   * Mentor (Merchant Mentor label) — purple, same as Merchant default.
   * In Java: MerchantDetailsData.isMerchantMentor() checks mentor === "mentor".
   * Mentor uses the same merchant color system; default maps to TOP_MERCHANT_LVL1.
   */
  MENTOR: '#990099',

  /** Moderator — golden yellow, mirrors MODERATOR_USER.colorHex() = 0xFCC504 */
  MODERATOR: '#FCC504',

  /**
   * Room Owner — golden yellow, mirrors GROUP_ADMIN_USER.colorHex() = 0xFCC504.
   * In ChatRoomParticipant.java: isRoomOwner() falls to GROUP_ADMIN_USER branch.
   */
  OWNER_ROOM: '#FCC504',
} as const;

export type UserRoleColorKey = keyof typeof UserRoleColors;

/**
 * Color palette sourced from androidV4/src/main/java/com/projectgoth/common/ColorPalette.java
 * Original Java format: 0xAARRGGBB — converted here to CSS hex (#RRGGBB).
 *
 * @author cherryv (original), ported to TypeScript
 */
export const ColorPalette = {
  /** Pure white text */
  TEXT_LIGHT: '#FFFFFF',

  /** Near-black dark text */
  TEXT_DARK: '#383838',

  /** Light gray text */
  TEXT_LIGHT_GRAY: '#666666',

  /** Warm light brown text */
  TEXT_LIGHT_BROWN: '#918278',

  /** Medium gray text */
  TEXT_GREY: '#999999',

  /** White text (alias of TEXT_LIGHT) */
  TEXT_WHITE: '#FFFFFF',

  /** Light gray background */
  BG_LIGHT_GREY: '#EDEDED',

  /** White background */
  BG_WHITE: '#FFFFFF',

  /** Warm beige background */
  BG_BEIGE: '#F8F4EA',

  /** Turquoise / teal background */
  BG_TURQUOISE: '#63B89F',

  /** Sandy divider */
  DIVIDER_SAND: '#EFDCBD',

  /** Light sandy divider */
  DIVIDER_SAND_LIGHT: '#EEE3D2',

  /** Gray separator */
  SEPARATOR_GRAY: '#B9B1AB',

  /** Light beige background */
  BG_LIGHT_BEIGE: '#EEE9CC',

  /** Orange background / accent */
  BG_ORANGE: '#F59528',

  /** Gray background */
  BG_GRAY: '#CCCCCC',
} as const;

export type ColorPaletteKey = keyof typeof ColorPalette;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

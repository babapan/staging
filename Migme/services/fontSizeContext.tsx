import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const FONT_SIZE_KEY = 'mig_font_size';

export type FontSizeLevel = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface FontSizeOption {
  level: FontSizeLevel;
  label: string;
  base: number;
  multiplier: number;
}

export const FONT_SIZE_OPTIONS: FontSizeOption[] = [
  { level: 'xs', label: 'XS', base: 11, multiplier: 0.80 },
  { level: 'sm', label: 'S',  base: 12, multiplier: 0.90 },
  { level: 'md', label: 'M',  base: 14, multiplier: 1.00 },
  { level: 'lg', label: 'L',  base: 16, multiplier: 1.15 },
  { level: 'xl', label: 'XL', base: 18, multiplier: 1.30 },
];

export const DEFAULT_FONT_LEVEL: FontSizeLevel = 'md';

interface FontSizeContextValue {
  fontLevel: FontSizeLevel;
  fontMultiplier: number;
  fontBase: number;
  setFontLevel: (level: FontSizeLevel) => Promise<void>;
  fs: (size: number) => number;
}

const DEFAULT_OPTION = FONT_SIZE_OPTIONS.find(o => o.level === DEFAULT_FONT_LEVEL)!;

const FontSizeContext = createContext<FontSizeContextValue>({
  fontLevel:      DEFAULT_FONT_LEVEL,
  fontMultiplier: DEFAULT_OPTION.multiplier,
  fontBase:       DEFAULT_OPTION.base,
  setFontLevel:   async () => {},
  fs:             (size) => size,
});

export function FontSizeProvider({ children }: { children: React.ReactNode }) {
  const [fontLevel, setFontLevelState] = useState<FontSizeLevel>(DEFAULT_FONT_LEVEL);

  useEffect(() => {
    AsyncStorage.getItem(FONT_SIZE_KEY).then(saved => {
      if (saved && FONT_SIZE_OPTIONS.some(o => o.level === saved)) {
        setFontLevelState(saved as FontSizeLevel);
      }
    });
  }, []);

  const setFontLevel = useCallback(async (level: FontSizeLevel) => {
    await AsyncStorage.setItem(FONT_SIZE_KEY, level);
    setFontLevelState(level);
  }, []);

  const option = FONT_SIZE_OPTIONS.find(o => o.level === fontLevel) ?? DEFAULT_OPTION;

  const fs = useCallback((size: number) => Math.round(size * option.multiplier), [option.multiplier]);

  return (
    <FontSizeContext.Provider value={{
      fontLevel,
      fontMultiplier: option.multiplier,
      fontBase:       option.base,
      setFontLevel,
      fs,
    }}>
      {children}
    </FontSizeContext.Provider>
  );
}

export function useFontSize(): FontSizeContextValue {
  return useContext(FontSizeContext);
}

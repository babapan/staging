/**
 * languageContext.tsx
 *
 * Global app language system.
 * Stores the selected language code (en, id, ms, th, zh, ar, hi) in
 * AsyncStorage and exposes it reactively to the entire component tree
 * via React Context, so changing the language in Settings takes effect
 * immediately across the app — no app reload required.
 *
 * Usage:
 *   const { language, setLanguage, t } = useLanguage();
 *   <Text>{t('settings.language')}</Text>
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const LANG_STORAGE_KEY = 'mig_selected_language';
export const DEFAULT_LANGUAGE = 'en';

export type LanguageCode = 'en' | 'id' | 'ms' | 'th' | 'zh' | 'ar' | 'hi';

export const SUPPORTED_LANGUAGES: { id: LanguageCode; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'id', name: 'Bahasa Indonesia' },
  { id: 'ms', name: 'Bahasa Melayu' },
  { id: 'th', name: 'ภาษาไทย' },
  { id: 'zh', name: '中文' },
  { id: 'ar', name: 'العربية' },
  { id: 'hi', name: 'हिन्दी' },
];

type Dict = Record<string, string>;

const TRANSLATIONS: Record<LanguageCode, Dict> = {
  en: {
    'settings.title': 'Settings',
    'settings.system': 'System',
    'settings.language': 'Language',
    'settings.account': 'Account',
    'settings.notifications': 'Notifications',
    'settings.chatTheme': 'Chat Theme',
    'settings.editProfile': 'Edit Profile',
    'settings.changeAvatar': 'Change Avatar',
    'settings.aboutMig': 'About Mig',
    'settings.application': 'Application',
    'settings.merchant': 'Merchant',
    'settings.logout': 'Logout',
    'settings.back': 'Back',
    'settings.save': 'Save',
    'settings.cancel': 'Cancel',
    'settings.done': 'Done',
    'common.loading': 'Loading...',
  },
  id: {
    'settings.title': 'Pengaturan',
    'settings.system': 'Sistem',
    'settings.language': 'Bahasa',
    'settings.account': 'Akun',
    'settings.notifications': 'Notifikasi',
    'settings.chatTheme': 'Tema Chat',
    'settings.editProfile': 'Edit Profil',
    'settings.changeAvatar': 'Ganti Avatar',
    'settings.aboutMig': 'Tentang Mig',
    'settings.application': 'Aplikasi',
    'settings.merchant': 'Merchant',
    'settings.logout': 'Keluar',
    'settings.back': 'Kembali',
    'settings.save': 'Simpan',
    'settings.cancel': 'Batal',
    'settings.done': 'Selesai',
    'common.loading': 'Memuat...',
  },
  ms: {
    'settings.title': 'Tetapan',
    'settings.system': 'Sistem',
    'settings.language': 'Bahasa',
    'settings.account': 'Akaun',
    'settings.notifications': 'Pemberitahuan',
    'settings.chatTheme': 'Tema Sembang',
    'settings.editProfile': 'Edit Profil',
    'settings.changeAvatar': 'Tukar Avatar',
    'settings.aboutMig': 'Mengenai Mig',
    'settings.application': 'Aplikasi',
    'settings.merchant': 'Peniaga',
    'settings.logout': 'Log Keluar',
    'settings.back': 'Kembali',
    'settings.save': 'Simpan',
    'settings.cancel': 'Batal',
    'settings.done': 'Selesai',
    'common.loading': 'Memuat...',
  },
  th: {
    'settings.title': 'การตั้งค่า',
    'settings.system': 'ระบบ',
    'settings.language': 'ภาษา',
    'settings.account': 'บัญชี',
    'settings.notifications': 'การแจ้งเตือน',
    'settings.chatTheme': 'ธีมแชท',
    'settings.editProfile': 'แก้ไขโปรไฟล์',
    'settings.changeAvatar': 'เปลี่ยนอวตาร',
    'settings.aboutMig': 'เกี่ยวกับ Mig',
    'settings.application': 'แอปพลิเคชัน',
    'settings.merchant': 'ผู้ขาย',
    'settings.logout': 'ออกจากระบบ',
    'settings.back': 'กลับ',
    'settings.save': 'บันทึก',
    'settings.cancel': 'ยกเลิก',
    'settings.done': 'เสร็จ',
    'common.loading': 'กำลังโหลด...',
  },
  zh: {
    'settings.title': '设置',
    'settings.system': '系统',
    'settings.language': '语言',
    'settings.account': '账户',
    'settings.notifications': '通知',
    'settings.chatTheme': '聊天主题',
    'settings.editProfile': '编辑资料',
    'settings.changeAvatar': '更换头像',
    'settings.aboutMig': '关于 Mig',
    'settings.application': '应用程序',
    'settings.merchant': '商户',
    'settings.logout': '登出',
    'settings.back': '返回',
    'settings.save': '保存',
    'settings.cancel': '取消',
    'settings.done': '完成',
    'common.loading': '加载中...',
  },
  ar: {
    'settings.title': 'الإعدادات',
    'settings.system': 'النظام',
    'settings.language': 'اللغة',
    'settings.account': 'الحساب',
    'settings.notifications': 'الإشعارات',
    'settings.chatTheme': 'سمة الدردشة',
    'settings.editProfile': 'تعديل الملف الشخصي',
    'settings.changeAvatar': 'تغيير الصورة الرمزية',
    'settings.aboutMig': 'حول Mig',
    'settings.application': 'التطبيق',
    'settings.merchant': 'التاجر',
    'settings.logout': 'تسجيل الخروج',
    'settings.back': 'رجوع',
    'settings.save': 'حفظ',
    'settings.cancel': 'إلغاء',
    'settings.done': 'تم',
    'common.loading': 'جار التحميل...',
  },
  hi: {
    'settings.title': 'सेटिंग्स',
    'settings.system': 'सिस्टम',
    'settings.language': 'भाषा',
    'settings.account': 'खाता',
    'settings.notifications': 'सूचनाएं',
    'settings.chatTheme': 'चैट थीम',
    'settings.editProfile': 'प्रोफ़ाइल संपादित करें',
    'settings.changeAvatar': 'अवतार बदलें',
    'settings.aboutMig': 'Mig के बारे में',
    'settings.application': 'एप्लिकेशन',
    'settings.merchant': 'व्यापारी',
    'settings.logout': 'लॉग आउट',
    'settings.back': 'वापस',
    'settings.save': 'सहेजें',
    'settings.cancel': 'रद्द करें',
    'settings.done': 'पूर्ण',
    'common.loading': 'लोड हो रहा है...',
  },
};

interface LanguageContextValue {
  language: LanguageCode;
  setLanguage: (code: LanguageCode) => Promise<void>;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: DEFAULT_LANGUAGE,
  setLanguage: async () => {},
  t: (k: string) => k,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(DEFAULT_LANGUAGE);

  useEffect(() => {
    AsyncStorage.getItem(LANG_STORAGE_KEY).then(saved => {
      if (saved && TRANSLATIONS[saved as LanguageCode]) {
        setLanguageState(saved as LanguageCode);
      }
    });
  }, []);

  const setLanguage = useCallback(async (code: LanguageCode) => {
    await AsyncStorage.setItem(LANG_STORAGE_KEY, code);
    setLanguageState(code);
  }, []);

  const t = useCallback((key: string) => {
    return TRANSLATIONS[language]?.[key] ?? TRANSLATIONS.en[key] ?? key;
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}

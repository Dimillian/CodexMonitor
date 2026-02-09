import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import enTranslation from './locales/en/translation.json';
import zhTranslation from './locales/zh/translation.json';

export const defaultNS = 'translation';
export const resources = {
  en: {
    [defaultNS]: enTranslation,
  },
  zh: {
    [defaultNS]: zhTranslation,
  },
} as const;

export type Locale = keyof typeof resources;

export const supportedLocales: { value: Locale; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: '中文' },
];

i18next
  .use(initReactI18next)
  .init({
    resources,
    ns: [defaultNS],
    defaultNS,
    fallbackLng: 'en',
    supportedLngs: Object.keys(resources),
    lng: 'en',
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

export default i18next;

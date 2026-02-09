import { useState, useEffect } from 'react';
import i18next from '../config';
import { Locale } from '../config';

export function useLocale() {
  const [currentLocale, setCurrentLocale] = useState<Locale>(i18next.language as Locale);

  useEffect(() => {
    const handleLanguageChange = (lng: string) => {
      setCurrentLocale(lng as Locale);
    };

    i18next.on('languageChanged', handleLanguageChange);

    return () => {
      i18next.off('languageChanged', handleLanguageChange);
    };
  }, []);

  const changeLocale = async (locale: Locale) => {
    await i18next.changeLanguage(locale);
    setCurrentLocale(locale);
  };

  return {
    currentLocale,
    changeLocale,
  };
}

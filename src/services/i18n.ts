import i18next from '../i18n/config';
import { Locale } from '../i18n/config';

export interface I18nService {
  changeLanguage: (locale: Locale) => Promise<void>;
  getCurrentLanguage: () => Locale;
  t: (key: string, options?: any) => string;
}

class I18nServiceImpl implements I18nService {
  async changeLanguage(locale: Locale): Promise<void> {
    await i18next.changeLanguage(locale);
  }

  getCurrentLanguage(): Locale {
    return i18next.language as Locale;
  }

  t(key: string, options?: any): string {
    return i18next.t(key, options) as string;
  }
}

export const i18nService: I18nService = new I18nServiceImpl();

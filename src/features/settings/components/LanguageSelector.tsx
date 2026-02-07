import { useTranslation } from '../../../i18n/hooks/useTranslation';
import { useAppSettings } from '../hooks/useAppSettings';
import i18n from '../../../i18n/config';

const languages = [
  { code: 'en', name: 'English' },
  { code: 'zh', name: '中文' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
];

export function LanguageSelector() {
  const { t } = useTranslation('common');
  const { settings, saveSettings } = useAppSettings();

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const lang = e.target.value;
    saveSettings({ ...settings, language: lang });
    // 同时更新 i18n 语言
    i18n.changeLanguage(lang);
  };

  return (
    <div className="language-selector">
      <label htmlFor="language">{t('settings.language')}</label>
      <select
        id="language"
        value={settings.language || 'en'}
        onChange={handleLanguageChange}
      >
        {languages.map(lang => (
          <option key={lang.code} value={lang.code}>
            {lang.name}
          </option>
        ))}
      </select>
    </div>
  );
}

import { useTranslation as useI18nextTranslation } from 'react-i18next';

export const useTranslation = (namespace?: string) => {
  const { t, i18n, ...rest } = useI18nextTranslation(namespace);

  return {
    t,
    i18n,
    ...rest,
  };
};

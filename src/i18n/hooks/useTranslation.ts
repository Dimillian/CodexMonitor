import { useTranslation as useOriginalTranslation } from 'react-i18next';

export function useTranslation(namespace?: string) {
  const result = useOriginalTranslation(namespace);

  return {
    t: result.t,
    i18n: result.i18n,
    ready: result.ready,
  };
}

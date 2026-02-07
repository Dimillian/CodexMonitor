// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTranslation } from './useTranslation';
import i18n from '../config';

describe('useTranslation Hook', () => {
  it('should return translation function', () => {
    const { result } = renderHook(() => useTranslation('common'));
    expect(typeof result.current.t).toBe('function');
  });

  it('should translate common phrases', () => {
    const { result } = renderHook(() => useTranslation('common'));
    expect(result.current.t('app.name')).toBe('CodexMonitor');
  });

  it('should handle language changes', async () => {
    const { result } = renderHook(() => useTranslation('common'));

    i18n.changeLanguage('zh');
    expect(result.current.t('app.name')).toBe('CodexMonitor');
  });
});

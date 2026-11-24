import { createContext, useContext, useState, useEffect } from 'react';

const defaultLocale = 'en';

const I18nContext = createContext(null);

/**
 * Tiny dependency-free i18n helper. Keys missing in the target locale fall back to English,
 * then to the raw key.
 */
export function useTranslation() {
  const [lang, setLang] = useState(localStorage.getItem('gp_locale') || defaultLocale);
  const t = (key, params = {}) => {
    const strings = translations[lang] || translations[defaultLocale];
    let text = strings[key] ?? translations[defaultLocale]?.[key] ?? key;
    return text.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
  };
  return { t, lang, setLang };
}

export const I18nProvider = ({ children }) => {
  const [lang, setLang] = useState(localStorage.getItem('gp_locale') || defaultLocale);
  useEffect(() => {
    localStorage.setItem('gp_locale', lang);
    document.documentElement.lang = lang;
  }, [lang]);
  const value = { t: (key, params = {}) => {
    const strings = translations[lang] || translations[defaultLocale];
    let text = strings[key] ?? translations[defaultLocale]?.[key] ?? key;
    return text.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
  }, lang, setLang };
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

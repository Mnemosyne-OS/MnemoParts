/**
 * useI18n — the cartridge follows the app's language.
 *
 * The host broadcasts its locale on every config update (`onHostConfig`) and
 * also puts it in the frame's query string at open (`?lang=fr`), read once at
 * mount: the broadcast only fires on CHANGES. Outside the shell the viewer
 * stays in English.
 */
import { useEffect, useState } from 'react';
import { onHostConfig } from '@mnemosyne_os/cartridge-sdk';
import { isLang, translate, type Key, type Lang } from './strings';

function initialLang(): Lang {
  try {
    const base = new URLSearchParams(window.location.search).get('lang')?.split('-')[0]?.toLowerCase();
    if (isLang(base)) return base;
  } catch (e) {
    console.warn('[parts] no location to read the language from', e);
  }
  return 'en';
}

export function useI18n() {
  const [lang, setLang] = useState<Lang>(initialLang);
  useEffect(() => onHostConfig((cfg) => {
    const base = cfg.lang?.split('-')[0]?.toLowerCase();
    if (isLang(base)) setLang(base);
  }, { apply: false }), []);
  return {
    lang,
    t: (key: Key, vars?: Record<string, string | number>) => translate(lang, key, vars),
  };
}

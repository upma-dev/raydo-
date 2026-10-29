import React, { useEffect, useRef, useState } from 'react';
import { Check, Globe } from 'lucide-react';

/**
 * Language switch for the whole app. The page text is translated by Google Translate (the app has no translated copy of its
 * own), but the visible control is ours: a globe button with a list of language names. The choice is kept in Google's own
 * `googtrans` cookie, so every page (Food admin, Taxi admin, driver, user) opens in the chosen language after the switch and
 * on later visits. English needs no translation and never loads the Google script.
 */
const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'mr', label: 'Marathi', native: 'मराठी' },
  { code: 'gu', label: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'bn', label: 'Bengali', native: 'বাংলা' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు' },
  { code: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'pa', label: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
];

const HOST_ID = 'google_translate_host';
const COOKIE = 'googtrans';

const readLanguage = () => {
  try {
    const pair = document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${COOKIE}=`));
    const code = pair ? decodeURIComponent(pair.slice(COOKIE.length + 1)).split('/').filter(Boolean)[1] : '';
    return LANGUAGES.some((language) => language.code === code) ? code : 'en';
  } catch {
    return 'en';
  }
};

const writeLanguage = (code) => {
  const domains = ['', window.location.hostname, `.${window.location.hostname}`];
  domains.forEach((domain) => {
    const scope = domain ? `; domain=${domain}` : '';
    document.cookie = code === 'en'
      ? `${COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT${scope}`
      : `${COOKIE}=/en/${code}; path=/; max-age=31536000${scope}`;
  });
};

// Google Translate wraps text in <font> tags; React then fails with "removeChild / insertBefore on a node that is not a
// child". Ignoring those calls keeps the screen alive while a translation is on.
let reactPatched = false;
const patchDomForTranslation = () => {
  if (reactPatched || typeof Node !== 'function') return;
  reactPatched = true;
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function removeChild(child) {
    if (child && child.parentNode !== this) return child;
    return originalRemoveChild.apply(this, arguments);
  };
  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function insertBefore(newNode, referenceNode) {
    if (referenceNode && referenceNode.parentNode !== this) return newNode;
    return originalInsertBefore.apply(this, arguments);
  };
};

let translateLoader = null;
const loadTranslate = () => {
  if (translateLoader) return translateLoader;
  patchDomForTranslation();
  translateLoader = new Promise((resolve) => {
    let host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = HOST_ID;
      host.style.display = 'none';
      document.body.appendChild(host);
    }
    window.googleTranslateElementInit = () => {
      new window.google.translate.TranslateElement(
        {
          pageLanguage: 'en',
          includedLanguages: LANGUAGES.filter((language) => language.code !== 'en').map((language) => language.code).join(','),
          autoDisplay: false,
        },
        HOST_ID,
      );
      resolve();
    };
    const script = document.createElement('script');
    script.id = 'google-translate-script';
    script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    script.async = true;
    document.body.appendChild(script);
  });
  return translateLoader;
};

const GlobalLanguageSelector = ({ variant = 'dark', className = '', style = {} }) => {
  const [open, setOpen] = useState(false);
  const [alignLeft, setAlignLeft] = useState(false);
  const [current] = useState(readLanguage);
  const rootRef = useRef(null);
  const isLight = variant === 'light';

  // A page that opens in a chosen language loads the translator right away
  useEffect(() => {
    if (current !== 'en') loadTranslate();
  }, [current]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    if (!open && rootRef.current) {
      // The control sits on the left edge in some apps: open the list towards the side that has room
      setAlignLeft(rootRef.current.getBoundingClientRect().left < 200);
    }
    setOpen((value) => !value);
  };

  const choose = (code) => {
    setOpen(false);
    if (code === current) return;
    writeLanguage(code);
    // One reload makes every page, menu and popup start in the new language
    window.location.reload();
  };

  return (
    <div
      ref={rootRef}
      translate="no"
      className={`notranslate global-lang-selector ${className}`}
      style={{ position: 'relative', display: 'inline-flex', flexShrink: 0, zIndex: 50, ...style }}
    >
      <button
        type="button"
        onClick={toggle}
        aria-label="Change language"
        aria-expanded={open}
        title={LANGUAGES.find((language) => language.code === current)?.native}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '34px',
          height: '34px',
          borderRadius: '50%',
          cursor: 'pointer',
          background: isLight ? 'rgba(241, 245, 249, 0.95)' : 'rgba(15, 23, 42, 0.75)',
          border: isLight ? '1px solid rgba(203, 213, 225, 0.8)' : '1px solid rgba(255, 255, 255, 0.25)',
        }}
      >
        <Globe size={16} color={isLight ? '#0f172a' : '#fff'} style={{ flexShrink: 0, pointerEvents: 'none' }} />
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            [alignLeft ? 'left' : 'right']: 0,
            zIndex: 9999,
            minWidth: '190px',
            maxHeight: '320px',
            overflowY: 'auto',
            padding: '6px',
            borderRadius: '14px',
            background: '#fff',
            color: '#0f172a',
            border: '1px solid rgba(203, 213, 225, 0.9)',
            boxShadow: '0 18px 40px rgba(15, 23, 42, 0.18)',
          }}
        >
          {LANGUAGES.map((language) => (
            <button
              key={language.code}
              type="button"
              role="option"
              aria-selected={language.code === current}
              onClick={() => choose(language.code)}
              style={{
                display: 'flex',
                width: '100%',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '9px 10px',
                borderRadius: '10px',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '13px',
                fontWeight: 600,
                background: language.code === current ? '#f1f5f9' : 'transparent',
                color: '#0f172a',
              }}
            >
              <span>
                {language.native}
                {language.native !== language.label && (
                  <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: 500, color: '#64748b' }}>{language.label}</span>
                )}
              </span>
              {language.code === current && <Check size={15} color="#059669" />}
            </button>
          ))}
        </div>
      )}

      <style>{`
        /* Google Translate draws its own banner / tooltips; the app has its own control */
        .goog-te-banner-frame.skiptranslate,
        .goog-te-banner-frame,
        iframe.skiptranslate,
        iframe.goog-te-banner-frame,
        .VIpgJd-ZVi9od-aZ2wEe-wOHMyf,
        .VIpgJd-ZVi9od-ORHb-OEVmcd,
        #goog-gt-tt,
        .goog-te-balloon-frame,
        .goog-tooltip,
        .goog-te-spinner-pos {
          display: none !important;
          visibility: hidden !important;
        }
        body {
          top: 0px !important;
          position: static !important;
        }
        .goog-text-highlight {
          background-color: transparent !important;
          box-shadow: none !important;
        }
      `}</style>
    </div>
  );
};

export default GlobalLanguageSelector;

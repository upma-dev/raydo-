import React, { useEffect, useId } from 'react';
import { Globe } from 'lucide-react';

const GlobalLanguageSelector = ({ variant = 'dark', className = '', style = {} }) => {
  const uniqueId = useId().replace(/:/g, '');
  const containerId = `google_translate_element_${uniqueId}`;

  useEffect(() => {
    const initTranslate = () => {
      if (window.google && window.google.translate && window.google.translate.TranslateElement) {
        const el = document.getElementById(containerId);
        if (el && !el.hasChildNodes()) {
          new window.google.translate.TranslateElement(
            {
              pageLanguage: 'en',
              autoDisplay: false,
            },
            containerId
          );
        }
      }
    };

    if (window.google && window.google.translate && window.google.translate.TranslateElement) {
      initTranslate();
    } else {
      const existingScript = document.getElementById('google-translate-script');
      if (!existingScript) {
        window.googleTranslateElementInit = () => {
          initTranslate();
        };
        const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
        const script = document.createElement('script');
        script.id = 'google-translate-script';
        script.src = `https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit&key=${apiKey}`;
        script.async = true;
        document.body.appendChild(script);
      } else {
        // Script is loading, check periodically or attach to init
        const prevInit = window.googleTranslateElementInit;
        window.googleTranslateElementInit = () => {
          if (typeof prevInit === 'function') prevInit();
          initTranslate();
        };
        // Fallback polling for slow loads
        const interval = setInterval(() => {
          if (window.google && window.google.translate && window.google.translate.TranslateElement) {
            initTranslate();
            clearInterval(interval);
          }
        }, 500);
        return () => clearInterval(interval);
      }
    }
  }, [containerId]);

  const isLight = variant === 'light';

  return (
    <div
      className={`global-lang-selector ${className}`}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '34px',
        height: '34px',
        flexShrink: 0,
        borderRadius: '50%',
        background: isLight ? 'rgba(241, 245, 249, 0.95)' : 'rgba(15, 23, 42, 0.75)',
        border: isLight ? '1px solid rgba(203, 213, 225, 0.8)' : '1px solid rgba(255, 255, 255, 0.25)',
        zIndex: 50,
        ...style,
      }}
    >
      <Globe size={16} color={isLight ? '#0f172a' : '#fff'} className="lang-globe-icon" style={{ flexShrink: 0, pointerEvents: 'none' }} />
      <div id={containerId} className="google-translate-container" style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: '50%' }}></div>
      <style>{`
        /* Hide the Google Translate branding */
        .goog-te-gadget {
          color: transparent !important;
          font-size: 0px !important;
          display: flex !important;
          align-items: center !important;
          width: 100% !important;
          height: 100% !important;
          overflow: hidden !important;
        }
        .goog-te-gadget .goog-te-combo {
          margin: 0 !important;
          padding: 0px 2px;
          border-radius: 4px;
          border: none;
          background: transparent;
          color: transparent;
          opacity: 0;
          font-size: 16px;
          outline: none;
          cursor: pointer;
          position: absolute;
          inset: 0;
          height: 100% !important;
          width: 100% !important;
          max-width: 100% !important;
        }
        .goog-te-gadget .goog-te-combo option {
          color: #000;
          background: #fff;
        }
        
        .goog-te-gadget img,
        .goog-logo-link,
        .goog-te-gadget > span > a {
          display: none !important;
        }
        .goog-te-banner-frame.skiptranslate, 
        .goog-te-banner-frame, 
        iframe.skiptranslate,
        iframe.goog-te-banner-frame,
        iframe[name*="container"],
        iframe[id*="container"],
        .VIpgJd-ZVi9od-aZ2wEe-wOHMyf,
        .VIpgJd-ZVi9od-ORHb-OEVmcd {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
          height: 0px !important;
          width: 0px !important;
        }
        body {
          top: 0px !important; 
          position: static !important;
        }
        #goog-gt-tt, .goog-te-balloon-frame, .goog-tooltip, .goog-te-spinner-pos {
          display: none !important;
          visibility: hidden !important;
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

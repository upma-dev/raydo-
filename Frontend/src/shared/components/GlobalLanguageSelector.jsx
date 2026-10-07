import React, { useEffect } from 'react';
import { Globe } from 'lucide-react';

const GlobalLanguageSelector = () => {

  useEffect(() => {
    // Prevent multiple initializations
    if (document.getElementById('google-translate-script')) return;

    window.googleTranslateElementInit = () => {
      new window.google.translate.TranslateElement(
        {
          pageLanguage: 'en',
          autoDisplay: false,
        },
        'google_translate_element'
      );
    };

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    const script = document.createElement('script');
    script.id = 'google-translate-script';
    script.src = `https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit&key=${apiKey}`;
    script.async = true;
    document.body.appendChild(script);
  }, []);

  return (
    <div
      className="global-lang-selector"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 6px',
        borderRadius: '24px',
        background: 'rgba(0, 0, 0, 0.4)',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        backdropFilter: 'blur(10px)',
        zIndex: 50,
        maxWidth: '90px',
      }}
    >
      <Globe size={14} color="#fff" className="lang-globe-icon" style={{ flexShrink: 0 }} />
      <div id="google_translate_element" style={{ minHeight: '20px', display: 'flex', alignItems: 'center', overflow: 'hidden' }}></div>
      <style>{`
        /* Hide the Google Translate branding */
        .goog-te-gadget {
          color: transparent !important;
          font-size: 0px !important;
          display: flex !important;
          align-items: center !important;
          width: 70px !important;
          overflow: hidden !important;
        }
        .goog-te-gadget .goog-te-combo {
          margin: 0 !important;
          padding: 0px 2px;
          border-radius: 4px;
          border: none;
          background: transparent;
          color: #fff;
          font-size: 11px;
          font-weight: 700;
          outline: none;
          cursor: pointer;
          height: 22px;
          width: 100% !important;
          max-width: 100% !important;
        }
        /* Custom dropdown arrow color */
        .goog-te-gadget .goog-te-combo option {
          color: #000;
        }
        
        /* Responsive adjustments for mobile */
        @media (max-width: 600px) {
          .global-lang-selector {
            padding: 4px 8px !important;
          }
        }

        /* Hide the Google logo image */
        .goog-te-gadget img {
          display: none !important;
        }
        /* Hide the 'Powered by' text but carefully to not hide the select */
        .goog-logo-link {
          display: none !important;
        }
        .goog-te-gadget > span > a {
          display: none !important;
        }
        /* Hide top banner frame that Google injects */
        .goog-te-banner-frame.skiptranslate, 
        .goog-te-banner-frame, 
        iframe.skiptranslate,
        .VIpgJd-ZVi9od-aZ2wEe-wOHMyf,
        .VIpgJd-ZVi9od-ORHb-OEVmcd {
          display: none !important;
          visibility: hidden !important;
        }
        body {
          top: 0px !important; 
        }
        /* Hide tooltip */
        #goog-gt-tt, .goog-te-balloon-frame {
          display: none !important;
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

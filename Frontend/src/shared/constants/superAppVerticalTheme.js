/**
 * Raydo super-app vertical colours — matched to raydo-logo.png
 *
 * Logo accents (bright):
 *   Food    — orange  #FC6C00 (scooter, food icon)
 *   Taxi    — dark blue (logo navy / rides)
 *   Grocery — green   #74CC08 (E, grocery cart)
 *
 * UI uses darker shades for headers / inactive tabs; logo brights for accents & active tabs.
 */
export const RAYDO_LOGO_COLORS = {
  brandYellow: '#FFC700',
  food: '#FF385C',
  taxi: '#7C3AED',
};

export const SUPER_APP_VERTICAL_THEME = {
  food: {
    accent: RAYDO_LOGO_COLORS.food,
    activeTab: RAYDO_LOGO_COLORS.food,
    theme: '#9F1239',
    inactiveTab: '#4C0519',
    stickyBackdrop: 'rgba(159, 18, 57, 0.94)',
    accentSoft: '#FFF1F2',
    accentSoftHover: '#FFE4E6',
    themeBg: 'bg-[#9F1239]',
    activeTabBg: 'bg-[#FF385C]',
    inactiveTabBg: 'bg-[#4C0519]/85',
  },
  taxi: {
    accent: RAYDO_LOGO_COLORS.taxi,
    activeTab: '#6366F1',
    theme: '#1E1B4B',
    inactiveTab: '#0F0E26',
    stickyBackdrop: 'rgba(30, 27, 75, 0.96)',
    accentSoft: '#EEF2FF',
    accentSoftHover: '#E0E7FF',
    themeBg: 'bg-[#1E1B4B]',
    activeTabBg: 'bg-[#7C3AED]',
    inactiveTabBg: 'bg-[#0F0E26]/90',
  },
};

export function getVerticalTheme(verticalId) {
  return SUPER_APP_VERTICAL_THEME[verticalId] || SUPER_APP_VERTICAL_THEME.food;
}

/**
 * "Master" OTPs for testing. They used to work for ANY phone number in EVERY environment (1234 / 123456), which let
 * anybody log in as any user or driver. Now:
 *   - 1234 / 123456 work only outside production (NODE_ENV != production), or when ALLOW_MASTER_OTP=true is set on purpose
 *   - STATIC_OTP_CODE works for STATIC_OTP_PHONE only when that phone is configured (e.g. the Play-Store review account);
 *     with no phone configured it behaves like 1234 (outside production only)
 */
const last10 = (value) => String(value || '').replace(/\D/g, '').slice(-10);

const isProduction = () => String(process.env.NODE_ENV || 'development').toLowerCase() === 'production';
const explicitlyAllowed = () => ['1', 'true', 'yes', 'on'].includes(String(process.env.ALLOW_MASTER_OTP || '').trim().toLowerCase());

export const isMasterOtp = (otp, phone) => {
  const code = String(otp || '').trim();
  if (!code) return false;

  const hardcodedAllowed = !isProduction() || explicitlyAllowed();
  if (hardcodedAllowed && (code === '1234' || code === '123456')) return true;

  const staticCode = String(process.env.STATIC_OTP_CODE || '').trim();
  const staticPhone = last10(process.env.STATIC_OTP_PHONE);
  if (staticCode && code === staticCode) {
    if (staticPhone) return last10(phone) === staticPhone;
    return hardcodedAllowed;
  }
  return false;
};

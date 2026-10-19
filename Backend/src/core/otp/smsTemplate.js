/**
 * OTP SMS text. It must match the DLT-approved template character for character, or SMS India Hub rejects it
 * with "ErrorCode 006: Invalid template text". Set SMS_DLT_TEMPLATE_TEXT in .env to the exact approved template
 * (each ##var## is filled in order: brand name, then OTP).
 */
const DEFAULT_TEMPLATE =
  'Welcome to the ##var## powered by Appzeto.Your OTP for registration is ##var##.BGADEC';
const BRAND_NAME = 'Raydo';

export const renderOtpSmsText = (otp) => {
  const template = String(process.env.SMS_DLT_TEMPLATE_TEXT || '').trim() || DEFAULT_TEMPLATE;
  const values = [BRAND_NAME, String(otp)];
  const slots = template.match(/##var##/g)?.length || 0;
  // A template with a single ##var## carries only the OTP.
  const fill = slots === 1 ? [String(otp)] : values;
  let i = 0;
  return template.replace(/##var##/g, () => fill[i++] ?? '');
};

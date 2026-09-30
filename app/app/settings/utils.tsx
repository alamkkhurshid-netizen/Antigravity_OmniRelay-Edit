export const validWhatsapp = (value:string|null) => !value||/^\+[1-9]\d{7,14}$/.test(value.replace(/[\s()-]/g,""));
export const phoneDigits = (value:string) => value.replace(/\D/g,"");
export const validPhone = (value:string) => {
  if(!value.trim()) return true;
  const digits = phoneDigits(value);
  return (digits.length >= 8 && digits.length <= 15) || (digits.length === 11 && digits.startsWith("0"));
};
export const validPostalCode = (value:string) => !value.trim()||/^\d{6}$/.test(value.trim());
export const validWebsite = (value:string) => !value.trim()||/^https?:\/\/[^\s]+\.[^\s]+$/i.test(value.trim());
export const validHttps = (value:string) => !value.trim()||/^https:\/\/[^\s]+$/i.test(value.trim());

export const Required = () => <span className="required-mark" aria-label="required">*</span>;

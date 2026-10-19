export type WhatsAppOrganizationAddressExtra = {
  access_token?: string;
  flow_type?: "only_waba" | "new_phone_number" | "existing_phone_number";
  [key: string]: unknown;
};

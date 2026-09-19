export type DeliveryStatus = Record<string, unknown> | null;

export type WhatsAppFailure = {
  code: string;
  category: "reply_window" | "recipient" | "billing" | "rate_limit" | "template" | "authentication" | "configuration" | "provider";
  title: string;
  detail: string;
  action: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function firstError(status: DeliveryStatus) {
  const errors = Array.isArray(status?.errors) ? status.errors : [];
  const wrapper = record(errors[0]);
  return Object.keys(record(wrapper.error)).length ? record(wrapper.error) : wrapper;
}

export function whatsappFailure(status: DeliveryStatus): WhatsAppFailure | null {
  if (!status?.failed) return null;
  const error = firstError(status);
  const code = String(error.code ?? "provider_error");
  const mapped: Record<string, Omit<WhatsAppFailure, "code">> = {
    "131047": { category: "reply_window", title: "24-hour reply window closed", detail: "WhatsApp blocked this free-form message because the patient has not replied within 24 hours.", action: "Send an approved template, then continue normally after the patient replies." },
    "131030": { category: "recipient", title: "Recipient is not enabled for this test number", detail: "Meta test numbers can message only recipients added to the allowed list.", action: "Add the recipient in Meta test setup, or switch this workspace to a production WhatsApp number." },
    "131026": { category: "recipient", title: "WhatsApp could not deliver to this recipient", detail: "The number may be invalid, inactive, or currently unavailable on WhatsApp.", action: "Verify the country code and number before retrying. Use another consented channel if needed." },
    "131042": { category: "billing", title: "WhatsApp billing needs attention", detail: "Meta rejected delivery because the WhatsApp Business payment setup is unavailable.", action: "Open WhatsApp Manager, resolve the payment issue, and retry from OmniRelay." },
    "131048": { category: "rate_limit", title: "Message activity was temporarily limited", detail: "Meta detected a high message rate or quality risk for this sender.", action: "Pause bulk sends, review account quality, and retry later." },
    "131049": { category: "rate_limit", title: "Meta delivery pacing is active", detail: "Meta temporarily withheld this message to protect WhatsApp ecosystem quality.", action: "Do not retry repeatedly. Wait before trying again or use another consented channel." },
    "130429": { category: "rate_limit", title: "Cloud API rate limit reached", detail: "The WhatsApp provider is temporarily limiting requests.", action: "Wait for automatic backoff before retrying." },
    "80007": { category: "rate_limit", title: "Meta account rate limit reached", detail: "This business account temporarily exceeded an API limit.", action: "Wait for automatic backoff before retrying." },
    "132000": { category: "template", title: "Template variables do not match", detail: "The approved WhatsApp template expects a different number of variables.", action: "Review the template variable mapping in Integrations before retrying." },
    "132001": { category: "template", title: "Approved template was not found", detail: "Meta could not find this template for the selected language or WhatsApp account.", action: "Sync approved templates and confirm the language code in Integrations." },
    "132012": { category: "template", title: "Template parameter format is invalid", detail: "One or more template values do not match Meta's approved format.", action: "Review the template variables and retry with valid values." },
    "190": { category: "authentication", title: "Meta access token is invalid or expired", detail: "OmniRelay could not authenticate with the connected WhatsApp account.", action: "Reconnect WhatsApp or rotate the system-user token in Integrations." },
    "10": { category: "authentication", title: "WhatsApp permission is missing", detail: "The connected Meta token does not have the permission required for this action.", action: "Reconnect the account with messaging and management permissions." },
    "200": { category: "authentication", title: "WhatsApp permission is missing", detail: "Meta rejected this action because the connected account lacks access.", action: "Check the system user's WhatsApp assets and permissions." },
    "100": { category: "configuration", title: "WhatsApp request configuration is invalid", detail: "Meta rejected one or more recipient or template fields.", action: "Verify the recipient, approved template, language, and variables before retrying." },
  };
  return { code, ...(mapped[code] ?? { category: "provider" as const, title: "WhatsApp provider rejected this message", detail: "Meta returned a delivery error that needs staff review.", action: "Check the connected account and approved template, then retry only after resolving the cause." }) };
}

export function failureCategoryLabel(category: WhatsAppFailure["category"]) {
  return ({ reply_window: "Reply window", recipient: "Recipient", billing: "Billing", rate_limit: "Rate limit", template: "Template", authentication: "Connection", configuration: "Configuration", provider: "Provider" })[category];
}

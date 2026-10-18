/**
 * OmniRelay Structured Feature Flag Engine
 * S9-10: Type-safe, tenant-isolated feature flag system
 */

export interface FeatureFlagDefinition {
  key: string;
  name: string;
  description: string;
  category: "voice" | "retail" | "clinic" | "ai" | "security" | "core";
  defaultValue: boolean;
  envFallbackKey?: string;
  requiresTier?: "starter" | "growth" | "enterprise";
}

export const KNOWN_FEATURE_FLAGS: Record<string, FeatureFlagDefinition> = {
  voice_agent_enabled: {
    key: "voice_agent_enabled",
    name: "Voice AI Inbound Receptionist",
    description: "Enables Exotel/SIP voice call processing, slot lookups, and telephone booking.",
    category: "voice",
    defaultValue: true,
    envFallbackKey: "FEATURE_VOICE_AGENT_ENABLED",
    requiresTier: "growth",
  },
  whatsapp_catalog_enabled: {
    key: "whatsapp_catalog_enabled",
    name: "Interactive WhatsApp Retail Catalog",
    description: "Allows customers to browse products, view variant matrices, and place orders via WhatsApp.",
    category: "retail",
    defaultValue: true,
    envFallbackKey: "FEATURE_WHATSAPP_CATALOG_ENABLED",
  },
  abandoned_cart_recovery_enabled: {
    key: "abandoned_cart_recovery_enabled",
    name: "Abandoned Cart Recovery Bot",
    description: "Dispatches automated recovery notifications for unpaid checkouts with coupon incentives.",
    category: "retail",
    defaultValue: true,
    envFallbackKey: "FEATURE_CART_RECOVERY_ENABLED",
  },
  ai_insights_narration_enabled: {
    key: "ai_insights_narration_enabled",
    name: "AI Operations Executive Narration",
    description: "Generates natural language operational executive briefings from aggregate clinic facts.",
    category: "ai",
    defaultValue: true,
    envFallbackKey: "FEATURE_AI_INSIGHTS_ENABLED",
  },
  deposit_enforcement_enabled: {
    key: "deposit_enforcement_enabled",
    name: "Mandatory Online Pre-Payment Deposit",
    description: "Requires patient payment capture before confirming prime doctor slots.",
    category: "clinic",
    defaultValue: false,
    envFallbackKey: "FEATURE_DEPOSIT_ENFORCEMENT_ENABLED",
  },
  loyalty_rewards_enabled: {
    key: "loyalty_rewards_enabled",
    name: "Tiered Customer Loyalty Program",
    description: "Calculates customer reward points, tier progression (Bronze to Platinum), and auto-discounts.",
    category: "retail",
    defaultValue: true,
    envFallbackKey: "FEATURE_LOYALTY_REWARDS_ENABLED",
  },
  offline_pwa_sync_enabled: {
    key: "offline_pwa_sync_enabled",
    name: "PWA Offline Service Worker Sync",
    description: "Caches critical receptionist appointment views for offline clinic connectivity.",
    category: "core",
    defaultValue: true,
    envFallbackKey: "FEATURE_OFFLINE_PWA_ENABLED",
  },
  strict_rate_limiting_enabled: {
    key: "strict_rate_limiting_enabled",
    name: "Strict Public API Rate Limiting",
    description: "Enforces sliding-window rate throttling on public webhooks and storefront endpoints.",
    category: "security",
    defaultValue: true,
    envFallbackKey: "FEATURE_STRICT_RATE_LIMITING",
  },
};

// In-memory tenant override cache for fast evaluation
const tenantFlagOverrides = new Map<string, Map<string, boolean>>();

/**
 * Checks if a specific feature flag is active for a given organization/workspace
 */
export function isFeatureEnabled(flagKey: string, organizationId?: string | null): boolean {
  const definition = KNOWN_FEATURE_FLAGS[flagKey];
  if (!definition) return false;

  // 1. Check tenant override if organizationId is provided
  if (organizationId && tenantFlagOverrides.has(organizationId)) {
    const orgOverrides = tenantFlagOverrides.get(organizationId)!;
    if (orgOverrides.has(flagKey)) {
      return orgOverrides.get(flagKey)!;
    }
  }

  // 2. Check environment variable override
  if (definition.envFallbackKey && process.env[definition.envFallbackKey] !== undefined) {
    const envVal = process.env[definition.envFallbackKey]?.toLowerCase().trim();
    return envVal === "true" || envVal === "1";
  }

  // 3. Fallback to flag definition default
  return definition.defaultValue;
}

/**
 * Returns all feature flags evaluated with active states for a tenant
 */
export function getAllFeatureFlags(organizationId?: string | null): Array<
  FeatureFlagDefinition & { isEnabled: boolean; isOverridden: boolean }
> {
  const orgOverrides = organizationId ? tenantFlagOverrides.get(organizationId) : null;

  return Object.values(KNOWN_FEATURE_FLAGS).map((def) => {
    const isOverridden = Boolean(orgOverrides && orgOverrides.has(def.key));
    const isEnabled = isFeatureEnabled(def.key, organizationId);
    return {
      ...def,
      isEnabled,
      isOverridden,
    };
  });
}

/**
 * Sets an organization-specific feature flag override
 */
export function setFeatureFlagOverride(
  organizationId: string,
  flagKey: string,
  enabled: boolean
): void {
  if (!tenantFlagOverrides.has(organizationId)) {
    tenantFlagOverrides.set(organizationId, new Map());
  }
  tenantFlagOverrides.get(organizationId)!.set(flagKey, enabled);
}

/**
 * Resets all overrides for testing or tenant reset
 */
export function clearFeatureFlagOverrides(organizationId?: string): void {
  if (organizationId) {
    tenantFlagOverrides.delete(organizationId);
  } else {
    tenantFlagOverrides.clear();
  }
}

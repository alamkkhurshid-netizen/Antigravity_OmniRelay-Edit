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
    defaultValue: false, // Default OFF until controlled trial passes verification
    envFallbackKey: "FEATURE_VOICE_AGENT_ENABLED",
    requiresTier: "growth",
  },
  whatsapp_catalog_enabled: {
    key: "whatsapp_catalog_enabled",
    name: "Interactive WhatsApp Retail Catalog",
    description: "Allows customers to browse products, view variant matrices, and place orders via WhatsApp.",
    category: "retail",
    defaultValue: false, // Retail disabled by default for healthcare core MVP
    envFallbackKey: "FEATURE_WHATSAPP_CATALOG_ENABLED",
    requiresTier: "growth",
  },
  abandoned_cart_recovery_enabled: {
    key: "abandoned_cart_recovery_enabled",
    name: "Abandoned Cart Recovery Bot",
    description: "Dispatches automated recovery notifications for unpaid checkouts with coupon incentives.",
    category: "retail",
    defaultValue: false, // Retail disabled by default
    envFallbackKey: "FEATURE_CART_RECOVERY_ENABLED",
    requiresTier: "growth",
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
    requiresTier: "growth",
  },
  loyalty_rewards_enabled: {
    key: "loyalty_rewards_enabled",
    name: "Tiered Customer Loyalty Program",
    description: "Calculates customer reward points, tier progression (Bronze to Platinum), and auto-discounts.",
    category: "retail",
    defaultValue: false, // Retail disabled by default
    envFallbackKey: "FEATURE_LOYALTY_REWARDS_ENABLED",
    requiresTier: "growth",
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

export const TIER_RANKS: Record<string, number> = {
  starter: 1,
  growth: 2,
  enterprise: 3,
};

/**
 * Checks whether an organization tier satisfies the required tier
 */
export function satisfiesTier(
  currentTier: string = "starter",
  requiredTier?: "starter" | "growth" | "enterprise"
): boolean {
  if (!requiredTier) return true;
  const currentRank = TIER_RANKS[currentTier.toLowerCase()] ?? 1;
  const requiredRank = TIER_RANKS[requiredTier.toLowerCase()] ?? 1;
  return currentRank >= requiredRank;
}

// Durable tenant flag cache with explicit invalidation
interface CacheEntry {
  flags: Record<string, boolean>;
  timestamp: number;
}
const durableFlagCache = new Map<string, CacheEntry>();
const tenantFlagOverrides = new Map<string, Map<string, boolean>>();
const CACHE_TTL_MS = 10 * 1000; // 10-second coherent window

/**
 * Invalidates durable cache for a tenant when updated
 */
export function invalidateFeatureFlagCache(organizationId?: string): void {
  if (organizationId) {
    durableFlagCache.delete(organizationId);
    tenantFlagOverrides.delete(organizationId);
  } else {
    durableFlagCache.clear();
    tenantFlagOverrides.clear();
  }
}

/**
 * Checks if a specific feature flag is active for a given organization/workspace.
 * PostgreSQL organization configuration is the authoritative source of truth.
 */
export function isFeatureEnabled(
  flagKey: string,
  organizationId?: string | null,
  orgConfig?: { extra?: { feature_flags?: Record<string, boolean>; plan_tier?: string; tier?: string } } | null
): boolean {
  const definition = KNOWN_FEATURE_FLAGS[flagKey];
  if (!definition) return false;

  // 1. Direct committed organization configuration passed from database
  if (orgConfig?.extra?.feature_flags && flagKey in orgConfig.extra.feature_flags) {
    return Boolean(orgConfig.extra.feature_flags[flagKey]);
  }

  // 2. Coherent cached durable flags for organization
  if (organizationId && durableFlagCache.has(organizationId)) {
    const entry = durableFlagCache.get(organizationId)!;
    if (Date.now() - entry.timestamp < CACHE_TTL_MS) {
      if (flagKey in entry.flags) {
        return entry.flags[flagKey];
      }
    } else {
      durableFlagCache.delete(organizationId);
    }
  }

  // 3. Fallback in-memory overrides (for test isolation)
  if (organizationId && tenantFlagOverrides.has(organizationId)) {
    const orgOverrides = tenantFlagOverrides.get(organizationId)!;
    if (orgOverrides.has(flagKey)) {
      return orgOverrides.get(flagKey)!;
    }
  }

  // 4. Environment variable override
  if (definition.envFallbackKey && process.env[definition.envFallbackKey] !== undefined) {
    const envVal = process.env[definition.envFallbackKey]?.toLowerCase().trim();
    return envVal === "true" || envVal === "1";
  }

  // 5. Default value (safe defaults: false for unverified modules)
  return definition.defaultValue;
}

/**
 * Sets durable cache entry for an organization (called after DB write or on fetch)
 */
export function setDurableFlagCache(organizationId: string, flags: Record<string, boolean>): void {
  durableFlagCache.set(organizationId, {
    flags,
    timestamp: Date.now(),
  });
}

/**
 * Returns all feature flags evaluated with active states for a tenant
 */
export function getAllFeatureFlags(
  organizationId?: string | null,
  orgConfig?: { extra?: { feature_flags?: Record<string, boolean> } } | null
): Array<FeatureFlagDefinition & { isEnabled: boolean; isOverridden: boolean }> {
  const flagsMap = orgConfig?.extra?.feature_flags ||
    (organizationId && durableFlagCache.has(organizationId) ? durableFlagCache.get(organizationId)!.flags : null);

  const orgOverrides = organizationId ? tenantFlagOverrides.get(organizationId) : null;

  return Object.values(KNOWN_FEATURE_FLAGS).map((def) => {
    let isOverridden = false;
    let isEnabled = def.defaultValue;

    if (flagsMap && def.key in flagsMap) {
      isEnabled = Boolean(flagsMap[def.key]);
      isOverridden = true;
    } else if (orgOverrides && orgOverrides.has(def.key)) {
      isEnabled = orgOverrides.get(def.key)!;
      isOverridden = true;
    } else {
      isEnabled = isFeatureEnabled(def.key, organizationId, orgConfig);
    }

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

  // Also update coherent cache
  const existing = durableFlagCache.get(organizationId)?.flags || {};
  durableFlagCache.set(organizationId, {
    flags: { ...existing, [flagKey]: enabled },
    timestamp: Date.now(),
  });
}

/**
 * Resets all overrides for testing or tenant reset
 */
export function clearFeatureFlagOverrides(organizationId?: string): void {
  invalidateFeatureFlagCache(organizationId);
}


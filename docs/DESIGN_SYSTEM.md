# OmniRelay Design System Foundation

**Version:** 2.0  
**Status:** Canonical  
**Last Updated:** October 2026

---

## 1. Color Palette & Tokens

OmniRelay uses an HSL/Hex modern healthcare-grade design palette tailored for readability, trustworthiness, and high contrast.

| Token | Value | Role / Usage |
|---|---|---|
| `--background` | `#f5f7fb` | App canvas background |
| `--foreground` | `#071326` | Deep navy primary text |
| `--card` | `#ffffff` | Elevated card surfaces |
| `--card-foreground` | `#071326` | Text on card surfaces |
| `--primary` | `#087fb9` | OmniRelay brand blue |
| `--primary-foreground` | `#ffffff` | Text on primary elements |
| `--secondary` | `#eaf6f8` | Soft ice-blue secondary fill |
| `--secondary-foreground` | `#093149` | Deep teal secondary text |
| `--muted` | `#eef4f7` | Muted background surfaces |
| `--muted-foreground` | `#647389` | Subtle label and secondary text |
| `--accent` | `#dff7f2` | Mint accent highlight |
| `--accent-foreground` | `#075d56` | Forest green accent text |
| `--destructive` | `#c94855` | Alert & error red |
| `--destructive-foreground`| `#ffffff` | Text on destructive elements |
| `--border` | `#dce7ef` | Neutral border outline |
| `--input` | `#dce7ef` | Input field borders |
| `--ring` | `#18bfc5` | Active focus indicator ring |

---

## 2. Typography Hierarchy

OmniRelay uses standard type classes for consistency across all modules:

| Token Class | Size / Weight | Best Used For |
|---|---|---|
| `.or-type-page` | `text-3xl sm:text-4xl font-semibold` | Page titles, hero headlines |
| `.or-type-section` | `text-2xl font-semibold` | Major card groups, tab titles |
| `.or-type-card` | `text-xl font-semibold` | Individual card titles, dialog titles |
| `.or-type-stat` | `text-3xl font-semibold tabular-nums` | Metric numbers, revenue figures |
| `.or-type-label` | `text-xs font-black tracking-wider` | Metric badges, uppercase eyebrows |

---

## 3. Radii & Elevation

- **Base Radius (`--radius`):** `0.875rem` (`14px`)
- **Card Radius (`rounded-2xl` / `rounded-xl`):** `16px` / `12px`
- **Button Radius (`rounded-lg`):** `8px`
- **Shadow Marble:** `0 16px 42px rgba(7, 19, 38, 0.08)`
- **Shadow Card:** `0 4px 12px rgba(7, 19, 38, 0.04)`

---

## 4. UI Primitives Inventory (`components/ui`)

| Component | File | Description |
|---|---|---|
| `Button` | `components/ui/button.tsx` | 6 variants (`default`, `outline`, `secondary`, `destructive`, `ghost`, `link`) |
| `Badge` | `components/ui/badge.tsx` | Status tags and count pills |
| `Card` | `components/ui/card.tsx` | Surface cards with Header, Title, Content, Footer |
| `StatCard` | `components/ui/stat-card.tsx` | Metric indicator cards |
| `Input` | `components/ui/input.tsx` | Accessible form text input |
| `Select` | `components/ui/select.tsx` | Accessible dropdown select |
| `Textarea` | `components/ui/textarea.tsx` | Multi-line text field |
| `Label` | `components/ui/label.tsx` | Form labels with optional required marker |
| `Switch` | `components/ui/switch.tsx` | Accessible toggle switch |
| `Tabs` | `components/ui/tabs.tsx` | Tabbed navigation container |
| `Table` | `components/ui/table.tsx` | Accessible data table wrapper |
| `Dialog` | `components/ui/dialog.tsx` | Modal dialogs with Radix primitives |
| `Dropdown` | `components/ui/dropdown.tsx` | Contextual action dropdowns |
| `Avatar` | `components/ui/avatar.tsx` | User profile avatars with fallback |
| `Tooltip` | `components/ui/tooltip.tsx` | Accessible hover tooltips |
| `Skeleton` | `components/ui/skeleton.tsx` | Animated loading placeholders |
| `PageHeader` | `components/ui/page-header.tsx` | Standardized header bar |
| `SectionCard` | `components/ui/section-card.tsx` | Structured card with title & actions |
| `EmptyState` | `components/ui/empty-state.tsx` | Zero-data placeholder view |
| `StatusBadge` | `components/ui/status-badge.tsx` | Color-coded status indicator |
| `DataTable` | `components/ui/data-table.tsx` | Paginated table with loading & empty states |

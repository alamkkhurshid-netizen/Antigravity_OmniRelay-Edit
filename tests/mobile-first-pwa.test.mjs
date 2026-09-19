import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

test("PWA Manifest & App-Like Experience: Configuration & Icons", () => {
  const manifestPath = path.join(projectRoot, "public", "manifest.json");
  assert.ok(fs.existsSync(manifestPath), "public/manifest.json must exist");

  const manifestContent = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  assert.equal(manifestContent.name, "OmniRelay Clinic Operations");
  assert.equal(manifestContent.short_name, "OmniRelay");
  assert.equal(manifestContent.start_url, "/app");
  assert.equal(manifestContent.display, "standalone");
  assert.equal(manifestContent.theme_color, "#071426");
  assert.equal(manifestContent.background_color, "#071426");
  assert.equal(manifestContent.orientation, "portrait-primary");

  // Verify icons
  assert.ok(Array.isArray(manifestContent.icons), "icons must be an array");
  const icon192 = manifestContent.icons.find((i) => i.sizes === "192x192");
  const icon512 = manifestContent.icons.find((i) => i.sizes === "512x512");
  assert.ok(icon192, "Must contain 192x192 icon");
  assert.ok(icon512, "Must contain 512x512 icon");

  // Verify that icon files actually exist on disk
  const icon192Path = path.join(projectRoot, "public", icon192.src.replace(/^\//, ""));
  const icon512Path = path.join(projectRoot, "public", icon512.src.replace(/^\//, ""));
  assert.ok(fs.existsSync(icon192Path), `Icon file ${icon192.src} must exist in public/`);
  assert.ok(fs.existsSync(icon512Path), `Icon file ${icon512.src} must exist in public/`);
});

test("PWA Root Layout: Apple Safari Meta Tags & Viewport Export", () => {
  const layoutPath = path.join(projectRoot, "app", "layout.tsx");
  const layoutContent = fs.readFileSync(layoutPath, "utf-8");

  assert.ok(layoutContent.includes('manifest: "/manifest.json"'), "Must link to /manifest.json");
  assert.ok(layoutContent.includes("appleWebApp"), "Must include appleWebApp configuration");
  assert.ok(layoutContent.includes('capable: true'), "Must enable iOS web app capable");
  assert.ok(layoutContent.includes('statusBarStyle: "black-translucent"'), "Must configure black-translucent status bar");
  assert.ok(layoutContent.includes("themeColor: \"#071426\""), "Must declare #071426 theme color");
  assert.ok(layoutContent.includes("width: \"device-width\""), "Must declare mobile device-width");
});

test("Zero-Cache Security Guard: Service Worker Privacy Invariant", () => {
  const swPath = path.join(projectRoot, "public", "omnirelay-sw.js");
  const swContent = fs.readFileSync(swPath, "utf-8");

  // Verify that service worker preserves zero-cache security rule for patient and clinical data
  assert.doesNotMatch(swContent, /caches\.open/i, "Must NOT cache API or workspace requests offline");
  assert.doesNotMatch(swContent, /self\.addEventListener\("fetch"/i, "Must NOT intercept or cache fetch requests");
  assert.ok(
    swContent.includes("No patient or workspace response is cached here"),
    "Must document zero-cache privacy constraint"
  );
});

test("Touch-Friendly Navigation: Mobile Bottom Navigation Bar & 44px Targets", () => {
  const appShellPath = path.join(projectRoot, "components", "app-shell.tsx");
  const appShellContent = fs.readFileSync(appShellPath, "utf-8");

  // Verify Mobile Bottom Bar exists with thumb-friendly controls
  assert.ok(
    appShellContent.includes('aria-label="Mobile quick navigation"'),
    "Must render mobile bottom navigation bar"
  );
  assert.ok(appShellContent.includes('href="/app"'), "Bottom bar must link to Overview");
  assert.ok(appShellContent.includes('href="/app/analytics"'), "Bottom bar must link to Analytics");
  assert.ok(appShellContent.includes('href="/app/appointments"'), "Bottom bar must link to Visits");
  assert.ok(appShellContent.includes('href="/app/action-centre"'), "Bottom bar must link to Alerts");
  assert.ok(appShellContent.includes("setMobileNavOpen(true)"), "Bottom bar must toggle drawer menu");

  // Verify touch target standards and spacing
  assert.ok(appShellContent.includes("min-h-[44px]"), "Must enforce minimum 44px touch targets");
  assert.ok(
    appShellContent.includes("pb-24"),
    "Main container must have bottom padding to prevent bottom bar occlusion"
  );
});

test("Responsive Table-to-Card & 320px Fluid Scaling", () => {
  const billingControlsPath = path.join(
    projectRoot,
    "app",
    "app",
    "billing",
    "billing-controls.tsx"
  );
  const billingControlsContent = fs.readFileSync(billingControlsPath, "utf-8");
  assert.ok(
    billingControlsContent.includes("flex-col sm:flex-row"),
    "Billing rows must stack as cards on mobile viewports"
  );
  assert.ok(
    billingControlsContent.includes("min-h-[44px]"),
    "Export button must have 44px touch target"
  );

  const walletPath = path.join(
    projectRoot,
    "app",
    "app",
    "billing",
    "operational-wallet.tsx"
  );
  const walletContent = fs.readFileSync(walletPath, "utf-8");
  assert.ok(
    walletContent.includes("flex-col sm:flex-row"),
    "Passbook rows must stack as cards on mobile viewports"
  );

  const calcCssPath = path.join(
    projectRoot,
    "app",
    "whatsapp-calculator.css"
  );
  const calcCssContent = fs.readFileSync(calcCssPath, "utf-8");
  assert.ok(
    calcCssContent.includes("@media(max-width:400px)"),
    "Must include narrow mobile viewport media queries"
  );
});

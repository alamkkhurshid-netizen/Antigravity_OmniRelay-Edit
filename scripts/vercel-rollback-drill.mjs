import { execSync, spawnSync } from "child_process";

const isWindows = process.platform === "win32";
const vercelCmd = isWindows ? "vercel.cmd" : "vercel";

// Extract bypass key silently from project metadata
const projectRaw = execSync(`${vercelCmd} api /v9/projects/omnirelay-main`, { encoding: "utf8" });
const project = JSON.parse(projectRaw);
const bypassKey = Object.keys(project.protectionBypass || {})[0];

const stagingAlias = "omnirelay-main-git-remediat-151696-alamkkhurshid-4071s-projects.vercel.app";
const priorDeployment = "omnirelay-main-o0ap14z9c-alamkkhurshid-4071s-projects.vercel.app";
const currentDeployment = "omnirelay-main-442fvdjpq-alamkkhurshid-4071s-projects.vercel.app";

async function verifyHealth(aliasUrl, phase) {
  console.log(`\n  [Health Check - ${phase}] Querying https://${aliasUrl}/api/health...`);
  try {
    const res = await fetch(`https://${aliasUrl}/api/health`, {
      headers: {
        "x-vercel-protection-bypass": bypassKey,
      },
    });
    const status = res.status;
    const body = await res.json().catch(() => null);
    console.log(`  [Health Status]: HTTP ${status}`);
    console.log(`  [Service State]: ${body?.status || "UNKNOWN"}`);
    console.log(`  [Database]:      ${body?.subsystems?.database?.status || "UNKNOWN"}`);
    console.log(`  [Voice AI]:      ${body?.subsystems?.voice_ai?.status || "UNKNOWN"}`);
    if (status !== 200 || body?.status !== "healthy") {
      throw new Error(`Health check failed during ${phase} with status ${status}`);
    }
    return body;
  } catch (err) {
    console.error(`  [Health Check Error]: ${err.message}`);
    throw err;
  }
}

async function runRollbackDrill() {
  console.log("================================================================================");
  console.log("             VERCEL STAGING DEPLOYMENT ROLLBACK DRILL");
  console.log("================================================================================");
  console.log(`Target Staging Alias:    ${stagingAlias}`);
  console.log(`Prior Target Deployment: ${priorDeployment}`);
  console.log(`Current Reviewed Target: ${currentDeployment}`);

  // Step 1: Baseline health of alias before rollback
  console.log("\nStep 1: Baseline Health on Staging Alias Before Rollback");
  await verifyHealth(stagingAlias, "PRE-ROLLBACK BASELINE");

  // Step 2: Rollback drill - Move alias to prior deployment
  console.log("\nStep 2: Executing Rollback -> Pointing Alias to Prior Deployment...");
  const rollbackCmd = spawnSync(vercelCmd, ["alias", "set", priorDeployment, stagingAlias], {
    encoding: "utf8",
    shell: true,
  });
  if (rollbackCmd.status !== 0) {
    console.error("Rollback alias set failed:", rollbackCmd.stderr);
    process.exit(1);
  }
  console.log(`  [Vercel Alias]: Successfully repointed ${stagingAlias} -> ${priorDeployment}`);

  // Wait 3 seconds for edge routing propagation
  await new Promise((r) => setTimeout(r, 3000));

  // Step 3: Verify health of the rolled-back deployment via alias
  console.log("\nStep 3: Verifying Health on Rolled-Back Staging Alias");
  await verifyHealth(stagingAlias, "ROLLED-BACK STATE");

  // Step 4: Restore drill - Move alias back to reviewed deployment
  console.log("\nStep 4: Restoring Staging Alias -> Pointing to Reviewed Deployment...");
  const restoreCmd = spawnSync(vercelCmd, ["alias", "set", currentDeployment, stagingAlias], {
    encoding: "utf8",
    shell: true,
  });
  if (restoreCmd.status !== 0) {
    console.error("Restore alias set failed:", restoreCmd.stderr);
    process.exit(1);
  }
  console.log(`  [Vercel Alias]: Successfully restored ${stagingAlias} -> ${currentDeployment}`);

  // Wait 3 seconds for edge routing propagation
  await new Promise((r) => setTimeout(r, 3000));

  // Step 5: Verify health of restored reviewed deployment
  console.log("\nStep 5: Verifying Health on Restored Reviewed Staging Alias");
  await verifyHealth(stagingAlias, "RESTORED REVIEWED STATE");

  console.log("\n================================================================================");
  console.log("✅ VERCEL ROLLBACK AND RESTORATION DRILL SUCCESSFULLY COMPLETED.");
  console.log("================================================================================");
}

runRollbackDrill().catch((err) => {
  console.error("\nFATAL ERROR during rollback drill:", err.message);
  process.exit(1);
});

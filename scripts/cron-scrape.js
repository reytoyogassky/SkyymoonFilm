#!/usr/bin/env node

const { spawn } = require("child_process");
const { existsSync, statSync } = require("fs");
const { join } = require("path");

const CATALOG_PATH = join(__dirname, "..", "public", "idlix-data", "catalog.json");
const SCRAPE_INTERVAL_HOURS = 6;
const SCRAPE_INTERVAL_MS = SCRAPE_INTERVAL_HOURS * 60 * 60 * 1000;

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function needsScrape() {
  if (!existsSync(CATALOG_PATH)) {
    log("Catalog not found, needs initial scrape");
    return true;
  }
  const stats = statSync(CATALOG_PATH);
  const age = Date.now() - stats.mtimeMs;
  const needsUpdate = age > SCRAPE_INTERVAL_MS;
  log(`Catalog age: ${(age / 3600000).toFixed(1)}h, needs update: ${needsUpdate}`);
  return needsUpdate;
}

function runScript(scriptPath) {
  return new Promise((resolve, reject) => {
    log(`Starting ${scriptPath}...`);
    const proc = spawn("node", [scriptPath], {
      stdio: "inherit",
      env: process.env,
    });
    proc.on("close", (code) => {
      if (code === 0) {
        log(`${scriptPath} completed successfully`);
        resolve();
      } else {
        log(`${scriptPath} failed with code ${code}`);
        reject(new Error(`Script failed: ${code}`));
      }
    });
    proc.on("error", reject);
  });
}

async function checkAndUpdate() {
  try {
    if (needsScrape()) {
      await runScript(join(__dirname, "scrape-catalog.js"));
    } else {
      log("Catalog is fresh, skipping update");
    }
  } catch (err) {
    log(`Error: ${err.message}`);
  }
}

async function main() {
  log(`Auto-updater started (interval: ${SCRAPE_INTERVAL_HOURS}h)`);
  
  await checkAndUpdate();
  
  setInterval(checkAndUpdate, SCRAPE_INTERVAL_MS);
  
  log(`Next check in ${SCRAPE_INTERVAL_HOURS}h`);
}

main().catch((err) => {
  log(`Fatal error: ${err.message}`);
  process.exit(1);
});

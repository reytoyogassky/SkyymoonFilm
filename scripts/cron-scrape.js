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

function runScrape() {
  return new Promise((resolve, reject) => {
    log("Starting scrape...");
    const proc = spawn("node", [join(__dirname, "scrape-catalog.js")], {
      stdio: "inherit",
      env: process.env,
    });
    proc.on("close", (code) => {
      if (code === 0) {
        log("Scrape completed successfully");
        resolve();
      } else {
        log(`Scrape failed with code ${code}`);
        reject(new Error(`Scrape failed: ${code}`));
      }
    });
    proc.on("error", reject);
  });
}

async function checkAndScrape() {
  try {
    if (needsScrape()) {
      await runScrape();
    } else {
      log("Catalog is fresh, skipping scrape");
    }
  } catch (err) {
    log(`Error: ${err.message}`);
  }
}

async function main() {
  log(`IDLIX Auto-scraper started (interval: ${SCRAPE_INTERVAL_HOURS}h)`);
  
  await checkAndScrape();
  
  setInterval(checkAndScrape, SCRAPE_INTERVAL_MS);
  
  log(`Next check in ${SCRAPE_INTERVAL_HOURS}h`);
}

main().catch((err) => {
  log(`Fatal error: ${err.message}`);
  process.exit(1);
});

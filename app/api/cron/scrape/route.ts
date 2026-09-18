import { NextRequest, NextResponse } from "next/server";
import { fork } from "child_process";
import { join } from "path";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || "";

// Simple in-memory rate limit: max 1 run per 30 minutes
let lastRunAt = 0;
const MIN_INTERVAL_MS = 30 * 60 * 1000;

// Track running scraper state
let isRunning = false;
let lastResult: Record<string, unknown> | null = null;

export async function GET(req: NextRequest) {
  // Auth check
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!CRON_SECRET) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET not configured on server" },
      { status: 500 }
    );
  }

  if (token !== CRON_SECRET) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  // Rate limit
  if (Date.now() - lastRunAt < MIN_INTERVAL_MS) {
    const waitMin = Math.ceil((MIN_INTERVAL_MS - (Date.now() - lastRunAt)) / 60000);
    return NextResponse.json(
      { ok: false, error: `Rate limited. Try again in ${waitMin} minutes.` },
      { status: 429 }
    );
  }

  // Prevent concurrent runs
  if (isRunning) {
    return NextResponse.json(
      { ok: false, error: "Scraper already running" },
      { status: 409 }
    );
  }

  // Check for --dry-run param
  const dryRun = req.nextUrl.searchParams.get("dry-run") === "true";

  isRunning = true;
  lastRunAt = Date.now();
  const startTime = Date.now();

  try {
    const scriptPath = join(process.cwd(), "scripts", "scrape-catalog.js");
    const args = dryRun ? ["--dry-run"] : [];

    const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const child = fork(scriptPath, args, {
        cwd: process.cwd(),
        stdio: "pipe",
        env: { ...process.env, NODE_ENV: "production" },
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      child.on("exit", (code) => {
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);

        if (code === 0) {
          // Parse stats from stdout
          const addedMatch = stdout.match(/Added:\s+(\d+)/);
          const updatedMatch = stdout.match(/Updated:\s+(\d+)/);
          const removedMatch = stdout.match(/Removed:\s+(\d+)/);
          const totalMatch = stdout.match(/Total:\s+(\d+)/);

          resolve({
            success: true,
            added: addedMatch ? parseInt(addedMatch[1]) : 0,
            updated: updatedMatch ? parseInt(updatedMatch[1]) : 0,
            removed: removedMatch ? parseInt(removedMatch[1]) : 0,
            total: totalMatch ? parseInt(totalMatch[1]) : 0,
            duration: `${duration}s`,
            dryRun,
            scrapedAt: new Date().toISOString(),
            log: stdout.slice(-500), // last 500 chars of log
          });
        } else {
          reject(
            new Error(
              `Scraper exited with code ${code}. stderr: ${stderr.slice(-300)}`
            )
          );
        }
      });

      child.on("error", (err) => {
        reject(err);
      });
    });

    lastResult = result;

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const errorMsg = (err as Error).message;
    lastResult = { success: false, error: errorMsg };

    return NextResponse.json(
      { ok: false, error: errorMsg },
      { status: 500 }
    );
  } finally {
    isRunning = false;
  }
}

// GET /api/cron/scrape/status - check scraper status
export async function POST(req: NextRequest) {
  return NextResponse.json({
    ok: true,
    isRunning,
    lastResult,
    lastRunAt: lastRunAt ? new Date(lastRunAt).toISOString() : null,
  });
}

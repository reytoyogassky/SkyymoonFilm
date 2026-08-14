import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, isSupabaseConfigured } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface SavedTitleBody {
  slug?: string;
  title?: string;
  posterPath?: string;
  releaseDate?: string;
  quality?: string;
  country?: string;
}

const TABLE_NAMES = ["watchlist", "history", "progress"] as const;
type TableName = (typeof TABLE_NAMES)[number];

function normalizeUser(id: string): string {
  return id.trim().toLowerCase().replace(/\s+/g, ".").slice(0, 60);
}

function isTable(v: string | null | undefined): v is TableName {
  return v === "watchlist" || v === "history" || v === "progress";
}

export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ rows: [] });

  const sp = req.nextUrl.searchParams;
  const tableParam = sp.get("table");
  const user = normalizeUser(sp.get("user") ?? "");

  if (!tableParam || !user) return NextResponse.json({ rows: [] });
  if (!isTable(tableParam)) {
    return NextResponse.json({ error: "invalid table" }, { status: 400 });
  }
  const table = tableParam;

  const supabase = createAdminClient();

  if (table === "progress") {
    const { data, error } = await supabase
      .from("progress")
      .select("slug, time, duration, updated_at")
      .eq("user_id", user);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ rows: data });
  }

  const { data, error } = await supabase
    .from(table)
    .select("slug, title, poster_path, release_date, quality, country, created_at, watched_at")
    .eq("user_id", user)
    .order(table === "history" ? "watched_at" : "created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data });
}

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: false });

  const body = (await req.json()) as {
    table?: string;
    user?: string;
    action?: "upsert" | "delete";
    item?: SavedTitleBody;
    slug?: string;
    time?: number;
    duration?: number;
  };
  const tableParam = body.table;
  const user = normalizeUser(body.user ?? "");

  if (!tableParam || !user) return NextResponse.json({ error: "missing table/user" }, { status: 400 });
  if (!isTable(tableParam)) {
    return NextResponse.json({ error: "invalid table" }, { status: 400 });
  }
  const table = tableParam;

  const supabase = createAdminClient();

  try {
    if (table === "progress") {
      if (!body.slug) return NextResponse.json({ error: "missing slug" }, { status: 400 });
      const { error } = await supabase.from("progress").upsert({
        user_id: user,
        slug: body.slug,
        time: Math.round(body.time ?? 0),
        duration: Math.round(body.duration ?? 0),
        updated_at: new Date().toISOString(),
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    const item = body.item ?? {};
    const row = {
      user_id: user,
      slug: item.slug ?? "",
      title: item.title ?? "",
      poster_path: item.posterPath ?? "",
      release_date: item.releaseDate ?? "",
      quality: item.quality ?? "",
      country: item.country ?? "",
    };

    if (body.action === "delete") {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq("user_id", user)
        .eq("slug", row.slug);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    const { error } = await supabase.from(table).upsert(row, { onConflict: "user_id,slug" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
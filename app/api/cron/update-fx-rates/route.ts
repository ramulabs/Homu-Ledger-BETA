// GET /api/cron/update-fx-rates — RAM-25.
//
// Daily cron that fetches IDR-based FX rates from the free
// exchangerate-api.com v4 endpoint (no API key required) and upserts
// daily snapshots into the `fx_rates` table.
//
// Targeted currencies: the seven most common for Indonesian users:
//   USD, SGD, EUR, MYR, AUD, JPY, GBP
//
// Authentication: Vercel cron sends `Authorization: Bearer <CRON_SECRET>`.
// Requests without the header are rejected with 401.

import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { checkCronAuth } from "@/lib/cron-auth";

export const runtime = "nodejs";
// Always fetch live rates — no caching.
export const dynamic = "force-dynamic";

const TARGET_CURRENCIES = ["USD", "SGD", "EUR", "MYR", "AUD", "JPY", "GBP"];
const BASE_CURRENCY = "IDR";
const FX_API_URL = `https://api.exchangerate-api.com/v4/latest/${BASE_CURRENCY}`;

type ExchangeRateApiResponse = {
  base: string;
  date: string;
  rates: Record<string, number>;
};

export async function GET(req: NextRequest) {
  const authError = checkCronAuth(req);
  if (authError) return authError;

  // Fetch rates from the free exchangerate-api.com endpoint.
  let apiData: ExchangeRateApiResponse;
  try {
    const res = await fetch(FX_API_URL, {
      headers: { "Accept": "application/json" },
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `FX API returned ${res.status}` },
        { status: 502 }
      );
    }
    apiData = (await res.json()) as ExchangeRateApiResponse;
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Failed to fetch FX rates: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const admin = getAdminClient();

  const rows = TARGET_CURRENCIES
    .filter((target) => apiData.rates[target] != null)
    .map((target) => ({
      base: BASE_CURRENCY,
      target,
      rate: apiData.rates[target],
      date: today,
    }));

  if (rows.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No matching rates found in API response" },
      { status: 502 }
    );
  }

  const { error } = await admin
    .from("fx_rates")
    .upsert(rows, { onConflict: "base,target,date" });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    date: today,
    base: BASE_CURRENCY,
    upserted: rows.length,
    targets: rows.map((r) => r.target),
  });
}

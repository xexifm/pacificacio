import { NextResponse } from "next/server";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await storage.getBollardSettings();
    return NextResponse.json(settings);
  } catch (error: any) {
    console.error("[API] Get bollard settings error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await storage.getCameraSettings();
    return NextResponse.json(settings);
  } catch (error: any) {
    console.error("[API] Get camera settings error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

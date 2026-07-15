import { NextResponse } from "next/server";
import { z } from "zod";
import { storage } from "@/lib/storage";
import { insertCameraSettingsSchema } from "@/lib/schema";
import { isAuthenticated } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  try {
    const settings = await storage.getCameraSettings();
    return NextResponse.json(settings);
  } catch (error: any) {
    console.error("[API Admin] Get camera settings error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  try {
    const settingsArray = z.array(insertCameraSettingsSchema).parse(await req.json());
    await storage.updateCameraSettings(settingsArray);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[API Admin] Update camera settings error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { storage } from "@/lib/storage";
import { isAuthenticated } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  try {
    console.log("[API Admin] Received refresh data request");
    const result = await storage.refreshDerivedData();
    console.log("[API Admin] Refresh data complete");
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[API Admin] Error refreshing data:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

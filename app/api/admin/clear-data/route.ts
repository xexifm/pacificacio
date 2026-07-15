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
    console.log("[API Admin] Received clear data request");
    const result = await storage.clearAllData();
    console.log(`[API Admin] Clear data complete: ${result.deleted} records deleted`);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[API Admin] Error clearing data:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

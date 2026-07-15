import { NextResponse } from "next/server";
import { storage } from "@/lib/storage";
import { getBearerToken, isAuthenticated } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!(await isAuthenticated(req))) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const token = getBearerToken(req) || "";
    await storage.deleteAdminSession(token);

    console.log("[API Admin] Logout successful");
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[API Admin] Logout error:", error.message);
    return NextResponse.json({ error: "Logout failed" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_DURATION_HOURS = 24;

export async function POST(req: Request) {
  try {
    const { password } = await req.json();

    if (!password) {
      return NextResponse.json({ error: "Password is required" }, { status: 400 });
    }

    const isValid = await storage.verifyAdminPassword(password);
    if (!isValid) {
      console.log("[API Admin] Failed login attempt");
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000);

    await storage.createAdminSession(token, expiresAt);
    await storage.cleanExpiredSessions();

    console.log("[API Admin] Successful login");
    return NextResponse.json({ token, expiresAt: expiresAt.toISOString() });
  } catch (error: any) {
    console.error("[API Admin] Login error:", error.message);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}

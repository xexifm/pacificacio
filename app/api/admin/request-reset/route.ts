import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESET_TOKEN_DURATION_MINUTES = 30;

export async function POST() {
  try {
    const adminEmail = process.env.ADMIN_EMAIL;

    if (!adminEmail) {
      console.warn("[API Admin] Password reset requested but ADMIN_EMAIL not configured");
      return NextResponse.json({
        success: true,
        message: "If the email is registered, a reset link has been sent.",
      });
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + RESET_TOKEN_DURATION_MINUTES * 60 * 1000);

    await storage.createPasswordResetToken(token, expiresAt);

    const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
    const resetLink = `${baseUrl}/reset-password?token=${token}`;

    console.log("[API Admin] Password reset requested");
    console.log(`[API Admin] Reset link (for admin email ${adminEmail}): ${resetLink}`);
    console.log(`[API Admin] Token expires at: ${expiresAt.toISOString()}`);

    return NextResponse.json({
      success: true,
      message: "If the email is registered, a reset link has been sent.",
      _debug:
        process.env.NODE_ENV !== "production"
          ? { resetLink, expiresAt: expiresAt.toISOString() }
          : undefined,
    });
  } catch (error: any) {
    console.error("[API Admin] Password reset request error:", error.message);
    return NextResponse.json({ error: "Failed to process reset request" }, { status: 500 });
  }
}

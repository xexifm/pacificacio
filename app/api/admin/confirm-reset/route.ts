import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { token, newPassword } = await req.json();

    if (!token || !newPassword) {
      return NextResponse.json({ error: "Token and new password are required" }, { status: 400 });
    }

    if (newPassword.length < 4) {
      return NextResponse.json({ error: "Password must be at least 4 characters" }, { status: 400 });
    }

    const isValid = await storage.validatePasswordResetToken(token);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid or expired reset token" }, { status: 400 });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await storage.setAdminPasswordHash(hash);
    await storage.markPasswordResetUsed(token);

    console.log("[API Admin] Password reset successful");
    return NextResponse.json({ success: true, message: "Password has been reset successfully" });
  } catch (error: any) {
    console.error("[API Admin] Password reset confirmation error:", error.message);
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }
}

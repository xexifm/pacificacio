import { NextResponse } from "next/server";
import { storage } from "@/lib/storage";
import { isAuthenticated } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  try {
    const { bollardStartDatePedro, bollardStartDateGavarra } = await req.json();
    await storage.setBollardSettings({
      bollardStartDatePedro: bollardStartDatePedro || null,
      bollardStartDateGavarra: bollardStartDateGavarra || null,
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[API Admin] Update bollard settings error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

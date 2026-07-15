import { NextResponse } from "next/server";
import { z } from "zod";
import { storage } from "@/lib/storage";
import { insertTrafficDataSchema } from "@/lib/schema";
import { isAuthenticated } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await storage.getAllTrafficData();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  try {
    const body = await req.json();
    console.log(`[API] Received traffic data upload request with ${body?.length || 0} records`);
    const dataArray = z.array(insertTrafficDataSchema).parse(body);
    console.log(`[API] Validation passed, processing ${dataArray.length} records`);

    const result = await storage.insertTrafficData(dataArray);

    console.log(`[API] Upload complete: ${result.inserted} inserted, ${result.skipped} skipped`);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[API] Error processing traffic data:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

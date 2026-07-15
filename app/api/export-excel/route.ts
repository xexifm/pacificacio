import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { storage } from "@/lib/storage";
import { isAuthenticated } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isAuthenticated(req))) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  try {
    console.log("[API] Excel export requested");

    const trafficData = await storage.getAllTrafficData();
    const cameraSettings = await storage.getCameraSettings();

    const cameraToNeighbourhood: Record<string, string> = {};
    cameraSettings.forEach((s) => {
      cameraToNeighbourhood[s.cameraId] = s.neighbourhood;
    });

    const excelData = trafficData.map((row) => {
      const dateObj = new Date(row.dateTime);
      const date = dateObj.toISOString().slice(0, 10);
      const time = dateObj.toISOString().slice(11, 16);

      return {
        camera: row.camera,
        barri: cameraToNeighbourhood[row.camera] || row.neighbourhood || "Desconegut",
        date,
        time,
        vehicle_type: row.tipusVehicle,
        quantity: row.valor,
      };
    });

    excelData.sort((a, b) => {
      if (a.camera !== b.camera) return a.camera.localeCompare(b.camera);
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.time !== b.time) return a.time.localeCompare(b.time);
      return a.vehicle_type.localeCompare(b.vehicle_type);
    });

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    worksheet["!cols"] = [
      { wch: 8 },
      { wch: 12 },
      { wch: 12 },
      { wch: 8 },
      { wch: 14 },
      { wch: 10 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Dades_Transit");

    const excelBuffer: Buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    // Wrap in a plain Uint8Array so it satisfies the web BodyInit type.
    const body = new Uint8Array(excelBuffer);

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `transit_cornella_${timestamp}.xlsx`;

    console.log(`[API] Excel export complete: ${excelData.length} records exported`);

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error("[API] Excel export error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

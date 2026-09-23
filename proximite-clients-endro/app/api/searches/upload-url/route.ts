import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function adminCode() {
  return process.env.ADMIN_CODE || process.env.ACCESS_CODE || "";
}

// Handshake pour l'upload direct du CSV vers Vercel Blob (contourne la limite
// de taille des fonctions serverless). Le code d'accès admin est vérifié ici.
export async function POST(req: Request): Promise<NextResponse> {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const code = adminCode();
        if (!code) throw new Error("ADMIN_CODE non défini côté serveur.");
        if (clientPayload !== code) throw new Error("Code d'accès admin invalide.");
        return {
          allowedContentTypes: ["text/csv", "application/vnd.ms-excel", "text/plain"],
          addRandomSuffix: true,
          maximumSizeInBytes: 60 * 1024 * 1024,
        };
      },
      onUploadCompleted: async () => {
        // L'ingestion est déclenchée par le client après l'upload.
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 400 });
  }
}

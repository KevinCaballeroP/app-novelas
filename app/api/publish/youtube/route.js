import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { title, description, videoUrl } = await req.json();

    if (!videoUrl) {
      return NextResponse.json({ error: "Falta videoUrl" }, { status: 400 });
    }

    // Aquí luego conectarás OAuth + YouTube Data API videos.insert
    return NextResponse.json({
      ok: true,
      message: "Endpoint base de YouTube listo. Falta conectar OAuth y subida real.",
      title,
      description,
      videoUrl,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Error publicando en YouTube" },
      { status: 500 }
    );
  }
}
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { title, description, videoUrl } = await req.json();

    if (!videoUrl) {
      return NextResponse.json({ error: "Falta videoUrl" }, { status: 400 });
    }

    // Aquí luego conectarás OAuth + TikTok Content Posting API
    return NextResponse.json({
      ok: true,
      message: "Endpoint base de TikTok listo. Falta conectar OAuth y publicación real.",
      title,
      description,
      videoUrl,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Error publicando en TikTok" },
      { status: 500 }
    );
  }
}
import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import path from "path";
import os from "os";

export const runtime = "nodejs";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// =========================
// 🧠 CONSTRUIR NARRACIÓN
// =========================
function buildNarration(pages = []) {
  const lines = [];

  for (const page of pages) {
    const panels = Array.isArray(page.panels) ? page.panels : [];
    for (const panel of panels) {
      if (panel.dialogue?.trim()) {
        lines.push(panel.dialogue.trim());
      }
    }
  }

  return lines.join(". ");
}

// =========================
// 📥 DESCARGAR ARCHIVO
// =========================
async function downloadFile(url, outputPath) {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`No se pudo descargar: ${url}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
}

// =========================
// 🎤 GENERAR VOZ
// =========================
export async function POST(req) {
  try {
    const { title, pages = [] } = await req.json();

    if (!pages.length) {
      return NextResponse.json(
        { error: "No hay páginas para narrar" },
        { status: 400 }
      );
    }

    const narration = buildNarration(pages);

    if (!narration.trim()) {
      return NextResponse.json(
        { error: "No hay diálogos para narrar" },
        { status: 400 }
      );
    }

    // =========================
    // 🔊 LLAMAR FASTAPI (EDGE TTS)
    // =========================
    const voiceRes = await fetch("http://localhost:8000/generate-voice", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: narration }),
    });

    if (!voiceRes.ok) {
      throw new Error("Error generando voz en FastAPI");
    }

    const data = await voiceRes.json();

    const audioUrlFromFastAPI = data.audio_url;

    if (!audioUrlFromFastAPI) {
      throw new Error("FastAPI no devolvió audio_url");
    }

    // =========================
    // 📁 GUARDAR EN TEMP
    // =========================
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "manga-voice-")
    );

    const finalAudioPath = path.join(tempDir, "voice.mp3");

    // descargar el mp3 desde FastAPI
    await downloadFile(audioUrlFromFastAPI, finalAudioPath);

    // =========================
    // ☁️ SUBIR A CLOUDINARY
    // =========================
    const uploadRes = await cloudinary.uploader.upload(finalAudioPath, {
      resource_type: "video",
      folder: "manga_audio",
      public_id: `${title
        .replace(/\s+/g, "_")
        .toLowerCase()}_voice_${Date.now()}`,
    });

    return NextResponse.json({
      ok: true,
      audioUrl: uploadRes.secure_url,
    });
  } catch (err) {
    console.error("ERROR GENERATE VOICE:", err);

    return NextResponse.json(
      { error: err.message || "Error generando voz" },
      { status: 500 }
    );
  }
}
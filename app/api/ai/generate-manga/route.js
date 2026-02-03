import Groq from "groq-sdk";
import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/mongodb";
import { v2 as cloudinary } from "cloudinary";
import fetch from "node-fetch";

export const runtime = "nodejs";

// ================= CLOUDINARY =================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ================= GROQ =================
const client = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// ================= SUBIR BASE64 A CLOUDINARY =================
async function uploadMangaImage(base64, page, panel) {
  const upload = await cloudinary.uploader.upload(
    `data:image/png;base64,${base64}`,
    {
      folder: "mangas",
      public_id: `page_${page}_panel_${panel}`,
    }
  );

  return upload.secure_url;
}

// ================= GENERAR IMAGEN =================
async function generateImage(imagePrompt) {
  const res = await fetch("http://localhost:8000/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: imagePrompt }),
  });

  if (!res.ok) {
    throw new Error("FastAPI no respondió correctamente");
  }

  const data = await res.json();
  return data.image;
}

// ================= API PRINCIPAL =================
export async function POST(req) {
  try {
    await connectToDB();

    // 🔥 NUEVO: recibimos previousPages
    const { title, prompt, previousPages = [] } = await req.json();

    if (!prompt) {
      throw new Error("Prompt de manga vacío");
    }

    // ================= GUIÓN MANGA =================
    const scriptPrompt = `
Eres un generador de manga en formato JSON.
Devuelve SOLO JSON válido. Nada de texto adicional.

Formato EXACTO:
{
  "pages": [
    {
      "page": number,
      "panels": [
        {
          "dialogue": "texto breve",
          "imagePrompt": "descripción visual detallada"
        }
      ]
    }
  ]
}

CONTEXTO PREVIO (NO repetir escenas):
${previousPages.length ? JSON.stringify(previousPages, null, 2) : "No hay páginas previas"}

REGLAS IMPORTANTES:
- CONTINUAR la historia desde la última página existente
- NO reiniciar la historia
- NO repetir escenas, encuadres ni eventos
- 1 a 3 paneles por página
- diálogos cortos
- NO incluir texto dentro de la imagen
- estilo manga oscuro, cultivadores, fantasía oriental

Nueva parte de la historia:
${prompt}
`;

    const scriptRes = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: scriptPrompt }],
      temperature: 0.6,
    });

    let script = scriptRes.choices[0].message.content.trim();
    script = script.replace(/^[^{]+/, "").replace(/[^}]+$/, "");

    let pages;
    try {
      pages = JSON.parse(script).pages;
    } catch (e) {
      console.error("JSON inválido:", script);
      throw new Error("La IA no devolvió JSON válido");
    }

    // ================= IMÁGENES + CLOUDINARY =================
    for (const page of pages) {
      let panelIndex = 1;

      for (const panel of page.panels) {

        // 🔥 NUEVO: variación visual forzada
        const angles = [
          "close-up",
          "wide shot",
          "low angle",
          "high angle",
          "dynamic perspective"
        ];
        const angle = angles[Math.floor(Math.random() * angles.length)];

        const finalPrompt = `
${panel.imagePrompt},
${angle},
cinematic lighting,
dramatic shadows,
unique composition,
no repeated scenes,
manga cultivation style
`;

        const base64 = await generateImage(finalPrompt);

        const imageUrl = await uploadMangaImage(
          base64,
          page.page,
          panelIndex
        );

        panel.image = imageUrl;
        panelIndex++;
      }
    }

    return NextResponse.json({
      title,
      pages,
    });

  } catch (err) {
    console.error("❌ MANGA IA ERROR:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}

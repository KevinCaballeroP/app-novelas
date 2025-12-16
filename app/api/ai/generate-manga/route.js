import Groq from "groq-sdk";
import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/mongodb";
import fetch from "node-fetch";
import FormData from "form-data";

export const runtime = "nodejs";

const client = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// ======= IA PARA IMAGENES =======
async function generateImage(prompt) {
  // 1) Traducir el prompt a inglés antes de enviarlo a Stability
  const translateRes = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "user",
        content: `
Traduce este prompt de manga al INGLÉS. SOLO responde el texto traducido, sin explicaciones ni comillas.
Prompt:
${prompt}
`
      }
    ],
    temperature: 0,
  });

  const englishPrompt = translateRes.choices[0].message.content.trim();

  const formData = new FormData();
  formData.append("prompt", englishPrompt);
  formData.append("aspect_ratio", "1:1");
  formData.append("output_format", "png");

  const res = await fetch(
    "https://api.stability.ai/v2beta/stable-image/generate/sd3",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.STABILITY_KEY}`,
        Accept: "application/json",
        ...formData.getHeaders()
      },
      body: formData,
    }
  );

  const text = await res.text();

  try {
    const json = JSON.parse(text);

    if (!json.image) {
      console.error("STABILITY JSON ERROR:", json);
      throw new Error("Stability no devolvió 'image'");
    }

    return json.image;

  } catch (e) {
    console.error("⚠️ Stability devolvió texto NO JSON:");
    console.error(text);
    throw new Error("Respuesta no válida de Stability AI (no es JSON).");
  }
}



// ========================================================================

export async function POST(req) {
  try {
    await connectToDB();

    const { title, description, chapters } = await req.json();

    const chapterText = chapters
      .map((c, i) => `Capítulo ${i + 1}:\n${c.content}`)
      .join("\n\n");

    // ===== 1) Generar GUIÓN MANGA =====
    const scriptPrompt = `
Eres un generador de JSON. 
Tu única salida debe ser un JSON ESTRICTAMENTE válido.

Convierte la historia en páginas de manga.

⚠️ REGLAS IMPORTANTES:
- NO escribas comentarios, explicaciones, ni texto antes o después del JSON.
- No uses "¡", ni introduzcas texto en español introductorio.
- NO digas frases como "Aquí tienes".
- SOLO responde con el JSON final.
- Si no sabes qué poner, usa strings vacíos "".

Formato obligatorio EXACTO:

{
  "pages": [
    {
      "page": 1,
      "panels": [
        {
          "dialogue": "texto breve",
          "imagePrompt": "descripción de la escena"
        }
      ]
    }
  ]
}

Historia:
${chapterText}
`;

    const scriptRes = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: scriptPrompt }],
      temperature: 0.6,
    });

    // ============ ⬇️ NUEVO BLOQUE QUE DEBES PONER AQUÍ ⬇️ ============

    let script = scriptRes.choices[0].message.content.trim();

    // Quitar texto basura ANTES del JSON
    script = script.replace(/^[^{]+/, "");

    // Quitar texto basura DESPUÉS del JSON
    script = script.replace(/[^}]+$/, "");

    let pages;
    try {
      const json = JSON.parse(script);
      pages = json.pages;
    } catch (e) {
      console.log("JSON RAW FROM GROQ:", script);
      throw new Error("La IA no regresó JSON válido");
    }

    // ============ ⬆️ FIN DEL BLOQUE NUEVO ⬆️ ============


    // ===== 2) GENERAR IMAGENES POR VIÑETA =====
    for (const page of pages) {
      for (const panel of page.panels) {
        const img = await generateImage(panel.imagePrompt);
        panel.image = img;
      }
    }

    return NextResponse.json({ pages });

  } catch (err) {
    console.error("AI MANGA ERROR:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

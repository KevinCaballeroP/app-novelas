import Groq from "groq-sdk";
import { NextResponse } from "next/server";
import { connectToDB as connectDB } from "@/lib/mongodb";
import AuthorStyle from "@/models/AuthorStyle";

export const runtime = "nodejs";   

const client = new Groq({
    apiKey: process.env.GROQ_API_KEY 
});

export async function POST(req) {
    try{
        await connectToDB();
        const { novelId, chapters = [], metadata = {}, imageUrl } = await req.json();
        if(!novelId) {
            return NextResponse.json({ error: "novelId is required" }, { status: 400 });
        }
        if(!chapters.length) {
            return NextResponse.json({ error: "Chapters are required" }, { status: 400 });
        }
        const text = chapters.map((c) => c.content).join("\n\n");
    
       const prompt = `
Eres un analista literario experto.

Analiza los siguientes textos del autor y genera un **perfil de estilo** altamente detallado que describa:

- Ritmo narrativo
- Complejidad de oraciones
- Vocabulario característico
- Tono emocional
- Tratamiento de diálogos
- Manejo de descripciones
- Forma de presentar acción
- Estructura habitual de párrafos
- Repeticiones o tics literarios
- Temas recurrentes
- Tipo de narrador (si aplica)
- Cualquier rasgo relevante

IMPORTANTE:
- El perfil debe ser conciso (200–350 palabras).
- NO reescribas partes del texto del autor.
- NO incluyas explicaciones ni advertencias.
- Solo entrega el perfil.

Textos del autor:
${samples.join("\n\n---\n\n")}
`;

         const res = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "Responde SOLO JSON válido." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    });
    const raw = res.choices[0].message.content;
    styleJson = null;
    try {
         styleJson = JSON.parse(raw);
    }catch {
         const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("No se pudo extraer JSON del estilo");
      styleJson = JSON.parse(match[0]);
    }
     styleJson.__meta = {
      createdAt: new Date().toISOString(),
      imageUrl: imageUrl || null,
      metadata,
    };
     // 👉 Guardar o actualizar en Mongo
    await AuthorStyle.findOneAndUpdate(
      { novelId },
      { style: styleJson },
      { upsert: true }
    );

    return NextResponse.json({ ok: true, style: styleJson });
    } catch (err) {
    console.error("TRAIN ERROR:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
// api/generate-chapter/route.js
import Groq from "groq-sdk";
import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/mongodb";
import AuthorStyle from "@/models/AuthorStyle";

export const runtime = "nodejs";

const client = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Función para extraer el último párrafo útil
function extractLastParagraph(text) {
  const p = text
    .split("\n")
    .map((t) => t.trim())
    .filter((t) => t.length > 20);

  return p[p.length - 1] || text;
}

export async function POST(req) {
  try {
    await connectToDB();

    const { novelId, title, description, chapters, options = {} } =
      await req.json();

    if (!novelId)
      return NextResponse.json(
        { error: "novelId requerido" },
        { status: 400 }
      );

    if (!chapters?.length)
      return NextResponse.json(
        { error: "Debe haber mínimo 1 capítulo previo" },
        { status: 400 }
      );

    // Buscar estilo aprendido
    const styleDoc = await AuthorStyle.findOne({ novelId });
    const authorStyle = styleDoc?.style || null;

    const lastChapter = chapters[chapters.length - 1];
    const lastParagraph = extractLastParagraph(lastChapter.content);

    // Bloque de estilo
    const styleProfile = authorStyle
      ? JSON.stringify(authorStyle, null, 2)
      : null;

    const styleBlock = authorStyle
      ? `Estilo del autor (aplícalo exactamente):\n${styleProfile}\n`
      : "";

    // ===============================
    // GENERAR OUTLINE DEL CAPÍTULO
    // ===============================
    const outlinePrompt = `
Eres un escritor profesional.

${styleBlock}

Genera un OUTLINE de 4–6 puntos para el siguiente capítulo.

Debe continuar inmediatamente después del último párrafo:

"${lastParagraph}"

El outline debe avanzar la historia sin repetir eventos previos.
`;

    const outlineRes = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "Eres un escritor profesional." },
        { role: "user", content: outlinePrompt },
      ],
      temperature: 0.5,
    });

    const outline = outlineRes.choices[0].message.content.trim();

    // ===============================
    // GENERAR EL CAPÍTULO COMPLETO
    // ===============================
    // Usar solo los últimos 2 capítulos para evitar exceso de tokens
const contextChapters = chapters.slice(-2);
    const chapterPrompt = `

Eres un escritor profesional especializado en novelas ligeras, fantasía y ciencia ficción.

${styleBlock}

Tu tarea es escribir el **siguiente capítulo** de esta novela.
Debes continuar EXACTAMENTE donde terminó el capítulo anterior.
No repitas nada ya dicho.

Título de la novela:
${title}

Descripción:
${description}

Capítulos anteriores (contexto):
${contextChapters
  .map(
    (c, index) =>
      `Capítulo ${chapters.length - contextChapters.length + index + 1}:\n${c.content}`
  )
  .join("\n\n---\n\n")}


OUTLINE para este capítulo:
${outline}

Reglas estrictas:
1. No repitas contenido previo ni resumas capítulos anteriores.
2. Mantén fidelidad TOTAL al estilo del autor.
3. Sigue el outline, pero mejora la narrativa si es necesario.
4. Mínimo ${options.minWords || 600} palabras, máximo ${
      options.maxWords || 1000
    }.
5. Devuelve SOLO este formato:

Título: [título del capítulo]
Contenido:
[texto del capítulo]
`;

    const chapterRes = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "Devuelve SOLO el capítulo." },
        { role: "user", content: chapterPrompt },
      ],
      temperature: options.temperature ?? 0.7,
    });

    const chapter = chapterRes.choices[0].message.content.trim();

    return NextResponse.json({ outline, chapter });
  } catch (err) {
    console.error("AI ERROR:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

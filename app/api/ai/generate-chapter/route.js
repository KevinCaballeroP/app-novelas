import Groq from "groq-sdk";

export const runtime = "nodejs";

const client = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// --- Utilidades --------------------------------------------------

async function generateSummary(chapters) {
  if (chapters.length === 0) return "No hay capítulos previos.";

  const text = chapters.map((c, i) => `Cap ${i + 1}: ${c.content}`).join("\n\n");

  const prompt = `
Resume la siguiente novela en máximo 15 puntos claros. 
No describas cada capítulo, solo los eventos globales más importantes:
${text}
  `;

  const res = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
  });

  return res.choices[0].message.content;
}

function extractLastParagraph(text) {
  const paragraphs = text.trim().split("\n").filter(p => p.length > 40);
  return paragraphs[paragraphs.length - 1] || text.slice(-200);
}

// ------------------------------------------------------------------

export async function POST(req) {
  try {
    const { title, description, chapters } = await req.json();

    // === 1) RESUMEN DE LA HISTORIA (excepto el último capítulo) ===
    const previousChapters = chapters.slice(0, -1);
    const lastChapter = chapters[chapters.length - 1];

    const summary = await generateSummary(previousChapters);
    const lastParagraph = extractLastParagraph(lastChapter.content);

    // === 2) PASO 1: Generar outline sólido ==========================
    const outlinePrompt = `
        Eres un escritor profesional que crea novelas ligeras de fantasía y ciencia ficción.

        NOVELA:
        Título: ${title}

        RESUMEN DE LA HISTORIA:
        ${summary}

        ÚLTIMO PÁRRAFO DEL CAPÍTULO ANTERIOR:
        "${lastParagraph}"

        TAREA:
        Crea un **esquema detallado (outline)** del próximo capítulo.
        Debe incluir:

        - 4–7 puntos clave
        - Conflicto principal
        - Evolución emocional de los personajes
        - Giro o revelación del final del capítulo
        - Clímax
        Formato:

        Outline:
        - punto 1
        - punto 2
        - punto 3
...
    `;

    const outlineCompletion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "Eres un escritor profesional altamente consistente." },
        { role: "user", content: outlinePrompt },
      ],
      temperature: 0.5,
    });

    const outline = outlineCompletion.choices[0].message.content;

    // === 3) PASO 2: Generar el capítulo completo =====================
    const chapterPrompt = `
Eres un escritor profesional de novelas ligeras, fantasía y ciencia ficción.

DATOS DE LA NOVELA
Título: ${title}
Descripción: ${description}

RESUMEN GLOBAL DE LA HISTORIA:
${summary}

ÚLTIMO PÁRRAFO DEL CAPÍTULO ANTERIOR:
"${lastParagraph}"

ESQUEMA DEL/NUEVO CAPÍTULO (obligatorio seguir):
${outline}

TAREA:
Escribe ahora el capítulo completo, siguiendo EXACTAMENTE el outline.
Entre 600 y 1000 palabras.

REGLAS IMPORTANTES:
1. No repitas ningún contenido previo.
2. Debes continuar exactamente donde quedó el último capítulo.
3. Mantén coherencia, estilo y ritmo.
4. Evita frases idénticas a capítulos anteriores.
5. El capítulo debe terminar con un gancho narrativo fuerte.

FORMATO OBLIGATORIO:

Título: [título del capítulo]

Contenido:
[contenido en múltiples párrafos]
    `;

    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "Eres un escritor profesional experto en continuidad narrativa." },
        { role: "user", content: chapterPrompt },
      ],
      temperature: 0.7,
      top_p: 0.9,
    });

    const chapter = completion.choices[0].message.content;

    return Response.json({
      outline,
      chapter,
    });

  } catch (error) {
    console.error("AI ERROR:", error);
    return Response.json({ error: "Error generando capítulo" }, { status: 500 });
  }
}

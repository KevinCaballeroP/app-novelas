import Groq from "groq-sdk";
import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/mongodb";

import {
  getStoryProfile,
  buildOpeningHook,
  splitStoryIntoGenerationBlocks,
  rewriteStoryAsMangaDirector,
  parseStoryboardJson,
  forceLiteralEnvironmentPrompt,
  generateStyleSeed,
  getMangaStyle,
  getDefaultPanelAnimation,
  inferWorldMode,
} from "@/app/api/ai/generate-manga/route";

export const runtime = "nodejs";

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req) {
  try {
    await connectToDB();

    const {
      title,
      prompt,
      previousPages = [],
      contentProfile = "manga_long",
      chapterNumber = 1,
    } = await req.json();

    if (!title?.trim()) {
      return NextResponse.json({ error: "Título requerido" }, { status: 400 });
    }
    if (!prompt?.trim()) {
      return NextResponse.json({ error: "Prompt requerido" }, { status: 400 });
    }

    const safePrompt = String(prompt)
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/"/g, "'")
      .replace(/\r/g, " ")
      .replace(/\n/g, " ");

    const storyProfile = getStoryProfile(contentProfile);
    const baseStyleSeed = generateStyleSeed(title);
    const openingHook = buildOpeningHook(title, prompt);

    const mangaDirector = await rewriteStoryAsMangaDirector({
      title,
      safePrompt,
      storyProfile,
      previousPages,
      openingHook,
    });

    const storyBlocks = splitStoryIntoGenerationBlocks(safePrompt, 450);

    let allPages = [];
    let continuityPages = previousPages || [];

    for (let blockIndex = 0; blockIndex < storyBlocks.length; blockIndex++) {
      const blockPrompt = `
Generate a dark seinen manga storyboard for ${storyProfile.storyboardFormat}.

Return ONLY valid JSON.

{
  "pages":[
    {
      "page":1,
      "panels":[
        {
          "type":"narration | speech | thought",
          "dialogue":"",
          "imagePrompt":"",
          "characters":[],
          "sceneFocus":"environment | object_focus | single_character | two_characters | group_scene | character_in_environment | creature_focus",
          "panelKind":"panoramic_top | dialogue | emotional_closeup | action | standard",
          "viewAngle":"front | profile | back",
          "worldMode":"modern_world | tower_emergence | cultivation_world | inside_tower | combat",
          "animation": {
            "camera":"slow_push | fast_zoom | side_pan | vertical_pan | impact_zoom | orbit_feel",
            "motion":"idle | dialogue | tension | action | burst | reveal | environment_drift",
            "transition":"fade | cut | flash | blur_cut",
            "frameHint":"single | multi_3 | multi_5",
            "duration":1.8,
            "intensity":0.35
          },
          "directorIntent":"",
          "emotionalBeat":"",
          "visualPriority":"low | medium | high",
          "veoCandidate":false,
          "veoPrompt":""
        }
      ]
    }
  ]
}

WORLDMODE RULES — assign the correct worldMode per panel:
- "modern_world": panels set before the towers appeared. Modern city, university, streets, television, cellphones, year 2025, normal human world. NO xianxia, NO wuxia, NO cultivator robes.
- "tower_emergence": panels where the Seven Towers appear, emerge from the ground, or cause a global event. Modern city + ancient towers. Light beams, chosen ones.
- "cultivation_world": panels inside cultivation sects, xianxia world, wuxia training, spiritual arenas, after the tower world is established.
- "inside_tower": panels inside the tower, dungeons, portals, trial chambers, mysterious rooms, monster floors.
- "combat": any panel with attacks, fights, monster battles, power release, explosions, spiritual combat, aura, ability use.

RULES:
- This is block ${blockIndex + 1} of ${storyBlocks.length}.
- Adapt ONLY CURRENT BLOCK.
- Do not jump ahead.
- Do not restart the story.
- Keep continuity with previous pages.
- Generate 3 to 5 pages for this block.
- Each page should contain 2 to 3 panels.
- Every panel must visually match its dialogue.
- imagePrompt must describe ONLY what is visible.
- characters must include only characters visible in the panel.
- Environment panels must use characters: [].
- Object panels must use characters: [].
- If the text describes towers, objects, cities, crowds, portals or environment, do NOT force Kelvin or another character unless the text says he is visible.
- Important cinematic scenes may use veoCandidate=true.
- veoPrompt must describe motion only.
- Return valid JSON only. No markdown.

Previous pages continuity:
${continuityPages.length ? JSON.stringify(continuityPages).slice(0, 6000) : "[]"}

DIRECTOR CONTEXT:
${mangaDirector.adaptedStory}

MUST SHOW:
${mangaDirector.mustShow.map((x) => `- ${x}`).join("\n")}

CURRENT BLOCK:
${storyBlocks[blockIndex]}
`;

      const blockRes = await client.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        temperature: 0.2,
        messages: [{ role: "user", content: blockPrompt }],
      });

      const blockStoryboard = parseStoryboardJson(
        blockRes.choices[0].message.content
      );
      const blockPages = Array.isArray(blockStoryboard.pages)
        ? blockStoryboard.pages
        : [];

      allPages.push(...blockPages);
      continuityPages = [...continuityPages, ...blockPages].slice(-6);
    }

    // Normalizar páginas y asignar números secuenciales
    const pages = allPages.map((page, index) => ({
      ...page,
      page: index + 1,
    }));

    // Normalizar paneles: limpiar campos y rellenar defaults
    for (const page of pages) {
      for (const panel of page.panels || []) {
        panel.type = panel.type || "narration";
        panel.dialogue = String(panel.dialogue || "").trim();
        panel.imagePrompt = String(panel.imagePrompt || "").trim();
        panel.characters = Array.isArray(panel.characters)
          ? panel.characters
          : [];

        forceLiteralEnvironmentPrompt(panel);

        panel.viewAngle =
          panel.viewAngle ||
          (panel.imagePrompt.toLowerCase().includes("espalda") ||
          panel.imagePrompt.toLowerCase().includes("de espaldas")
            ? "back"
            : panel.imagePrompt.toLowerCase().includes("de perfil") ||
              panel.imagePrompt.toLowerCase().includes("profile")
            ? "profile"
            : "front");

        // Rellenar diálogo vacío
        if (!panel.dialogue) {
          if (storyProfile.mode === "tiktok") {
            if (panel.type === "thought") panel.dialogue = "Algo no estaba bien.";
            else if (panel.type === "speech") panel.dialogue = "Es demasiado tarde.";
            else panel.dialogue = "La torre respondió.";
          } else {
            if (panel.type === "thought") panel.dialogue = "Algo cambió en el ambiente.";
            else if (panel.type === "speech") panel.dialogue = "Esto apenas comienza.";
            else panel.dialogue = "La tensión crecía en silencio.";
          }
        }

        // Defaults para campos de storyboard
        panel.animation = {
          ...getDefaultPanelAnimation(panel),
          ...(panel.animation || {}),
        };
        panel.directorIntent = String(panel.directorIntent || "").trim() ||
          "Clear manga storytelling beat.";
        panel.emotionalBeat = String(panel.emotionalBeat || "").trim() ||
          "tension";
        panel.visualPriority = String(panel.visualPriority || "medium").trim();
        panel.veoCandidate =
          typeof panel.veoCandidate === "boolean" ? panel.veoCandidate : false;
        panel.veoPrompt = String(panel.veoPrompt || "").trim();

        // worldMode: use Groq value if valid, else infer from text
        const validWorldModes = [
          "modern_world",
          "tower_emergence",
          "cultivation_world",
          "inside_tower",
          "combat",
        ];
        if (!panel.worldMode || !validWorldModes.includes(panel.worldMode)) {
          panel.worldMode = inferWorldMode(panel.dialogue, panel.imagePrompt);
        }

        if (!panel.veoPrompt && panel.veoCandidate) {
          panel.veoPrompt = `
Animate this manga panel with subtle cinematic motion.
Keep the same character identity, same outfit, same composition and same dark seinen manga style.
Move aura particles, hair, clothing and camera slightly.
Do not add new characters.
Do not change the face.
Do not change the scene.
`.trim();
        }

        // Campos de imagen vacíos hasta que el usuario genere
        panel.imageUrl = "";
        panel.approved = false;
        panel.finalPrompt = "";
        panel.renderMeta = null;
        panel.generatedFrames = [];
        panel.manualVideoUrl = panel.manualVideoUrl || "";
      }
    }

    // Convertir a formato de páginas compatible con el frontend (pageNumber + panels con order)
    const normalizedPages = pages.map((page, pageIndex) => ({
      pageNumber: pageIndex + 1,
      panels: (page.panels || []).map((panel, panelIndex) => ({
        ...panel,
        order: panelIndex + 1,
      })),
    }));

    return NextResponse.json({
      title,
      chapterNumber,
      storyMode: storyProfile.mode,
      contentProfile,
      pages: normalizedPages,
    });
  } catch (err) {
    console.error("❌ /api/manga/storyboard error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

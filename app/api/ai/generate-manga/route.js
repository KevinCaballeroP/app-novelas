import Groq from "groq-sdk";
import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/mongodb";
import { v2 as cloudinary } from "cloudinary";
import fetch from "node-fetch";
import Character from "@/models/Character";

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

// ================= BUSCAR PERSONAJE =================
async function findCharacter(mangaTitle, name) {
  return await Character.findOne({ mangaTitle, name });
}

// ================= GENERAR SEED =================
function generateCharacterSeed(name) {
  let hash = 0;

  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }

  return Math.abs(hash) % 100000000;
}

function generateStyleSeed(title) {
  let hash = 0;

  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }

  return Math.abs(hash) % 100000000;
}

function generatePairSeed(seedA, seedB) {
  const a = Number(seedA || 0);
  const b = Number(seedB || 0);

  const minSeed = Math.min(a, b);
  const maxSeed = Math.max(a, b);

  return Number(String(minSeed) + String(maxSeed).slice(-4)) % 100000000;
}

function sanitizeTwoCharacterText(text) {
  return String(text || "")
    .replace(/holding hands/gi, "standing apart")
    .replace(/hold hands/gi, "standing apart")
    .replace(/hand in hand/gi, "standing apart")
    .replace(/touching hands/gi, "hands separated")
    .replace(/touching/gi, "facing each other")
    .replace(/embrace/gi, "standing apart")
    .replace(/embracing/gi, "standing apart")
    .replace(/hug/gi, "standing apart")
    .replace(/hugging/gi, "standing apart")
    .replace(/romantic/gi, "serious")
    .replace(/couple/gi, "two characters")
    .replace(/intimate/gi, "serious")
    .replace(/close together/gi, "with visible space between them");
}

// ================= NORMALIZAR NOMBRE =================
function normalizeName(name) {
  return String(name || "").trim();
}

// ================= CREAR PERSONAJE =================
async function createOrUpdateCharacter(mangaTitle, name, description, stylePreset) {
  const cleanName = normalizeName(name);
  const seed = generateCharacterSeed(cleanName);

  const res = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    temperature: 0.2,
    messages: [
      {
        role: "user",
        content: `
Create a CONSISTENT manga character identity profile.

Rules:
- Keep the design reusable across many scenes.
- Clothing must be practical and story-appropriate.
- No bikinis, underwear or sexualized outfit.
- If the context suggests a female character, keep feminine anatomy and face.
- If the context suggests a male character, keep masculine anatomy and face.
- If the story has cultivation / xianxia tone, prefer layered robes, martial attire, mystical details.

Name: ${cleanName}
Context: ${description}

Return ONLY JSON:

{
  "gender":"",
  "age":"",
  "hair":"",
  "face":"",
  "body":"",
  "default_clothing":"",
  "personality":"",
  "archetype":""
}
`
      }
    ]
  });

  let profile = res.choices[0].message.content;
  profile = profile.replace(/^[^{]+/, "").replace(/[^}]+$/, "");
  profile = JSON.parse(profile);

  const personalityBlock = buildPersonalityBlock(
    profile.personality,
    profile.archetype
  );

  let gender = profile.gender?.toLowerCase() || "male";
  const textLower = description.toLowerCase();
  const lowerName = cleanName.toLowerCase();

  const femaleNames = ["karol", "sofia", "anna", "lucia", "maria", "sara"];
  const maleNames = ["kelvin", "uryan", "juan", "carlos", "miguel", "cristian"];

  if (
    textLower.includes(" ella ") ||
    textLower.includes("she ") ||
    textLower.includes("joven mujer") ||
    textLower.includes("la chica") ||
    textLower.includes("hermosa")
  ) {
    gender = "female";
  }

  if (
    textLower.includes(" él ") ||
    textLower.includes("he ") ||
    textLower.includes("joven hombre") ||
    textLower.includes("el joven")
  ) {
    gender = "male";
  }

  if (femaleNames.includes(lowerName)) gender = "female";
  if (maleNames.includes(lowerName)) gender = "male";

  const isFemale = gender === "female";
  const isKarol = lowerName === "karol";
  const isKelvin = lowerName === "kelvin";

  const genderLock = isFemale
    ? "(1girl:1.6), solo, adult woman, feminine face, natural female anatomy, no male traits"
    : "(1man:1.8), solo, adult man, masculine face, strong jawline, natural male anatomy, no female traits, no feminine traits";

  const anatomyLock = isFemale
    ? `
female anatomy,
natural female proportions,
soft feminine features,
fully dressed
`
    : `
male anatomy,
strong masculine jawline,
broad shoulders,
flat chest,
no feminine features,
no soft face,
no androgynous face,
clear male face structure,
fully dressed
`;

  const clothingLock = stylePreset === "dark_cultivator"
    ? `
cultivator robes,
layered martial attire,
long sleeves,
high collar,
belt,
boots,
eastern fantasy clothing,
spiritual sect aesthetic,
elegant but practical outfit,
fully dressed,
non sexualized design
`
    : `
practical outfit,
normal clothing,
story appropriate clothing
`;

  let identityPrompt = `
${genderLock},
${cleanName},
${anatomyLock},
${profile.age || ""},
${profile.hair || ""},
${profile.face || ""},
${profile.body || ""},
${profile.default_clothing || ""},
${clothingLock},
${personalityBlock},
consistent character design,
same face structure,
same exact face,
same eyes,
same hairstyle,
recognizable face,
character consistency lock,
same body type,
recognizable hairstyle,
modest clothing,
story appropriate costume,
no revealing outfit,
`;

  if (isKarol) {
    identityPrompt += `
beautiful detailed eyes,
refined feminine face,
full face visible,
head fully visible,
face not cropped,
long straight chestnut brown hair,
chestnut hair,
brown hair,
same hair color,
same exact hairstyle,
fair skin,
golden brown eyes,
same exact face,
recognizable feminine face,
elegant young woman,
no black hair,
no blonde hair,
no white hair,
no blue hair
`;
  }

  if (isKelvin) {
    identityPrompt += `
short black hair,
straight black hair,
dark eyes,
young handsome man,
clear masculine face,
strong jawline,
flat chest,
broad shoulders,
male student appearance,
same exact face,
same hair color,
same hairstyle,
no feminine face,
no androgynous traits
`;
  }

  return await Character.findOneAndUpdate(
    { mangaTitle, name: cleanName },
    {
      $set: {
        identityPrompt,
        seed,
        referenceImage: null,
        gender,
        visualStylePreset: stylePreset,
        profileVersion: 3
      }
    },
    {
      new: true,
      upsert: true
    }
  );
}

// ================= EXTRAER POSIBLES NOMBRES =================
function extractPossibleNames(text) {
  const stopWords = new Set([
    "Imagen",
    "Escena",
    "Capítulo",
    "Año",
    "Los",
    "Las",
    "El",
    "La",
    "Un",
    "Una",
    "Torre",
    "Torres",
    "Colombia",
    "Corea",
    "China",
    "Estados",
    "Portugal",
    "Japón",
    "Rusia",
    "Yopal",
    "Shi",
    "Aventureros",
    "Santo",
    "Universidad",
    "Diciembre",
    "Medellín",
    "Rango"
  ]);

  const matches = text.match(/\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\b/g) || [];
  const filtered = matches.filter(word => !stopWords.has(word));

  return [...new Set(filtered)];
}

// ================= SUBIR CLOUDINARY =================
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
async function generateImage(prompt, seed, styleSeed, gender, characterCount = 1, duoType = null) {
  const res = await fetch("http://localhost:8000/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      seed,
      styleSeed,
      gender,
      characterCount,
      duoType
    })
  });

  const data = await res.json();

  if (!data.image) {
    throw new Error("Stable Diffusion no devolvió imagen");
  }

  return data.image;
}

// ================= PANEL COMPOSITION ENGINE =================
function getPanelComposition(panelKind, sceneFocus) {
  const kind = String(panelKind || "").toLowerCase();

  if (kind === "panoramic_top") {
    return {
      camera: "high wide panoramic shot",
      composition: `
epic panoramic composition,
top establishing panel,
very wide environment,
grand scale,
deep perspective,
large background dominance,
small human figures if any
`,
      extra: "environment storytelling, monumental scale"
    };
  }

  if (kind === "dialogue") {
    return {
      camera: sceneFocus === "two_characters" ? "medium two-shot" : "medium shot",
      composition: `
dialogue panel composition,
clear body separation,
readable posing,
balanced framing,
conversation focus,
clean silhouette
`,
      extra: "character interaction focus"
    };
  }

  if (kind === "emotional_closeup") {
    return {
      camera: "tight close-up portrait",
      composition: `
emotional close-up panel,
face dominant composition,
eyes emphasized,
minimal background,
strong emotional readability
`,
      extra: "facial expression focus"
    };
  }

  if (kind === "action") {
    return {
      camera: "dynamic action angle",
      composition: `
action panel composition,
motion emphasis,
impact frame,
dramatic foreshortening,
foreground depth,
speed lines
`,
      extra: "kinetic energy, action storytelling"
    };
  }

  return {
    camera: sceneFocus === "environment" ? "wide cinematic shot" : "medium cinematic shot",
    composition: `
cinematic vertical composition,
balanced framing,
clear focal point
`,
    extra: "manga storytelling composition"
  };
}

// ================= EXPLICACION DEL MUNDO =================
function isWorldExplanation(text) {
  const t = String(text || "").toLowerCase();

  return (
    t.includes("clasificados en rangos") ||
    t.includes("rango d") ||
    t.includes("rango s") ||
    t.includes("subniveles") ||
    t.includes("sistema de rangos") ||
    t.includes("aventureros eran clasificados")
  );
}

// ================= PROMPT DE EXPLICACION VISUAL =================
function buildWorldExplanationPrompt(dialogueText, stylePreset) {
  return `
world explanation panel,
fantasy information panel,
adventurer ranking system,
rank symbols D, C, B, A, S,
mystical ranking monument,
spiritual inscriptions,
guild classification board,
cultivation hierarchy visualized,
ancient magical interface,
clear symbolic worldbuilding,
${stylePreset},
${dialogueText}
`;
}

// ================= API PRINCIPAL =================
export async function POST(req) {
  try {
    await connectToDB();

    const { title, prompt, previousPages = [] } = await req.json();
    const globalStylePreset = getMangaStyle(title);
    const baseStyleSeed = generateStyleSeed(title);

    if (!prompt) {
      throw new Error("Prompt vacío");
    }

    // ================= GENERAR GUION =================
    const scriptPrompt = `
Generate a dark seinen manga storyboard for vertical manhwa reading.

Return ONLY JSON:

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
          "sceneFocus":"environment | single_character | two_characters",
          "panelKind":"panoramic_top | dialogue | emotional_closeup | action | standard"
        }
      ]
    }
  ]
}

Rules:
- imagePrompt must describe ONLY what is visible.
- characters must include only the characters that should appear in that panel.
- sceneFocus="environment" for tower, city, world explanation, or pure landscape panels.
- sceneFocus="single_character" when only one person should appear.
- sceneFocus="two_characters" when exactly two characters should appear.
- panelKind="panoramic_top" for opening world panels or big environment moments.
- panelKind="dialogue" for conversation scenes.
- panelKind="emotional_closeup" for emotional face emphasis.
- panelKind="action" for attack, tension, motion, impact.
- Keep dark xianxia / cultivator atmosphere when appropriate.
- Keep visual continuity.

Previous pages:
${previousPages.length ? JSON.stringify(previousPages) : "None"}

Story:
${prompt}
`;

    const scriptRes = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0.2,
      messages: [{ role: "user", content: scriptPrompt }]
    });

    let script = scriptRes.choices[0].message.content;
    script = script.replace(/^[^{]+/, "").replace(/[^}]+$/, "");

    const pages = JSON.parse(script).pages;

    for (const page of pages) {
      let panelIndex = 1;

      for (const panel of page.panels) {
        const panelSeed = baseStyleSeed + page.page * 100 + panelIndex;
        const visualText = panel.imagePrompt || "";
        const dialogueText = panel.dialogue || "";
        let sceneFocus = panel.sceneFocus || detectSceneType(visualText);
        const panelKind = panel.panelKind || "standard";
        const panelCharacters = Array.isArray(panel.characters) ? panel.characters : [];

        const stylePreset = buildStylePreset(globalStylePreset);

        if (isWorldExplanation(dialogueText)) {
          sceneFocus = "environment";
        }

        const composition = getPanelComposition(panelKind, sceneFocus);

        let charactersData = [];

        if (sceneFocus !== "environment") {
          const names = panelCharacters.length
            ? panelCharacters
            : extractPossibleNames(visualText);

          for (const rawName of names.slice(0, 2)) {
            const name = normalizeName(rawName);
            if (!name) continue;

           let character = await findCharacter(title, name);

if (!character || (character.profileVersion || 1) < 3) {
  character = await createOrUpdateCharacter(
    title,
    name,
    `${visualText}\n${dialogueText}`,
    globalStylePreset
  );
}
            const existsAlready = charactersData.some(
              c => c.name.toLowerCase() === character.name.toLowerCase()
            );

            if (!existsAlready) {
              charactersData.push(character);
            }
          }
        }

        let finalPrompt = "";

               if (isWorldExplanation(dialogueText)) {
          finalPrompt = `
${buildWorldExplanationPrompt(dialogueText, stylePreset)},
${composition.camera},
${composition.composition},
${composition.extra},
vertical webtoon panel,
manga infographic style,
clear symbolic composition
`;
        }
        else if (sceneFocus === "environment") {
          finalPrompt = `
ENVIRONMENT ONLY,
NO HUMANS,
NO PEOPLE,
NO CHARACTER,
NO CHARACTERS,
NO PERSON,
NO CULTIVATOR,
NO FIGURE,
NO BODY,
NO FACE,
NO HUMAN SILHOUETTE,
EMPTY LANDSCAPE,
EMPTY ENVIRONMENT,

${stylePreset},

SCENE:
${visualText},

CAMERA:
${composition.camera},

${composition.composition},
${composition.extra},

cinematic landscape,
high detail background,
dark mystical atmosphere,
ancient colossal towers,
massive monolithic towers,
world-scale architecture,
empty world view,
spiritual worldbuilding,
background only
`;
        }
        else if (sceneFocus === "two_characters" && charactersData.length >= 2) {
          const charA = charactersData[0];
          const charB = charactersData[1];

          const safeVisualText = sanitizeTwoCharacterText(visualText);
          const safeDialogueText = sanitizeTwoCharacterText(dialogueText);

          const karolLockA = charA.name.toLowerCase() === "karol" ? `
STRICT KAROL CANON:
long straight chestnut brown hair,
chestnut brown hair,
brown hair only,
same exact hairstyle,
same exact face,
fair skin,
golden brown eyes,
recognizable feminine face,
elegant young woman,
no black hair,
no blonde hair,
no white hair,
no blue hair
` : "";

          const karolLockB = charB.name.toLowerCase() === "karol" ? `
STRICT KAROL CANON:
long straight chestnut brown hair,
chestnut brown hair,
brown hair only,
same exact hairstyle,
same exact face,
fair skin,
golden brown eyes,
recognizable feminine face,
elegant young woman,
no black hair,
no blonde hair,
no white hair,
no blue hair
` : "";

          finalPrompt = `
two characters,
standing apart,
no physical contact,
no touching,
no holding hands,
no joined hands,
no interlocked fingers,
no handshake,
distance between characters,
independent poses,
separate silhouettes,
clear physical gap between bodies,
characters must not overlap,
characters must not touch,
Character A on the left,
Character B on the right,
both characters visible,
clear separation of bodies,
clear separation of arms,
clear separation of hands,
no merged limbs,
no overlapping torsos,
distinct gender presentation,

${stylePreset},

Character A on the left:
${charA.identityPrompt}
${karolLockA}
${charA.gender === "female"
  ? "female body, feminine face, no male traits"
  : "male body, masculine face, no female traits"}

Character B on the right:
${charB.identityPrompt}
${karolLockB}
${charB.gender === "female"
  ? "female body, feminine face, no male traits"
  : "male body, masculine face, no female traits"}

CURRENT ACTION:
${safeVisualText}

EMOTIONAL CONTEXT:
${safeDialogueText}

STRICT STAGING:
characters are not touching,
hands separated,
fingers separated,
no romantic pose,
no couple pose,
visible space between them,
arms separated

CAMERA:
${composition.camera},

${composition.composition},
${composition.extra},

high detail face,
balanced anatomy,
clear storytelling
`;
        }
        else if (charactersData.length >= 1) {
          const char = charactersData[0];

          finalPrompt = `
single character focus,
only ${char.name} visible,
no other people,
full face visible,
full head visible,
head in frame,
face centered,
eyes visible,
no face crop,
no head crop,

${stylePreset},

${char.identityPrompt}

CURRENT ACTION:
${visualText}

EMOTIONAL CONTEXT:
${dialogueText}

CAMERA:
${composition.camera},

${composition.composition},
${composition.extra},

vertical webtoon panel,
clear focal point,
balanced anatomy,
high detail face,
cinematic storytelling
`;
        }
        else {
          finalPrompt = `
${stylePreset},
${visualText},
${composition.camera},
${composition.composition},
${composition.extra},
vertical webtoon panel,
cinematic scene
`;
        }

        let base64;

        if (sceneFocus === "environment") {
  base64 = await generateImage(
    finalPrompt,
    null,
    panelSeed,
    null,
    0,
    null
  );
}
else if (sceneFocus === "two_characters" && charactersData.length >= 2) {
  const charA = charactersData[0];
  const charB = charactersData[1];

  let duoGender = "mixed";
  let duoType = null;

  if (charA.gender === "female" && charB.gender === "male") {
    duoType = "female_male";
  } else if (charA.gender === "male" && charB.gender === "female") {
    duoType = "female_male";
  } else if (charA.gender === "female" && charB.gender === "female") {
    duoGender = "female";
    duoType = "female_female";
  } else {
    duoGender = "male";
    duoType = "male_male";
  }

  const duoSeed = generatePairSeed(charA.seed, charB.seed);

  base64 = await generateImage(
    finalPrompt,
    duoSeed,
    null,
    duoGender,
    2,
    duoType
  );
}
else if (charactersData.length === 1) {
  const char = charactersData[0];

  base64 = await generateImage(
    finalPrompt,
    char.seed,
    panelSeed,
    char.gender,
    1,
    null
  );
}
else {
  base64 = await generateImage(
    finalPrompt,
    null,
     panelSeed,
    null,
    0,
    null
  );
}
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
      pages
    });

  } catch (err) {
    console.error(err);

    return NextResponse.json({
      error: err.message
    });
  }
}

// ================= PERSONALIDAD =================
function buildPersonalityBlock(personality, archetype) {
  personality = personality?.toLowerCase() || "";
  archetype = archetype?.toLowerCase() || "";

  if (personality.includes("cold") || archetype.includes("strategist")) {
    return "cold calculating gaze, restrained expression, calm dominant posture";
  }

  if (personality.includes("friendly") || archetype.includes("hero")) {
    return "confident smile, warm eyes, upright posture";
  }

  if (personality.includes("aggressive")) {
    return "intense stare, tense posture, fierce expression";
  }

  return "neutral expression, balanced posture";
}

// ================= ESTILO =================
function buildStylePreset(style) {
  if (!style) return "";

  if (style === "dark_cultivator") {
    return `
xianxia cultivation world,
martial cultivator aesthetic,
ancient eastern fantasy,
cultivator robes,
spiritual aura,
mystical energy,
floating debris,
dark wuxia atmosphere,
seinen manga tone,
dramatic lighting,
epic scale,
vertical manhwa composition
`;
  }

  return "";
}

// ================= ESTILO POR TITULO =================
function getMangaStyle(title) {
  if (title.toLowerCase().includes("torres")) {
    return "dark_cultivator";
  }

  return "dark_cultivator";
}

// ================= DETECTAR ESCENA =================
function detectSceneType(imagePrompt) {
  const t = String(imagePrompt || "").toLowerCase();

  if (
    t.includes("landscape") ||
    t.includes("environment") ||
    t.includes("city") ||
    t.includes("tower") ||
    t.includes("panorama") ||
    t.includes("background only")
  ) {
    return "environment";
  }

  if (
    t.includes("two characters") ||
    t.includes("conversation") ||
    t.includes("interaction between") ||
    t.includes("duo")
  ) {
    return "two_characters";
  }

  return "single_character";
}
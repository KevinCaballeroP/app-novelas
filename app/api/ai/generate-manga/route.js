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

const TRACKED_CHARACTER_NAMES = ["Karol", "Cristian", "Kelvin", "Mefisto"];

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

function sanitizeMultiCharacterText(text) {
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

function detectViewAngle(text) {
  const t = String(text || "").toLowerCase();

  if (
    t.includes("back view") ||
    t.includes("from behind") ||
    t.includes("seen from behind") ||
    t.includes("de espaldas") ||
    t.includes("walking away") ||
    t.includes("espalda")
  ) {
    return "back";
  }

  if (
    t.includes("side view") ||
    t.includes("profile") ||
    t.includes("de perfil")
  ) {
    return "profile";
  }

  return "front";
}

function hasCharacterPresence(text, characters = []) {
  const t = String(text || "").toLowerCase();

  if (Array.isArray(characters) && characters.length > 0) return true;

  return (
    t.includes("girl") ||
    t.includes("boy") ||
    t.includes("woman") ||
    t.includes("man") ||
    t.includes("student") ||
    t.includes("cultivator") ||
    t.includes("young woman") ||
    t.includes("young man") ||
    t.includes("chica") ||
    t.includes("joven") ||
    t.includes("persona") ||
    t.includes("character")
  );
}

function buildCharacterConsistencyAnchor(character) {
  const lowerName = String(character?.name || "").toLowerCase();

  let anchor = `
same character as previous panels,
same hairstyle,
same hair length,
same hair color,
same face structure,
same body proportions,
same clothing design,
same silhouette,
recognizable identity,
character continuity,
consistent visual identity,
recognizable from silhouette,
same exact face,
same exact character,
no identity drift,
no alternate design,
`;

  if (lowerName === "karol") {
    anchor += `
Karol Fuentes,
young elegant woman,
long straight chestnut brown hair,
chestnut brown hair only,
brown hair only,
never black hair,
never blonde hair,
never white hair,
never blue hair,
golden brown eyes,
fair skin,
slim feminine body,
refined feminine face,
recognizable hairstyle,
same exact character as before,
same hair color under all lighting,
same exact hairstyle,
same exact eye color
`;
  }

  if (lowerName === "kelvin") {
    anchor += `
Kelvin,
young man,
short straight black hair,
dark eyes,
masculine face,
broad shoulders,
slim masculine body,
recognizable male silhouette,
same exact character as before
`;
  }

  if (lowerName === "cristian") {
    anchor += `
Cristian Uribe,
young man,
short dark hair,
dark hair only,
strong jawline,
masculine face,
broad shoulders,
slim masculine body,
recognizable male silhouette,
same exact character as before
`;
  }

  if (lowerName === "mefisto") {
    anchor += `
Mefisto,
female spiritual guide,
cat ears ALWAYS visible,
cat ears clearly defined,
no human ears without cat ears,
long sapphire blue hair,
blue hair only,
never black hair,
never brown hair,
never blonde hair,
never white hair,
emerald green glowing eyes,
green eyes only,
ethereal feminine aura,
spiritual particles,
mystical female spirit,
same exact face,
same exact hairstyle,
same exact eye color,
same exact character as before,
no identity drift,
no alternate design,
no different character
`;
  }

  return anchor;
}

function buildBackViewAnchor(character) {
  const lowerName = String(character?.name || "").toLowerCase();

  let anchor = `
back view,
seen from behind,
recognizable from behind,
same hairstyle visible from behind,
same clothing visible from behind,
same body proportions,
same silhouette,
hair and outfit must identify the same character,
`;

  if (lowerName === "karol") {
    anchor += `
long chestnut brown hair visible from behind,
chestnut brown hair only,
recognizable feminine silhouette,
same elegant outfit from previous panels,
same hair color,
same slim body shape
`;
  }

  if (lowerName === "kelvin") {
    anchor += `
short black hair visible from behind,
recognizable masculine silhouette,
same male outfit from previous panels,
same slim masculine body
`;
  }

  if (lowerName === "cristian") {
    anchor += `
short dark hair visible from behind,
recognizable masculine silhouette,
same male outfit from previous panels,
same slim masculine body
`;
  }

  if (lowerName === "mefisto") {
    anchor += `
long sapphire blue hair visible from behind,
cat ears visible from behind,
recognizable feminine mystical silhouette,
same ethereal robe design,
same blue hair color,
same slim feminine body
`;
  }

  return anchor;
}

function normalizeName(name) {
  return String(name || "").trim();
}

function getDuoType(charA, charB) {
  if (!charA?.gender || !charB?.gender) return null;

  if (charA.gender === "male" && charB.gender === "male") return "male_male";
  if (charA.gender === "female" && charB.gender === "female") return "female_female";

  return "female_male";
}

function buildSoloReferencePrompt(character) {
  return `
solo portrait of ${character.name},
${character.identityPrompt || ""},
centered composition,
upper body,
visible face,
looking at viewer,
neutral background,
character reference sheet,
same hairstyle,
same outfit,
same facial structure,
same identity,
recognizable character design
  `.trim();
}

async function ensureCharacterReference(character) {
  if (!character) return null;

  if (character.referenceImage) {
    return character;
  }

  const payload = {
    prompt: buildSoloReferencePrompt(character),
    seed: character.seed || null,
    gender: character.gender || null,
    identityPrompt: character.identityPrompt || "",
    referenceImage: null,
    characterCount: 1,
    duoType: null,
  };

  const refRes = await fetch("http://localhost:8000/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!refRes.ok) {
    const errorText = await refRes.text();
    throw new Error(`No se pudo generar referenceImage para ${character.name}: ${errorText}`);
  }

  const refData = await refRes.json();

  if (refData.generatedReferenceImage) {
    character.referenceImage = refData.generatedReferenceImage;
    await character.save();
  } else if (refData.image) {
    character.referenceImage = refData.image;
    await character.save();
  }

  return character;
}

async function buildGenerationPayload(panel, charactersInPanel, panelSeed = null) {
  if (!charactersInPanel || charactersInPanel.length === 0) {
    return {
      prompt: panel.imagePrompt,
      seed: null,
      styleSeed: panelSeed,
      gender: null,
      identityPrompt: "",
      referenceImage: null,
      characterCount: 0,
      duoType: null,
    };
  }

  if (charactersInPanel.length === 1) {
    let char = charactersInPanel[0];
    char = await ensureCharacterReference(char);

    return {
      prompt: panel.imagePrompt,
      seed: char.seed || null,
      styleSeed: panelSeed,
      gender: char.gender || null,
      identityPrompt: char.identityPrompt || "",
      referenceImage: char.referenceImage || null,
      characterCount: 1,
      duoType: null,
    };
  }

  const charA = await ensureCharacterReference(charactersInPanel[0]);
  const charB = await ensureCharacterReference(charactersInPanel[1]);

  return {
    prompt: panel.imagePrompt,
    seed: generatePairSeed(charA.seed, charB.seed),
    styleSeed: panelSeed,
    gender: null,
    characterCount: 2,
    duoType: getDuoType(charA, charB),

    characterA: {
      name: charA.name,
      gender: charA.gender || null,
      identityPrompt: charA.identityPrompt || "",
      seed: charA.seed || null,
      referenceImage: charA.referenceImage || null,
    },

    characterB: {
      name: charB.name,
      gender: charB.gender || null,
      identityPrompt: charB.identityPrompt || "",
      seed: charB.seed || null,
      referenceImage: charB.referenceImage || null,
    },

    referenceImage: null,
    identityPrompt: null,
  };
}

function extractFirstJsonObject(text) {
  const raw = String(text || "").trim();
  const start = raw.indexOf("{");

  if (start === -1) {
    throw new Error("Groq no devolvió ningún bloque JSON válido.");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (ch === "{") depth++;
      if (ch === "}") depth--;

      if (depth === 0) {
        return raw.slice(start, i + 1);
      }
    }
  }

  throw new Error("No se pudo cerrar correctamente el JSON devuelto por Groq.");
}

function tryRepairJson(text) {
  let repaired = String(text || "")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/\r/g, "");

  repaired = repaired.replace(/\n/g, "\\n");

  repaired = repaired
    .replace(/\\n(\s*)"/g, '\\n$1"')
    .replace(/\\n(\s*)([}\]])/g, "$1$2");

  repaired = repaired.replace(
    /"(dialogue|imagePrompt)"\s*:\s*"([\s\S]*?)"(?=\s*,\s*"(?:characters|sceneFocus|panelKind|viewAngle|type|dialogue|imagePrompt|page|panels)"|\s*[}\]])/g,
    (_, key, value) => {
      const safeValue = value
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n");
      return `"${key}":"${safeValue}"`;
    }
  );

  return repaired.trim();
}

function tryRepairLooseJson(text) {
  let repaired = String(text || "").trim();

  repaired = repaired
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\r/g, "")
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  repaired = repaired.replace(/^\{\s*\{/, "{").replace(/\}\s*\}$/, "}");

  repaired = repaired.replace(/([{,]\s*)'([^']+?)'\s*:/g, '$1"$2":');
  repaired = repaired.replace(/:\s*'([^']*?)'(\s*[,}])/g, ':"$1"$2');

  repaired = repaired.replace(
    /([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g,
    '$1"$2"$3'
  );

  repaired = repaired.replace(/,\s*([}\]])/g, "$1");
  repaired = repaired.replace(/\n/g, "\\n");

  return repaired.trim();
}

function buildFallbackCharacterProfile(cleanName, description = "") {
  const lowerName = String(cleanName || "").toLowerCase();
  const textLower = String(description || "").toLowerCase();

  let gender = "male";

  const femaleNames = ["karol", "sofia", "anna", "lucia", "maria", "sara", "mefisto"];
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

  return {
    gender,
    age: "young adult",
    hair: lowerName === "karol"
      ? "long straight chestnut brown hair"
      : lowerName === "kelvin"
        ? "short straight black hair"
        : lowerName === "cristian"
          ? "short dark hair"
          : lowerName === "mefisto"
            ? "long sapphire blue hair"
            : "",
    face: isFemale
      ? "refined feminine face"
      : "masculine face, strong jawline",
    body: isFemale
      ? "slim feminine body"
      : "slim masculine body, broad shoulders",
    default_clothing: lowerName === "mefisto"
      ? "elegant mystical robes, fantasy guide clothing, fully dressed"
      : "practical layered cultivator outfit, fully dressed",
    personality: "calm",
    archetype: "hero"
  };
}

function parseCharacterProfileJson(content, cleanName, description) {
  const fallbackProfile = buildFallbackCharacterProfile(cleanName, description);
  const raw = String(content || "").trim();

  if (!raw) {
    console.warn("⚠️ Perfil vacío, usando fallback.");
    return fallbackProfile;
  }

  let candidates = [];

  try {
    candidates.push(extractFirstJsonObject(raw));
  } catch {}

  candidates.push(raw);
  candidates = [...new Set(candidates.map(x => String(x || "").trim()).filter(Boolean))];

  for (const candidate of candidates) {
    const attempts = [
      candidate,
      tryRepairJson(candidate),
      tryRepairLooseJson(candidate),
      tryRepairLooseJson(tryRepairJson(candidate)),
    ];

    for (const attempt of attempts) {
      try {
        const parsed = JSON.parse(attempt);

        return {
          gender: parsed.gender || fallbackProfile.gender,
          age: parsed.age || fallbackProfile.age,
          hair: parsed.hair || fallbackProfile.hair,
          face: parsed.face || fallbackProfile.face,
          body: parsed.body || fallbackProfile.body,
          default_clothing: parsed.default_clothing || fallbackProfile.default_clothing,
          personality: parsed.personality || fallbackProfile.personality,
          archetype: parsed.archetype || fallbackProfile.archetype,
        };
      } catch {}
    }
  }

  console.warn("⚠️ Perfil de personaje roto, usando fallback seguro...");
  console.error("CHARACTER PROFILE RAW FROM GROQ:\n", raw);

  return fallbackProfile;
}

function extractPagesWithRegexFallback(content) {
  const raw = String(content || "");

  const panelRegex = /"type"\s*:\s*"([^"]*?)"[\s\S]*?"dialogue"\s*:\s*"([\s\S]*?)"[\s\S]*?"imagePrompt"\s*:\s*"([\s\S]*?)"[\s\S]*?"characters"\s*:\s*(\[[\s\S]*?\])[\s\S]*?"sceneFocus"\s*:\s*"([^"]*?)"[\s\S]*?"panelKind"\s*:\s*"([^"]*?)"[\s\S]*?"viewAngle"\s*:\s*"([^"]*?)"/g;

  const panels = [];
  let match;

  while ((match = panelRegex.exec(raw)) !== null) {
    let characters = [];
    try {
      characters = JSON.parse(match[4]);
    } catch {
      characters = [];
    }

    panels.push({
      type: match[1] || "narration",
      dialogue: (match[2] || "").replace(/\\"/g, '"').replace(/\\n/g, " ").trim(),
      imagePrompt: (match[3] || "").replace(/\\"/g, '"').replace(/\\n/g, " ").trim(),
      characters: Array.isArray(characters) ? characters : [],
      sceneFocus: match[5] || "single_character",
      panelKind: match[6] || "standard",
      viewAngle: match[7] || "front",
    });
  }

  if (!panels.length) {
    throw new Error("No se pudo recuperar ningún panel del storyboard dañado.");
  }

  return {
    pages: [
      {
        page: 1,
        panels,
      },
    ],
  };
}

function parseStoryboardJson(content) {
  const extracted = extractFirstJsonObject(content);
  const repaired = tryRepairJson(extracted);

  try {
    return JSON.parse(repaired);
  } catch (err) {
    console.error("JSON RAW FROM GROQ:\n", content);
    console.error("JSON EXTRACTED:\n", extracted);
    console.error("JSON REPAIRED:\n", repaired);

    try {
      console.warn("⚠️ Usando fallback por JSON roto...");
      return extractPagesWithRegexFallback(content);
    } catch (fallbackErr) {
      console.error("FALLBACK FAILED:\n", fallbackErr);
      throw new Error(`Groq devolvió un storyboard inválido: ${err.message}`);
    }
  }
}

async function createOrUpdateCharacter(mangaTitle, name, description, stylePreset) {
  const cleanName = normalizeName(name);
  const lowerName = cleanName.toLowerCase();
  const seed = generateCharacterSeed(cleanName);
  const existingCharacter = await Character.findOne({ mangaTitle, name: cleanName });

  if (lowerName === "mefisto") {
    const identityPrompt = `
(1girl:1.7),
solo,
adult woman,
Mefisto,

STRICT CHARACTER IDENTITY,

female spiritual guide,
cat ears ALWAYS visible,
cat ears clearly defined,
no human ears without cat ears,

long sapphire blue hair,
blue hair only,
no black hair,
no brown hair,
no blonde hair,
no white hair,

emerald green glowing eyes,
green eyes only,
no other eye color,

ethereal mystical aura,
spiritual energy surrounding body,
glowing particles,
fantasy spirit presence,

slim feminine body,
elegant mystical robes,
cultivator robe style,
dark fantasy aesthetic,

face must be feminine,
no male traits,
no androgynous face,

same exact face,
same exact hairstyle,
same exact eye color,
same exact character,

NO IDENTITY DRIFT,
NO ALTERNATIVE DESIGN,
NO DIFFERENT CHARACTER,
RECOGNIZABLE AS SAME CHARACTER
`;

    return await Character.findOneAndUpdate(
      { mangaTitle, name: cleanName },
      {
        $set: {
          identityPrompt,
          seed,
          gender: "female",
          visualStylePreset: stylePreset,
          profileVersion: 7,
          cultivationLevel: existingCharacter?.cultivationLevel || "D3",
          evolutionStage: existingCharacter?.evolutionStage || 1,
        },
        $setOnInsert: {
          referenceImage: null,
        },
      },
      {
        new: true,
        upsert: true,
      }
    );
  }

  if (lowerName === "cristian") {
    const identityPrompt = `
(1man:1.8),
solo,
adult man,
Cristian Uribe,
young rich adventurer,
short dark hair,
dark hair only,
strong jawline,
masculine face,
broad shoulders,
slim masculine body,
clear male anatomy,
dark eyes,
elegant wealthy adventurer clothing,
fully dressed,
story appropriate clothing,
no female traits,
no feminine traits,
same exact face,
same exact hairstyle,
recognizable male silhouette
`;

    return await Character.findOneAndUpdate(
      { mangaTitle, name: cleanName },
      {
        $set: {
          identityPrompt,
          seed,
          gender: "male",
          visualStylePreset: stylePreset,
          profileVersion: 7,
          cultivationLevel: existingCharacter?.cultivationLevel || "D3",
          evolutionStage: existingCharacter?.evolutionStage || 1,
        },
        $setOnInsert: {
          referenceImage: null,
        },
      },
      {
        new: true,
        upsert: true,
      }
    );
  }

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
- Return strictly valid JSON only.
- All keys and values must use double quotes.
- Do not use markdown fences.
- Do not add comments.
- Do not add text before or after the JSON object.
- Do not use trailing commas.
- Keep every value as a short plain string.
- No markdown.
- No explanation text.

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

  const rawProfile = res.choices[0].message.content;
  const profile = parseCharacterProfileJson(rawProfile, cleanName, description);

  const personalityBlock = buildPersonalityBlock(
    profile.personality,
    profile.archetype
  );

  let gender = profile.gender?.toLowerCase() || "male";
  const textLower = description.toLowerCase();

  const femaleNames = ["karol", "sofia", "anna", "lucia", "maria", "sara", "mefisto"];
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
chestnut brown hair only,
same hair color,
same exact hairstyle,
same exact eye color,
fair skin,
golden brown eyes,
same exact face,
recognizable feminine face,
elegant young woman,
no black hair,
no blonde hair,
no white hair,
no blue hair,
do not change hair color under any lighting,
no alternate design,
no reinterpretation
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
        gender,
        visualStylePreset: stylePreset,
        profileVersion: 7,
        cultivationLevel: existingCharacter?.cultivationLevel || "D3",
        evolutionStage: existingCharacter?.evolutionStage || 1,
      },
      $setOnInsert: {
        referenceImage: null,
      },
    },
    {
      new: true,
      upsert: true,
    }
  );
}

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

function extractKnownCharacterNames(text) {
  const t = String(text || "").toLowerCase();

  const knownNames = [
    "karol",
    "cristian",
    "kelvin",
    "mefisto",
    "uryan",
    "juan"
  ];

  const found = [];

  for (const name of knownNames) {
    const regex = new RegExp(`\\b${name}\\b`, "i");
    if (regex.test(t)) {
      found.push(name.charAt(0).toUpperCase() + name.slice(1));
    }
  }

  return [...new Set(found)];
}

function extractAllCharacterNames(text) {
  const explicitNames = extractPossibleNames(text);
  const knownNames = extractKnownCharacterNames(text);

  return [...new Set([...explicitNames, ...knownNames].map(normalizeName).filter(Boolean))];
}

function extractTrackedCharacterNames(text) {
  const found = extractAllCharacterNames(text);

  return found.filter(name =>
    TRACKED_CHARACTER_NAMES.some(
      tracked => tracked.toLowerCase() === String(name).toLowerCase()
    )
  );
}

function prioritizeStoryCharacters(names = [], dialogueText = "", visualText = "") {
  const lowerDialogue = String(dialogueText || "").toLowerCase();
  const lowerVisual = String(visualText || "").toLowerCase();
  const ordered = [...names];
  const priority = [];

  if (lowerDialogue.includes("karol") || lowerVisual.includes("karol")) priority.push("Karol");
  if (lowerDialogue.includes("kelvin") || lowerVisual.includes("kelvin")) priority.push("Kelvin");
  if (lowerDialogue.includes("cristian") || lowerVisual.includes("cristian")) priority.push("Cristian");
  if (lowerDialogue.includes("mefisto") || lowerVisual.includes("mefisto")) priority.push("Mefisto");

  const finalNames = [];

  for (const p of priority) {
    const found = ordered.find(n => String(n).toLowerCase() === p.toLowerCase());
    if (found && !finalNames.some(x => String(x).toLowerCase() === String(found).toLowerCase())) {
      finalNames.push(found);
    }
  }

  for (const n of ordered) {
    if (!finalNames.some(x => String(x).toLowerCase() === String(n).toLowerCase())) {
      finalNames.push(n);
    }
  }

  return finalNames;
}

function isStrongTwoCharacterScene(dialogueText = "", visualText = "") {
  const text = `${dialogueText} ${visualText}`.toLowerCase();

  const hasKarol = text.includes("karol");
  const hasCristian = text.includes("cristian");
  const hasKelvin = text.includes("kelvin");
  const hasMefisto = text.includes("mefisto");

  const pairCount = [hasKarol, hasCristian, hasKelvin, hasMefisto].filter(Boolean).length;

  if (pairCount < 2) return false;

  return (
    text.includes(" y ") ||
    text.includes(" junto a ") ||
    text.includes(" con ") ||
    text.includes(" conoció a ") ||
    text.includes(" habló con ") ||
    text.includes(" miró a ") ||
    text.includes(" frente a ") ||
    text.includes(" acompañada de ") ||
    text.includes(" acompañado de ") ||
    text.includes(" recordó a ") ||
    text.includes(" corazón de ")
  );
}

function inferSceneFocusFromNames(panelCharacters = [], visualText = "", dialogueText = "") {
  const explicit = Array.isArray(panelCharacters) ? panelCharacters.filter(Boolean) : [];
  if (explicit.length >= 2) return "two_characters";
  if (explicit.length === 1) return "single_character";

  const names = extractTrackedCharacterNames(`${visualText} ${dialogueText}`);
  const unique = [...new Set(names.map(n => normalizeName(n).toLowerCase()))];

  if (unique.length >= 2) return "two_characters";
  if (unique.length === 1) return "single_character";

  return null;
}

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

async function generateImage(payload) {
  const res = await fetch("http://localhost:8000/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await res.json();

  if (!data.image) {
    throw new Error(data?.error || "Stable Diffusion no devolvió imagen");
  }

  return data;
}

function getPanelComposition(panelKind, sceneFocus, storyMode = "tiktok") {
  const kind = String(panelKind || "").toLowerCase();
  const isYoutube = storyMode === "youtube";

  if (kind === "panoramic_top") {
    return {
      camera: isYoutube ? "cinematic wide establishing shot" : "high wide panoramic shot",
      composition: isYoutube
        ? `
epic cinematic wide composition,
horizontal establishing panel,
large side breathing room,
grand scale,
deep perspective,
clear left and right spacing,
landscape dominance,
small human figures if any
`
        : `
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
      camera:
        sceneFocus === "two_characters"
          ? (isYoutube ? "cinematic two-shot" : "medium two-shot")
          : (isYoutube ? "cinematic medium shot" : "medium shot"),
      composition: isYoutube
        ? `
horizontal dialogue composition,
clear side spacing,
balanced character placement,
readable posing,
conversation focus,
clean silhouette,
safe 16:9 framing
`
        : `
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
      camera: isYoutube ? "cinematic close-up portrait" : "tight close-up portrait",
      composition: isYoutube
        ? `
emotional cinematic close-up,
face readable with margin,
eyes emphasized,
controlled side space,
minimal background,
strong emotional readability,
avoid edge crop
`
        : `
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
      camera: isYoutube ? "dynamic cinematic action shot" : "dynamic action angle",
      composition: isYoutube
        ? `
horizontal action composition,
motion emphasis,
impact frame,
dramatic depth,
side space for movement,
clear readable staging,
safe cinematic framing
`
        : `
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
    camera: sceneFocus === "environment"
      ? (isYoutube ? "cinematic wide shot" : "wide cinematic shot")
      : sceneFocus === "two_characters"
        ? (isYoutube ? "cinematic two-shot" : "medium two-shot")
        : (isYoutube ? "cinematic medium wide shot" : "medium cinematic shot"),
    composition: isYoutube
      ? `
horizontal cinematic composition,
balanced side margins,
clear focal point,
safe 16:9 framing,
avoid tight edge cropping
`
      : `
cinematic vertical composition,
balanced framing,
clear focal point
`,
    extra: "manga storytelling composition"
  };
}

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

function buildWorldExplanationPrompt(dialogueText, stylePreset, storyMode = "tiktok") {
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
${storyMode === "youtube" ? "horizontal cinematic infographic composition," : "vertical infographic composition,"}
${stylePreset},
${dialogueText}
`;
}

function getStoryProfile(contentProfile = "tiktok") {
  const mode = String(contentProfile || "tiktok").toLowerCase();

  if (mode === "youtube") {
    return {
      mode: "youtube",
      dialogueRule: `
- Dialogue can be slightly longer when needed for clarity.
- Prefer 1 short sentence per panel, occasionally 2 if necessary.
- Keep emotional clarity and narrative continuity.
- Allow more atmosphere and worldbuilding.
- Build progression: setup, tension, reveal, consequence.
- End the last panel with anticipation or unresolved tension.
`,
      panelRule: `
- Use balanced pacing.
- Use fewer but more readable panels.
- Allow breathing room for scenery, motion and character placement.
- Prefer wider staging and cinematic readability.
`,
      imageRule: `
- Compose scenes for horizontal cinematic framing.
- Keep important characters centered with safe margins.
- Avoid extreme close crops.
- Prefer medium shot, wide shot, two-shot or cinematic wide shot.
- Leave side space for 16:9 framing.
- Do not push faces too close to the top or side edges.
`,
      storyboardFormat: "cinematic horizontal manga storyboard",
      defaultPanelTag: "horizontal cinematic panel",
    };
  }

  return {
    mode: "tiktok",
    dialogueRule: `
- Each dialogue beat must be short and emotionally direct.
- Prefer 3 to 8 words per panel when possible.
- Avoid long exposition.
- Start the sequence with an immediate hook.
- Every 1 to 3 panels should create tension, mystery, danger or revelation.
- Prefer punchy narration over descriptive paragraphs.
- End the last panel with a strong cliffhanger or unresolved tension.
`,
    panelRule: `
- Prefer more panels with shorter text.
- Each panel should feel like a mini dramatic beat.
- Prioritize retention and impact.
- The first panel must hook immediately.
`,
    imageRule: `
- Compose scenes for vertical mobile framing.
- Prefer strong central focus.
- Use close-ups, medium shots and vertical dramatic composition.
- Keep the focal character large and readable.
`,
    storyboardFormat: "high-retention vertical short-form manga storyboard",
    defaultPanelTag: "vertical webtoon panel",
  };
}

function buildOpeningHook(title, prompt) {
  const raw = String(prompt || "").trim();

  if (!raw) {
    return `Something terrible is about to happen in ${title}.`;
  }

  const firstSentence =
    raw.split(/[.!?]/).map((x) => x.trim()).find(Boolean) || raw;

  if (firstSentence.length <= 90) return firstSentence;

  return `${firstSentence.slice(0, 90).trim()}...`;
}

export async function POST(req) {
  try {
    await connectToDB();

    const {
      title,
      prompt,
      previousPages = [],
      contentProfile = "tiktok",
    } = await req.json();

    const safePrompt = String(prompt || "")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/"/g, "'")
      .replace(/\r/g, " ")
      .replace(/\n/g, " ");

    const globalStylePreset = getMangaStyle(title);
    const baseStyleSeed = generateStyleSeed(title);
    const storyProfile = getStoryProfile(contentProfile);
    const openingHook = buildOpeningHook(title, prompt);

    if (!prompt) {
      throw new Error("Prompt vacío");
    }

    const scriptPrompt = `
Generate a dark seinen manga storyboard for ${storyProfile.storyboardFormat}.

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
          "panelKind":"panoramic_top | dialogue | emotional_closeup | action | standard",
          "viewAngle":"front | profile | back"
        }
      ]
    }
  ]
}

Rules:
- Return strictly valid JSON.
- Do not include markdown.
- Do not include explanation text before or after JSON.
- Do not use trailing commas.
- Escape all quotes inside strings properly.
- The response must be parseable by JavaScript JSON.parse().
- Never use unescaped double quotes inside dialogue or imagePrompt.
- Replace quotes in dialogue with single quotes.
- Do not include line breaks inside JSON string values.
- dialogue is REQUIRED in every panel.
- Never return empty dialogue.
- If a panel is purely visual, add a short narration line anyway.
- Preserve all important dialogue beats from the story.
- Do not summarize away key lines.
- Do not skip emotional or story-important text.
- Split long scenes into multiple panels if needed so the dialogue is not lost.
- Each panel must contain one clear readable text beat.
- narration panels must still contain meaningful text in "dialogue".
- thought panels must still contain meaningful text in "dialogue".
- speech panels must still contain meaningful text in "dialogue".
- imagePrompt must describe ONLY what is visible.
- characters must include only the characters that should appear in that panel.
- sceneFocus="environment" for tower, city, world explanation, or pure landscape panels.
- sceneFocus="single_character" when only one person should appear.
- sceneFocus="two_characters" only when both characters are clearly part of the same moment.
- panelKind="panoramic_top" for opening world panels or big environment moments.
- panelKind="dialogue" for conversation scenes.
- panelKind="emotional_closeup" for emotional face emphasis.
- panelKind="action" for attack, tension, motion, impact.
- Keep dark xianxia / cultivator atmosphere when appropriate.
- Keep visual continuity.
- Every panel must advance story + text together.
- viewAngle="back" only when the story explicitly needs the character seen from behind.
- viewAngle="front" by default for character introduction or identity-important scenes.
- viewAngle="profile" for side conversation shots.
- When introducing an important character for the first time, prefer front view.
- If Karol, Kelvin, Cristian, or Mefisto are mentioned in dialogue, prioritize them visually when appropriate.
- If two tracked characters are mentioned in the same interaction, they should appear together.
- Never invent a third person in a two-character panel.
- Avoid unrelated objects and empty shots.
- The imagePrompt must visually match the dialogue.

Platform storytelling rules:
${storyProfile.dialogueRule}
${storyProfile.panelRule}

Visual framing rules:
${storyProfile.imageRule}

Mandatory hook rule:
- The first panel must immediately create curiosity, danger, mystery, emotional tension or shock.
- The first panel dialogue should feel like a hook, not like neutral exposition.
- Use this hook idea as inspiration for the opening beat: "${openingHook}"

Continuity rules:
- Respect previous pages so the story does not restart.
- Maintain emotional continuity and conflict progression.
- Do not contradict prior panels.

Previous pages:
${previousPages.length ? JSON.stringify(previousPages) : "None"}

Story:
${safePrompt}
`;

    const scriptRes = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0.2,
      messages: [{ role: "user", content: scriptPrompt }]
    });

    const script = scriptRes.choices[0].message.content;
    const storyboard = parseStoryboardJson(script);

    if (!storyboard?.pages || !Array.isArray(storyboard.pages)) {
      throw new Error("El storyboard JSON no contiene un array válido en 'pages'.");
    }

    const pages = storyboard.pages;

    for (const page of pages) {
      for (const panel of page.panels || []) {
        panel.type = panel.type || "narration";
        panel.dialogue = String(panel.dialogue || "").trim();
        panel.imagePrompt = String(panel.imagePrompt || "").trim();
        panel.characters = Array.isArray(panel.characters) ? panel.characters : [];
        panel.viewAngle = panel.viewAngle || detectViewAngle(panel.imagePrompt || "");

        if (!panel.dialogue) {
          if (storyProfile.mode === "tiktok") {
            if (panel.type === "thought") {
              panel.dialogue = "Algo no estaba bien.";
            } else if (panel.type === "speech") {
              panel.dialogue = "Es demasiado tarde.";
            } else {
              panel.dialogue = "La torre respondió.";
            }
          } else {
            if (panel.type === "thought") {
              panel.dialogue = "Algo cambió en el ambiente.";
            } else if (panel.type === "speech") {
              panel.dialogue = "Esto apenas comienza.";
            } else {
              panel.dialogue = "La tensión crecía en silencio.";
            }
          }
        }
      }
    }

    for (const page of pages) {
      let panelIndex = 1;

      for (const panel of page.panels) {
        const panelSeed = baseStyleSeed + page.page * 100 + panelIndex;
        const visualText = panel.imagePrompt || "";
        const dialogueText = panel.dialogue || "";

        const inferredNames = extractTrackedCharacterNames(`${visualText} ${dialogueText}`);
        const rawPanelNames = Array.isArray(panel.characters) ? panel.characters : [];

        let combinedNames = [...rawPanelNames, ...inferredNames]
          .map((n) => normalizeName(n))
          .filter(Boolean);

        combinedNames = [...new Set(combinedNames)];
        combinedNames = prioritizeStoryCharacters(combinedNames, dialogueText, visualText);

        const forcedImportant = combinedNames.filter((n) =>
          ["karol", "cristian", "kelvin", "mefisto"].includes(String(n).toLowerCase())
        );

        const uniqueDetected = [...new Set(combinedNames)];
        const strongTwoCharacterScene = isStrongTwoCharacterScene(dialogueText, visualText);

        let sceneFocus;

        if (uniqueDetected.length >= 2 && strongTwoCharacterScene) {
          sceneFocus = "two_characters";
        } else if (uniqueDetected.length === 1) {
          sceneFocus = "single_character";
        } else {
          sceneFocus =
            panel.sceneFocus ||
            inferSceneFocusFromNames(panel.characters, visualText, dialogueText) ||
            detectSceneType(visualText);
        }

        let viewAngle = panel.viewAngle || detectViewAngle(visualText);
        const panelCharacters = Array.isArray(panel.characters) ? panel.characters : [];

        if (sceneFocus === "environment" && uniqueDetected.length >= 1) {
          sceneFocus = "single_character";
        }

        if (sceneFocus === "environment" && hasCharacterPresence(visualText, panelCharacters)) {
          sceneFocus = "single_character";
        }

        if (uniqueDetected.length >= 2 && strongTwoCharacterScene) {
          sceneFocus = "two_characters";
        }

        if (shouldForceFaceView(dialogueText, visualText, panelCharacters)) {
          viewAngle = "front";
        }

        const panelKind = panel.panelKind || "standard";
        const stylePreset = buildStylePreset(globalStylePreset);

        if (isWorldExplanation(dialogueText)) {
          sceneFocus = "environment";
        }

        const composition = getPanelComposition(panelKind, sceneFocus, storyProfile.mode);

        let charactersData = [];

        if (sceneFocus !== "environment") {
          let names = [];

          if (uniqueDetected.length > 0) {
            names = [...uniqueDetected];
          } else if (Array.isArray(panelCharacters) && panelCharacters.length > 0) {
            names = panelCharacters;
          } else {
            names = extractTrackedCharacterNames(`${visualText} ${dialogueText}`);
          }

          names = prioritizeStoryCharacters(names, dialogueText, visualText);

          names = names.filter(n =>
            ["karol", "cristian", "kelvin", "mefisto"].includes(String(n).toLowerCase())
          );

          if (forcedImportant.length >= 2) {
            names = [...forcedImportant, ...names.filter(n => !forcedImportant.includes(n))];
          }

          const limit = sceneFocus === "two_characters" ? 2 : 1;
          const uniqueNames = [...new Set(names.map(n => normalizeName(n)).filter(Boolean))];

          for (const rawName of uniqueNames.slice(0, limit)) {
            const name = normalizeName(rawName);
            if (!name) continue;

            let character = await findCharacter(title, name);

            if (!character || (character.profileVersion || 1) < 7) {
              character = await createOrUpdateCharacter(
                title,
                name,
                `${visualText}\n${dialogueText}`,
                globalStylePreset
              );
            }

            character = await ensureCharacterReference(character);

            const existsAlready = charactersData.some(
              c => c.name.toLowerCase() === character.name.toLowerCase()
            );

            if (!existsAlready) {
              charactersData.push(character);
            }
          }
        }

        if (sceneFocus === "two_characters" && charactersData.length < 2) {
          sceneFocus = "single_character";
        }

        const framingTag = storyProfile.defaultPanelTag;
        const extraFramingRules =
          storyProfile.mode === "youtube"
            ? `
horizontal cinematic framing,
16:9 safe composition,
important subjects centered,
leave space on left and right,
avoid close crop,
avoid face near edges,
avoid cutting head or body,
wide readable staging
`
            : `
vertical mobile framing,
strong central composition,
close readable focus,
portrait-friendly staging
`;

        let finalPrompt = "";

        if (isWorldExplanation(dialogueText)) {
          finalPrompt = `
${buildWorldExplanationPrompt(dialogueText, stylePreset, storyProfile.mode)},
${composition.camera},
${composition.composition},
${composition.extra},
${framingTag},
${extraFramingRules},
manga infographic style,
clear symbolic composition
`;
        } else if (sceneFocus === "environment") {
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
${framingTag},
${extraFramingRules},

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
        } else if (sceneFocus === "two_characters" && charactersData.length >= 2) {
          const charA = charactersData[0];
          const charB = charactersData[1];

          const safeVisualText = sanitizeMultiCharacterText(visualText);
          const safeDialogueText = sanitizeMultiCharacterText(dialogueText);

          const karolLockA = charA.name.toLowerCase() === "karol" ? `
STRICT KAROL CANON:
long straight chestnut brown hair,
chestnut brown hair only,
brown hair only,
same exact hairstyle,
same exact face,
fair skin,
golden brown eyes,
recognizable feminine face,
elegant young woman,
never black hair,
never blonde hair,
never white hair,
never blue hair,
do not change hair color under any lighting
` : "";

          const karolLockB = charB.name.toLowerCase() === "karol" ? `
STRICT KAROL CANON:
long straight chestnut brown hair,
chestnut brown hair only,
brown hair only,
same exact hairstyle,
same exact face,
fair skin,
golden brown eyes,
recognizable feminine face,
elegant young woman,
never black hair,
never blonde hair,
never white hair,
never blue hair,
do not change hair color under any lighting
` : "";

          const mefistoLockA = charA.name.toLowerCase() === "mefisto" ? `
STRICT MEFISTO CANON:
cat ears ALWAYS visible,
cat ears clearly defined,
long sapphire blue hair,
blue hair only,
emerald green glowing eyes,
green eyes only,
ethereal mystical aura,
spiritual particles visible,
no other character design,
not human generic girl
` : "";

          const mefistoLockB = charB.name.toLowerCase() === "mefisto" ? `
STRICT MEFISTO CANON:
cat ears ALWAYS visible,
cat ears clearly defined,
long sapphire blue hair,
blue hair only,
emerald green glowing eyes,
green eyes only,
ethereal mystical aura,
spiritual particles visible,
no other character design,
not human generic girl
` : "";

          finalPrompt = `
exactly two characters,
only two characters,
both characters clearly visible,
both faces visible,
both heads visible,
left character and right character,
medium two-shot,
waist-up or full-body composition,
clear separation between both characters,
visible gap between bodies,
no touching,
hands separated,
arms separated,
no merged hands,
no merged arms,
no fused bodies,
no overlap hiding either character,
no romantic pose,
no intimate pose,
no embrace,
no hand holding,
no cheek contact,
no face touching,
not a solo portrait,
not a crowd,
not three characters,
balanced composition,
clean silhouette separation,
must visually represent the narrative described,

${stylePreset},

Character A:
${charA.identityPrompt}
${buildCharacterConsistencyAnchor(charA)}
${karolLockA}
${mefistoLockA}
${charA.gender === "female"
  ? "female body, feminine face, no male traits"
  : "male body, masculine face, no female traits"}

Character B:
${charB.identityPrompt}
${buildCharacterConsistencyAnchor(charB)}
${karolLockB}
${mefistoLockB}
${charB.gender === "female"
  ? "female body, feminine face, no male traits"
  : "male body, masculine face, no female traits"}

STRICT CHARACTER CONSISTENCY:
same face,
same hair color,
same hairstyle,
same eye color,
same outfit,
same proportions,
no variation allowed,
no reinterpretation,
no alternate design,
do not change hair color under any lighting,
do not change identity between panels

SCENE ACTION:
${safeVisualText}

EMOTIONAL CONTEXT:
${safeDialogueText}

CAMERA:
${composition.camera},

${composition.composition},
${composition.extra},
${framingTag},
${extraFramingRules},

cinematic manga storytelling,
clear focal point,
balanced anatomy,
both characters readable
`;
        } else if (charactersData.length >= 1) {
          const char = charactersData[0];
          let mefistoBoost = "";

          if (char.name.toLowerCase() === "mefisto") {
            mefistoBoost = `
STRICT MEFISTO VISUAL LOCK,

cat ears clearly visible,
long sapphire blue hair,
blue hair only,
emerald glowing eyes,
green eyes only,
mystical aura visible,
spiritual particles around,
ethereal lighting,
fantasy presence,

NOT HUMAN GIRL,
SPIRITUAL ENTITY,
MYSTICAL BEING,

no black hair,
no brown hair,
no blonde hair,
no white hair,
no casual outfit,
must look like fantasy guide,

high detail anime face,
consistent identity,
same exact character
`;
          }

          const consistencyAnchor = buildCharacterConsistencyAnchor(char);
          const backViewAnchor = buildBackViewAnchor(char);

          if (viewAngle === "back") {
            finalPrompt = `
single character focus,
only ${char.name} visible,
no other people,
${stylePreset},

${char.identityPrompt}
${mefistoBoost}

${consistencyAnchor}
${backViewAnchor}

CURRENT ACTION:
${visualText}

EMOTIONAL CONTEXT:
${dialogueText}

must visually represent the narrative described,
must match the dialogue context,
no unrelated objects,
no empty environment unless explicitly requested,
focus on the character involved in the dialogue,

CAMERA:
${composition.camera},

${composition.composition},
${composition.extra},
${framingTag},
${extraFramingRules},

full body or three-quarter back view,
same character as previous panel,
recognizable from behind,
clear silhouette,
distinctive hairstyle,
distinctive outfit,
cinematic storytelling,
balanced anatomy,
no face visible or only partial face if needed,
no random cropping
`;
          } else if (viewAngle === "profile") {
            finalPrompt = `
single character focus,
only ${char.name} visible,
no other people,
profile view,
side view,
portrait shot,
upper body visible,
full head visible,
no torso-only crop,
no chest-only crop,
no random cropping,
${stylePreset},

${char.identityPrompt}
${mefistoBoost}

${consistencyAnchor}

CURRENT ACTION:
${visualText}

EMOTIONAL CONTEXT:
${dialogueText}

must visually represent the narrative described,
must match the dialogue context,
no unrelated objects,
focus on the character involved in the dialogue,

${storyProfile.mode === "youtube" ? `
prefer medium shot or wider framing,
full head visible,
keep shoulders and upper torso comfortably inside frame,
avoid oversized face crop,
leave horizontal side breathing room
` : `
prefer portrait readability,
character can be closer to camera,
keep face strong and readable
`}

CAMERA:
${composition.camera},

${composition.composition},
${composition.extra},
${framingTag},
${extraFramingRules},

clear side profile,
recognizable hairstyle,
same character as previous panel,
balanced anatomy,
high detail face,
cinematic storytelling
`;
          } else {
            finalPrompt = `
single character focus,
only ${char.name} visible,
no other people,
portrait shot,
upper body visible,
full face visible,
full head visible,
neck visible,
shoulders visible,
eyes visible,
no face crop,
no head crop,
no chest-only crop,
no torso-only crop,
no legs-only shot,
no feet-only shot,
no random cropping,
centered character framing,

${stylePreset},

${char.identityPrompt}
${mefistoBoost}

${consistencyAnchor}

CURRENT ACTION:
${visualText}

EMOTIONAL CONTEXT:
${dialogueText}

must visually represent the narrative described,
must match the dialogue context,
no unrelated objects,
no empty environment unless explicitly requested,
focus on the character involved in the dialogue,

${storyProfile.mode === "youtube" ? `
prefer medium shot or wider framing,
full head visible,
keep shoulders and upper torso comfortably inside frame,
avoid oversized face crop,
leave horizontal side breathing room,
safe 16:9 readability
` : `
prefer portrait readability,
character can be closer to camera,
keep face strong and readable
`}

CAMERA:
${composition.camera},

${composition.composition},
${composition.extra},
${framingTag},
${extraFramingRules},

clear focal point,
balanced anatomy,
high detail face,
cinematic storytelling
`;
          }
        } else {
          finalPrompt = `
${stylePreset},
${visualText},
${composition.camera},
${composition.composition},
${composition.extra},
${framingTag},
${extraFramingRules},
cinematic scene
`;
        }

        let imageResult;
        let payload;

        if (sceneFocus === "environment") {
          payload = {
            prompt: finalPrompt,
            seed: null,
            styleSeed: panelSeed,
            gender: null,
            identityPrompt: "",
            referenceImage: null,
            characterCount: 0,
            duoType: null,
          };
        } else {
          const charactersForPayload =
            sceneFocus === "two_characters"
              ? charactersData.slice(0, 2)
              : charactersData.slice(0, 1);

          payload = await buildGenerationPayload(
            {
              ...panel,
              imagePrompt: finalPrompt,
            },
            charactersForPayload,
            panelSeed
          );
        }

        imageResult = await generateImage(payload);

        const base64 = imageResult.image;

        if (
          imageResult.generatedReferenceImage &&
          payload.characterCount === 1 &&
          charactersData.length === 1 &&
          !charactersData[0].referenceImage
        ) {
          charactersData[0].referenceImage = imageResult.generatedReferenceImage;
          await charactersData[0].save();
        }

        const imageUrl = await uploadMangaImage(
          base64,
          page.page,
          panelIndex
        );

        panel.imageUrl = imageUrl;
        panelIndex++;
      }
    }

    return NextResponse.json({
      title,
      storyMode: storyProfile.mode,
      contentProfile,
      pages
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json({
      error: err.message
    });
  }
}

function shouldForceFaceView(dialogueText, visualText, panelCharacters = []) {
  const d = String(dialogueText || "").toLowerCase();
  const v = String(visualText || "").toLowerCase();
  const chars = (panelCharacters || []).map(c => String(c).toLowerCase());

  const mentionsImportantCharacter =
    chars.includes("karol") ||
    chars.includes("kelvin") ||
    chars.includes("cristian") ||
    chars.includes("mefisto") ||
    d.includes("karol") ||
    d.includes("kelvin") ||
    d.includes("cristian") ||
    d.includes("mefisto") ||
    v.includes("karol") ||
    v.includes("kelvin") ||
    v.includes("cristian") ||
    v.includes("mefisto");

  const isDialogueMoment =
    d.length > 0 &&
    !d.includes("clasificados en rangos") &&
    !d.includes("sistema de rangos");

  const explicitlyWalkingAway =
    v.includes("walking away") ||
    v.includes("from behind") ||
    v.includes("seen from behind") ||
    v.includes("de espaldas") ||
    v.includes("espalda");

  return mentionsImportantCharacter && isDialogueMoment && !explicitlyWalkingAway;
}

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
epic scale
`;
  }

  return "";
}

function getMangaStyle(title) {
  if (title.toLowerCase().includes("torres")) {
    return "dark_cultivator";
  }

  return "dark_cultivator";
}

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

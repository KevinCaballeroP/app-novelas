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
cat ears,
long sapphire blue hair,
emerald green eyes,
feminine face,
ethereal woman,
same exact character as before
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
recognizable masculine silhouette,
same male outfit from previous panels,
same slim masculine body
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

    referenceImage:
      charA.name?.toLowerCase() === "karol"
        ? (charA.referenceImage || charB.referenceImage || null)
        : charB.name?.toLowerCase() === "karol"
          ? (charB.referenceImage || charA.referenceImage || null)
          : (charA.referenceImage || null),

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
        : "",
    face: isFemale
      ? "refined feminine face"
      : "masculine face, strong jawline",
    body: isFemale
      ? "slim feminine body"
      : "slim masculine body, broad shoulders",
    default_clothing: "practical layered cultivator outfit, fully dressed",
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
  } catch {
    // seguimos con el raw completo
  }

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
      } catch {
        // intentar siguiente reparación
      }
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

  if (lowerName === "mefisto") {
    const identityPrompt = `
(1girl:1.6),
solo,
adult woman,
female spiritual guide,
cat ears,
long sapphire blue hair,
emerald green glowing eyes,
ethereal feminine aura,
mystical female spirit,
feminine face,
natural female anatomy,
slim feminine body,
elegant mystical robes,
fantasy guide entity,
no male traits,
same exact face,
same exact hairstyle,
recognizable character design
`;

    return await Character.findOneAndUpdate(
      { mangaTitle, name: cleanName },
      {
        $set: {
          identityPrompt,
          seed,
          referenceImage: null,
          gender: "female",
          visualStylePreset: stylePreset,
          profileVersion: 4
        }
      },
      {
        new: true,
        upsert: true
      }
    );
  }

  if (lowerName === "cristian") {
    const identityPrompt = `
(1man:1.8),
solo,
adult man,
Cristian Uribe,
masculine face,
strong jawline,
broad shoulders,
slim masculine body,
clear male anatomy,
dark eyes,
elegant rich adventurer style,
fully dressed,
story appropriate clothing,
no female traits,
no feminine traits,
same exact face,
same hairstyle,
recognizable male silhouette
`;

    return await Character.findOneAndUpdate(
      { mangaTitle, name: cleanName },
      {
        $set: {
          identityPrompt,
          seed,
          referenceImage: null,
          gender: "male",
          visualStylePreset: stylePreset,
          profileVersion: 4
        }
      },
      {
        new: true,
        upsert: true
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
        referenceImage: null,
        gender,
        visualStylePreset: stylePreset,
        profileVersion: 4
      }
    },
    {
      new: true,
      upsert: true
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

function prioritizeStoryCharacters(names = [], dialogueText = "", visualText = "") {
  const lowerDialogue = String(dialogueText || "").toLowerCase();
  const lowerVisual = String(visualText || "").toLowerCase();
  const ordered = [...names];
  const priority = [];

  if (lowerDialogue.includes("karol") || lowerVisual.includes("karol")) priority.push("Karol");
  if (lowerDialogue.includes("kelvin") || lowerVisual.includes("kelvin")) priority.push("Kelvin");
  if (lowerDialogue.includes("cristian") || lowerVisual.includes("cristian")) priority.push("Cristian");
  if (lowerDialogue.includes("mefisto") || lowerVisual.includes("mefisto")) priority.push("Mefisto");
  if (lowerDialogue.includes("uryan") || lowerVisual.includes("uryan")) priority.push("Uryan");
  if (lowerDialogue.includes("juan") || lowerVisual.includes("juan")) priority.push("Juan");

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

function inferSceneFocusFromNames(panelCharacters = [], visualText = "", dialogueText = "") {
  const explicit = Array.isArray(panelCharacters) ? panelCharacters.filter(Boolean) : [];
  if (explicit.length >= 2) return "two_characters";
  if (explicit.length === 1) return "single_character";

  const names = extractPossibleNames(`${visualText} ${dialogueText}`);
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

export async function POST(req) {
  try {
    await connectToDB();

    const { title, prompt, previousPages = [] } = await req.json();

    const safePrompt = String(prompt || "")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/"/g, "'")
      .replace(/\r/g, " ")
      .replace(/\n/g, " ");

    const globalStylePreset = getMangaStyle(title);
    const baseStyleSeed = generateStyleSeed(title);

    if (!prompt) {
      throw new Error("Prompt vacío");
    }

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
- Keep dialogue simple and short.
- Avoid nested quotes.
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
- sceneFocus="two_characters" when exactly two characters should appear.
- panelKind="panoramic_top" for opening world panels or big environment moments.
- panelKind="dialogue" for conversation scenes.
- panelKind="emotional_closeup" for emotional face emphasis.
- panelKind="action" for attack, tension, motion, impact.
- Keep dark xianxia / cultivator atmosphere when appropriate.
- Keep visual continuity.
- Do not omit any important spoken sentence from the story request.
- Prefer more panels instead of losing text.
- Every panel must advance story + text together.
- viewAngle="back" only when the story explicitly needs the character seen from behind.
- viewAngle="front" by default for character introduction or identity-important scenes.
- viewAngle="profile" for side conversation shots.
- When introducing an important character for the first time, prefer front view.
- When the dialogue mentions a relationship conflict between named characters, prefer showing those named characters in the panel.
- If Karol, Kelvin, Cristian, or Mefisto are mentioned in dialogue, prioritize them visually when appropriate.
- Avoid unrelated objects and empty shots.
- The imagePrompt must visually match the dialogue.

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

    let script = scriptRes.choices[0].message.content;
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
          if (panel.type === "thought") {
            panel.dialogue = "Un pensamiento silencioso pesa en el ambiente.";
          } else if (panel.type === "speech") {
            panel.dialogue = "…";
          } else {
            panel.dialogue = "La tensión del momento se extiende en silencio.";
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

        let sceneFocus =
          panel.sceneFocus ||
          inferSceneFocusFromNames(panel.characters, visualText, dialogueText) ||
          detectSceneType(visualText);

        let viewAngle = panel.viewAngle || detectViewAngle(visualText);
        const panelCharacters = Array.isArray(panel.characters) ? panel.characters : [];
        const inferredNames = extractPossibleNames(`${visualText} ${dialogueText}`);

        if (sceneFocus === "environment" && inferredNames.length >= 1) {
          sceneFocus = inferredNames.length >= 2 ? "two_characters" : "single_character";
        }

        if (sceneFocus === "environment" && hasCharacterPresence(visualText, panelCharacters)) {
          sceneFocus = "single_character";
        }

        if (shouldForceFaceView(dialogueText, visualText, panelCharacters)) {
          viewAngle = "front";
        }

        const panelKind = panel.panelKind || "standard";
        const stylePreset = buildStylePreset(globalStylePreset);

        if (isWorldExplanation(dialogueText)) {
          sceneFocus = "environment";
        }

        const composition = getPanelComposition(panelKind, sceneFocus);

        let charactersData = [];

        if (sceneFocus !== "environment") {
          let names = [];

          if (Array.isArray(panelCharacters) && panelCharacters.length > 0) {
            names = panelCharacters;
          } else {
            names = extractPossibleNames(`${visualText} ${dialogueText}`);
          }

          names = prioritizeStoryCharacters(names, dialogueText, visualText);

          const limit = sceneFocus === "two_characters" ? 2 : 1;
          const uniqueNames = [...new Set(names.map(n => normalizeName(n)).filter(Boolean))];

          for (const rawName of uniqueNames.slice(0, limit)) {
            const name = normalizeName(rawName);
            if (!name) continue;

            let character = await findCharacter(title, name);

            if (!character || (character.profileVersion || 1) < 4) {
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

          const safeVisualText = sanitizeTwoCharacterText(visualText);
          const safeDialogueText = sanitizeTwoCharacterText(dialogueText);

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

          finalPrompt = `
exactly two characters,
both characters clearly visible,
both faces visible,
both heads visible,
medium two-shot,
shared frame,
dual character composition,
not a solo portrait,
not a single-character shot,
no random cropping,
no legs-only shot,
no feet-only shot,
no torso-only shot,
no chest-only crop,
clear separation between both characters,
independent anatomy,
independent limbs,
no fused bodies,
no merged arms,
no merged hands,
no accidental extra limbs,
no overlap hiding the second character,
no romantic pose,
no intimate pose,
no hand holding,
no embrace,
must visually represent the narrative described,
must match the dialogue context,
no unrelated objects,
focus on the characters involved in the dialogue,

${stylePreset},

Character A:
${charA.identityPrompt}
${buildCharacterConsistencyAnchor(charA)}
${karolLockA}
${charA.gender === "female"
  ? "female body, feminine face, no male traits"
  : "male body, masculine face, no female traits"}

Character B:
${charB.identityPrompt}
${buildCharacterConsistencyAnchor(charB)}
${karolLockB}
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
female entity,
female presence,
feminine voice embodiment,
ethereal feminine aura,
mystical female spirit,
no male traits,
cat ears visible,
long sapphire hair,
emerald green eyes,
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

CAMERA:
${composition.camera},

${composition.composition},
${composition.extra},

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
        } else {
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
epic scale,
vertical manhwa composition
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
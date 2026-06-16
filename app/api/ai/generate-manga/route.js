import Groq from "groq-sdk";
import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/mongodb";
import { v2 as cloudinary } from "cloudinary";
import fetch from "node-fetch";
import Character from "@/models/Character";

// ─── Phase 1 helper modules ──────────────────────────────────────────────────
import {
  detectEnvironmentKeywords as _detectEnvironmentKeywords,
  detectObjectKeywords as _detectObjectKeywords,
  detectGroupScene as _detectGroupScene,
  detectAbilityKeywords as _detectAbilityKeywords,
} from "./helpers/detectors.js";
import {
  buildEnvironmentDetails as _buildEnvironmentDetails,
  buildObjectDetails as _buildObjectDetails,
} from "./helpers/environmentHelpers.js";
import { inferNarrativeVisualFocus as _inferNarrativeVisualFocus } from "./helpers/narrativeHelpers.js";
import {
  inferWorldMode as _inferWorldMode,
  buildWorldModeStylePreset as _buildWorldModeStylePreset,
} from "./helpers/worldModeHelpers.js";
// ─── Phase 2 prompt modules ───────────────────────────────────────────────────
import {
  buildCharacterConsistencyAnchor as _buildCharacterConsistencyAnchor,
  buildBackViewAnchor as _buildBackViewAnchor,
  buildSoloReferencePrompt as _buildSoloReferencePrompt,
  getDuoType as _getDuoType,
  buildDefaultAbilityProfile as _buildDefaultAbilityProfile,
  buildPersistentAbilityBlock as _buildPersistentAbilityBlock,
  buildTechniqueVariationBlock as _buildTechniqueVariationBlock,
} from "./prompts/characterPrompt.js";
import {
  detectCreatureKeywords as _detectCreatureKeywords,
  buildCreatureDetails as _buildCreatureDetails,
} from "./prompts/creaturePrompt.js";
import {
  detectSectMentions as _detectSectMentions,
  hasSectBannerFocus as _hasSectBannerFocus,
  buildSectBannerDetails as _buildSectBannerDetails,
  isEnvironmentDominantScene as _isEnvironmentDominantScene,
  isCreatureDominantScene as _isCreatureDominantScene,
  isObjectDominantScene as _isObjectDominantScene,
  buildAbilityDetails as _buildAbilityDetails,
  isWorldExplanation as _isWorldExplanation,
  buildWorldExplanationPrompt as _buildWorldExplanationPrompt,
} from "./prompts/environmentPrompt.js";
import { buildCrowdSupportPrompt as _buildCrowdSupportPrompt } from "./prompts/groupPrompt.js";
import {
  getPanelComposition as _getPanelComposition,
  buildStylePreset as _buildStylePreset,
  buildPersonalityBlock as _buildPersonalityBlock,
  shouldForceFaceView as _shouldForceFaceView,
} from "./prompts/cameraPrompt.js";
import {
  getMangaStyle as _getMangaStyle,
  detectSceneType as _detectSceneType,
} from "./prompts/negativePrompt.js";
// ─────────────────────────────────────────────────────────────────────────────


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

const LOCKED_CHARACTER_NAMES = [
  "Karol",
  "Cristian",
  "Kelvin",
  "Mefisto",
  "Shane",
"Shane Han",
  "Lian Han",
  "Sofía Gonzales",
"Farid León",
"Yang Hen",
"Maestro Yang Hen",
"Lucas Torres",
"Hermanos Torres",
];

const DETECTABLE_CHARACTER_NAMES = [
  "Karol",
  "Cristian",
  "Kelvin",
  "Mefisto",
  "Lex",
  "Natalia",
  "Camilo",
  "Jairo",
  "Yack",
  "Natalia Selecte",
  "Camilo Ricón",
  "Lex Stoll",
  "Jairo Velásquez",
  "Yack Parces",
    "Shane",
  "Shane Han",
  "Lin Kanc",
   "Lian Han",
   "Sofía",
"Sofía Gonzales",
"Farid",
"Farid León",
"Yang Hen",
"Maestro Yang Hen",
"Lucas",
"Lucas Torres",
"Hermanos Torres",
];

const CHARACTER_NAME_ALIASES = {
  karol: "Karol",
  cristian: "Cristian",
  kelvin: "Kelvin",
  mefisto: "Mefisto",

  lex: "Lex",
  alex: "Lex",
  "lex stoll": "Lex",
  "alex stoll": "Lex",

  natalia: "Natalia",
  "natalia selecte": "Natalia",

  camilo: "Camilo",
  "camilo ricon": "Camilo",
  "camilo ricón": "Camilo",

  jairo: "Jairo",
  "jairo velasquez": "Jairo",
  "jairo velásquez": "Jairo",

  yack: "Yack",
  "yack parces": "Yack",
    shane: "Shane",
  "shane han": "Shane",
  lin: "Lin Kanc",
  "lin kanc": "Lin Kanc",
  lian: "Lian Han",
"lian han": "Lian Han",
"maestra lian": "Lian Han",
"maestra lian han": "Lian Han",
sofia: "Sofía Gonzales",
"sofía": "Sofía Gonzales",
"sofia gonzales": "Sofía Gonzales",
"sofía gonzales": "Sofía Gonzales",

farid: "Farid León",
"farid leon": "Farid León",
"farid león": "Farid León",

"yang hen": "Yang Hen",
"maestro yang": "Yang Hen",
"maestro yang hen": "Yang Hen",

lucas: "Lucas Torres",
"lucas torres": "Lucas Torres",
"hermanos torres": "Lucas Torres",
};
const SECT_VISUALS = {
  "dragón carmesí": {
    canonical: "Dragón Carmesí",
    symbol: "crimson dragon emblem",
    colors: "crimson red, black, gold",
    banner: "long war banner with crimson dragon sigil",
    aura: "burning red spiritual aura"
  },
  "dragon carmesi": {
    canonical: "Dragón Carmesí",
    symbol: "crimson dragon emblem",
    colors: "crimson red, black, gold",
    banner: "long war banner with crimson dragon sigil",
    aura: "burning red spiritual aura"
  },
  "loto blanco": {
    canonical: "Loto Blanco",
    symbol: "white lotus emblem",
    colors: "white, silver, pale blue",
    banner: "elegant sect banner with white lotus sigil",
    aura: "pure white spiritual glow"
  },
  "sombra del alba": {
    canonical: "Sombra del Alba",
    symbol: "shadow dawn emblem",
    colors: "dark violet, black, orange dawn glow",
    banner: "dark sect banner with dawn-shadow sigil",
    aura: "shadow aura mixed with sunrise light"
  },
  "viento cortante": {
    canonical: "Viento Cortante",
    symbol: "cutting wind emblem",
    colors: "emerald green, silver, pale cyan",
    banner: "sect flag with sharp wind sigil",
    aura: "spiraling wind energy"
  },
  "filo del oeste": {
    canonical: "Filo del Oeste",
    symbol: "western blade emblem",
    colors: "steel gray, dark blue, silver",
    banner: "battle-worn sect banner with sword sigil",
    aura: "cold blade aura"
  },
  "montaña de hierro": {
    canonical: "Montaña de Hierro",
    symbol: "iron mountain emblem",
    colors: "iron gray, bronze, dark brown",
    banner: "heavy iron sect standard with mountain sigil",
    aura: "dense metallic spiritual pressure"
  },
  "corazón eterno": {
    canonical: "Corazón Eterno",
    symbol: "eternal heart emblem",
    colors: "gold, deep red, white",
    banner: "sacred sect banner with eternal heart sigil",
    aura: "radiant eternal energy"
  }
};
const BANNED_GENERIC_CHARACTER_NAMES = [
  "Gente",
  "Persona",
  "Nadie",
  "Alguien",
  "Hombre",
  "Mujer",
  "Chico",
  "Chica",
  "Joven",
  "Guerrero",
  "Maestro",
  "Discípulo",
  "Discipulo",
  "Aventurero",
  "Enemigo",
  "Extra",
  "Multitud",
  "Grupo",
  "Muchacho",
  "Muchacha",
  "Adulto",
  "Adulta",
  "Figura",
  "Sombra",
  "Desconocido",
  "Desconocida"
];
const CURRENT_PROFILE_VERSION = 10;

// ================= HELPERS =================
function normalizeName(name) {
  return String(name || "").trim();
}
export function getDefaultPanelAnimation(panel = {}) {
  const panelKind = String(panel?.panelKind || "").toLowerCase();
  const sceneFocus = String(panel?.sceneFocus || "").toLowerCase();
  const imagePrompt = String(panel?.imagePrompt || "").toLowerCase();
  const dialogue = String(panel?.dialogue || "").toLowerCase();
  const combined = `${imagePrompt} ${dialogue}`;

  if (
    panelKind === "action" ||
    combined.includes("attack") ||
    combined.includes("ataque") ||
    combined.includes("shockwave") ||
    combined.includes("explosion") ||
    combined.includes("golpe")
  ) {
    return {
      camera: "impact_zoom",
      motion: "action",
      transition: "blur_cut",
      frameHint: "multi_5",
      duration: 1.4,
      intensity: 0.85
    };
  }

  if (
    combined.includes("ability") ||
    combined.includes("habilidad") ||
    combined.includes("aura") ||
    combined.includes("transform") ||
    combined.includes("ira del dios de la guerra") ||
    combined.includes("llamas doradas")
  ) {
    return {
      camera: "fast_zoom",
      motion: "burst",
      transition: "flash",
      frameHint: "multi_5",
      duration: 1.6,
      intensity: 0.9
    };
  }

  if (sceneFocus === "environment" || panelKind === "panoramic_top") {
    return {
      camera: "vertical_pan",
      motion: "environment_drift",
      transition: "fade",
      frameHint: "multi_3",
      duration: 2.4,
      intensity: 0.25
    };
  }

  if (panelKind === "dialogue") {
    return {
      camera: "slow_push",
      motion: "dialogue",
      transition: "cut",
      frameHint: "multi_3",
      duration: 1.9,
      intensity: 0.2
    };
  }

  if (panelKind === "emotional_closeup") {
    return {
      camera: "slow_push",
      motion: "tension",
      transition: "fade",
      frameHint: "multi_3",
      duration: 2.1,
      intensity: 0.3
    };
  }

  return {
    camera: "slow_push",
    motion: "idle",
    transition: "fade",
    frameHint: "single",
    duration: 1.8,
    intensity: 0.35
  };
}
function isBannedGenericCharacterName(name) {
  const lower = normalizeName(name).toLowerCase();
  if (!lower) return true;

  return BANNED_GENERIC_CHARACTER_NAMES.some(
    (bad) => bad.toLowerCase() === lower
  );
}
function canonicalizeCharacterName(name) {
  const clean = normalizeName(name);
  if (!clean) return "";

  const lower = clean.toLowerCase();

  if (isBannedGenericCharacterName(lower)) {
    return "";
  }

  return CHARACTER_NAME_ALIASES[lower] || clean;
}

function dedupeCanonicalNames(names = []) {
  const seen = new Set();
  const out = [];

  for (const raw of names) {
    const canonical = canonicalizeCharacterName(raw);
    if (!canonical) continue;
    if (isBannedGenericCharacterName(canonical)) continue;

    const key = canonical.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(canonical);
  }

  return out;
}

async function findCharactersByNames(mangaTitle, names = []) {
  const canonicalNames = dedupeCanonicalNames(names);
  if (!canonicalNames.length) return [];

  const regexes = canonicalNames.map(
    (n) => new RegExp(`^${escapeRegex(n)}$`, "i")
  );

  return await Character.find({
    mangaTitle,
    name: { $in: regexes }
  });
}

async function extractDetectedCharacterNamesForTitle(mangaTitle, text) {
  const found = extractAllCharacterNames(text).map(canonicalizeCharacterName);
  const deduped = dedupeCanonicalNames(found).filter(
    (name) => !isBannedGenericCharacterName(name)
  );

  if (!deduped.length) return [];

  const existing = await findCharactersByNames(mangaTitle, deduped);
  const existingNames = new Set(
    existing
      .map((c) => normalizeNameLower(c.name))
      .filter((name) => !isBannedGenericCharacterName(name))
  );

  return deduped.filter((name) => {
    const lower = normalizeNameLower(name);

    if (isBannedGenericCharacterName(lower)) return false;

    return (
      DETECTABLE_CHARACTER_NAMES.some(
        (tracked) => tracked.toLowerCase() === lower
      ) || existingNames.has(lower)
    );
  });
}

function normalizeNameLower(name) {
  return normalizeName(name).toLowerCase();
}

function escapeRegex(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isLockedCharacterName(name) {
  return LOCKED_CHARACTER_NAMES.some(
    (n) => n.toLowerCase() === normalizeNameLower(name)
  );
}

function dedupeNames(names = []) {
  const seen = new Set();
  const out = [];

  for (const raw of names) {
    const clean = normalizeName(raw);
    if (!clean) continue;
    if (isBannedGenericCharacterName(clean)) continue;

    const key = clean.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(clean);
  }

  return out;
}

function sortCharactersForConsistency(characters = []) {
  return [...characters].sort((a, b) => {
    const aLocked = a?.referenceImage ? 1 : 0;
    const bLocked = b?.referenceImage ? 1 : 0;

    if (aLocked !== bLocked) return bLocked - aLocked;

    const aName = normalizeName(a?.name);
    const bName = normalizeName(b?.name);

    return aName.localeCompare(bName);
  });
}

function dedupeCharacters(characters = []) {
  const byId = new Map();
  const byName = new Map();

  for (const char of sortCharactersForConsistency(characters)) {
    if (!char) continue;

    const idKey = char?._id ? String(char._id) : null;
    const nameKey = normalizeNameLower(char?.name);

    if (idKey && !byId.has(idKey)) {
      byId.set(idKey, char);
    }

    if (nameKey && !byName.has(nameKey)) {
      byName.set(nameKey, char);
    } else if (nameKey) {
      const existing = byName.get(nameKey);

      const existingScore = existing?.referenceImage ? 2 : 0;
      const currentScore = char?.referenceImage ? 2 : 0;

      if (currentScore > existingScore) {
        byName.set(nameKey, char);
      }
    }
  }

  return [...byName.values()];
}

function preferReferenceCharacter(characters = [], preferredName = null) {
  if (!characters.length) return null;

  if (preferredName) {
    const exactWithRef = characters.find(
      (c) =>
        normalizeNameLower(c?.name) === normalizeNameLower(preferredName) &&
        c?.referenceImage
    );
    if (exactWithRef) return exactWithRef;

    const exactAny = characters.find(
      (c) => normalizeNameLower(c?.name) === normalizeNameLower(preferredName)
    );
    if (exactAny) return exactAny;
  }

  const withRef = characters.find((c) => !!c?.referenceImage);
  if (withRef) return withRef;

  return characters[0];
}

// ================= BUSCAR PERSONAJE =================
async function findCharacter(mangaTitle, name) {
  const cleanName = normalizeName(name);
  if (!cleanName) return null;
  if (isBannedGenericCharacterName(cleanName)) return null;

  return await Character.findOne({
    mangaTitle,
    name: { $regex: `^${escapeRegex(cleanName)}$`, $options: "i" },
  });
}

// ================= GENERAR SEED =================
function generateCharacterSeed(name) {
  let hash = 0;

  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }

  return Math.abs(hash) % 100000000;
}

export function generateStyleSeed(title) {
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
    t.includes("character") ||
    t.includes("disciple") ||
    t.includes("warrior") ||
    t.includes("master")
  );
}

// ─── Extracted to helpers/detectors.js (Phase 1) ────────────────────────────
const detectAbilityKeywords = _detectAbilityKeywords;
const detectEnvironmentKeywords = _detectEnvironmentKeywords;
const detectObjectKeywords = _detectObjectKeywords;
// ─────────────────────────────────────────────────────────────────────────────

// ─── Phase 2: extracted to prompts/ module ───────────────────────────────
const buildAbilityDetails = _buildAbilityDetails;

// ─── Extracted to helpers/detectors.js (Phase 1) ────────────────────────────
const detectGroupScene = _detectGroupScene;
// ─────────────────────────────────────────────────────────────────────────────

// ─── Extracted to helpers/environmentHelpers.js (Phase 1) ───────────────────
// Local aliases preserve all internal call-sites.
const buildEnvironmentDetails = _buildEnvironmentDetails;
const buildObjectDetails = _buildObjectDetails;
// ─────────────────────────────────────────────────────────────────────────────


export function forceLiteralEnvironmentPrompt(panel) {
  const dialogue = String(panel.dialogue || "").toLowerCase();
  const imagePrompt = String(panel.imagePrompt || "").toLowerCase();
  const combined = `${dialogue} ${imagePrompt}`;

  if (
    combined.includes("siete torres") ||
    combined.includes("7 torres") ||
    combined.includes("torres colosales") ||
    combined.includes("torres emergieron") ||
    combined.includes("las siete torres")
  ) {
    panel.sceneFocus = "environment";
    panel.panelKind = "panoramic_top";
    panel.characters = [];
    panel.imagePrompt = `
seven colossal ancient towers rising from different cities around the world,
one massive tower dominating the skyline,
world-scale supernatural event,
city streets below,
people tiny in the distance,
dramatic morning sky,
spiritual blue light pillars,
ancient mystical architecture,
wide establishing shot,
environment only,
no main character,
no anime girl portrait,
no single person focus
`.trim();
  }

  return panel;
}
// ─── Phase 2: extracted to prompts/ module ───────────────────────────────
const detectSectMentions = _detectSectMentions;
// ─── Phase 2: extracted to prompts/ module ───────────────────────────────
const hasSectBannerFocus = _hasSectBannerFocus;

// ─── Phase 2: extracted to prompts/ module ───────────────────────────────
const buildSectBannerDetails = _buildSectBannerDetails;

// ─── Phase 2: extracted to prompts/ module ───────────────────────────────
const buildCrowdSupportPrompt = _buildCrowdSupportPrompt;
// ─── Phase 2: extracted to prompts/ module ───────────────────────────────
const isEnvironmentDominantScene = _isEnvironmentDominantScene;

// ─── Phase 2: extracted to prompts/ module ───────────────────────────────
const isCreatureDominantScene = _isCreatureDominantScene;

// ─── Phase 2: extracted to prompts/ module ───────────────────────────────
const isObjectDominantScene = _isObjectDominantScene;
// ─── Extracted to helpers/narrativeHelpers.js (Phase 1) ──────────────────
// Wrapper: pre-computes trackedCount (needs extractDetectedCharacterNames which
// lives here), then delegates to the extracted pure helper.
function inferNarrativeVisualFocus({ visualText = "", dialogueText = "", panelCharacters = [] }) {
  const combined = `${visualText} ${dialogueText}`.toLowerCase();
  const trackedCount = extractDetectedCharacterNames(combined).length;
  return _inferNarrativeVisualFocus({ visualText, dialogueText, panelCharacters, trackedCount });
}
// ─────────────────────────────────────────────────────────────────────────────

// ─── Phase 2: extracted to prompts/ module ───────────────────────────────
const buildCharacterConsistencyAnchor = _buildCharacterConsistencyAnchor;

// ─── Phase 2: extracted to prompts/ module ───────────────────────────────
const buildBackViewAnchor = _buildBackViewAnchor;

// ─── Phase 2: extracted to prompts/ module ───────────────────────────────
const getDuoType = _getDuoType;

// ─── Phase 2: extracted to prompts/ module ───────────────────────────────
const buildSoloReferencePrompt = _buildSoloReferencePrompt;

// ─── Phase 2: extracted to prompts/ module ───────────────────────────────
const buildDefaultAbilityProfile = _buildDefaultAbilityProfile;

// ─── Phase 2: extracted to prompts/ module ───────────────────────────────
const buildPersistentAbilityBlock = _buildPersistentAbilityBlock;

async function ensureCharacterReference(character, options = {}) {
  if (!character) return null;

  const { forceRefresh = false } = options;

  if (character.referenceImage && !forceRefresh) {
    return character;
  }

  const payload = {
    prompt: buildSoloReferencePrompt(character),
    seed: character.seed || null,
    gender: character.gender || null,
    identityPrompt: character.identityPrompt || "",
    referenceImage: character.referenceImage || null,
    characterCount: 1,
    duoType: null,
    abilityName: character.abilityName || "",
    abilityPrompt: character.abilityPrompt || "",
    abilityColor: character.abilityColor || "",
    abilityVfx: Array.isArray(character.abilityVfx) ? character.abilityVfx : [],
  };
console.log(payload);
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

export async function buildGenerationPayload(panel, charactersInPanel, panelSeed = null) {
  const normalizedCharacters = dedupeCharacters(charactersInPanel || []);

  if (!normalizedCharacters || normalizedCharacters.length === 0) {
   return {
  prompt: panel.imagePrompt,
  seed: null,
  styleSeed: panelSeed,
  gender: null,
  identityPrompt: "",
  referenceImage: null,
  characterCount: 0,
  duoType: null,
  abilityName: "",
  abilityPrompt: "",
  abilityColor: "",
  abilityVfx: [],
  animation: panel.animation || getDefaultPanelAnimation(panel)
};
  }

  if (normalizedCharacters.length === 1) {
    let char = preferReferenceCharacter(normalizedCharacters);
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
  abilityName: char.abilityName || "",
  abilityPrompt: char.abilityPrompt || "",
  abilityColor: char.abilityColor || "",
  abilityVfx: Array.isArray(char.abilityVfx) ? char.abilityVfx : [],
  animation: panel.animation || getDefaultPanelAnimation(panel)
};
  }

  const sorted = sortCharactersForConsistency(normalizedCharacters).slice(0, 2);
  const charA = await ensureCharacterReference(sorted[0]);
  const charB = await ensureCharacterReference(sorted[1]);

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
    abilityName: charA.abilityName || "",
    abilityPrompt: charA.abilityPrompt || "",
    abilityColor: charA.abilityColor || "",
    abilityVfx: Array.isArray(charA.abilityVfx) ? charA.abilityVfx : [],
  },

  characterB: {
    name: charB.name,
    gender: charB.gender || null,
    identityPrompt: charB.identityPrompt || "",
    seed: charB.seed || null,
    referenceImage: charB.referenceImage || null,
    abilityName: charB.abilityName || "",
    abilityPrompt: charB.abilityPrompt || "",
    abilityColor: charB.abilityColor || "",
    abilityVfx: Array.isArray(charB.abilityVfx) ? charB.abilityVfx : [],
  },

  referenceImage: null,
  identityPrompt: null,
  abilityName: "",
  abilityPrompt: "",
  abilityColor: "",
  abilityVfx: [],
  animation: panel.animation || getDefaultPanelAnimation(panel)
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

export function parseStoryboardJson(content) {
  const raw = String(content || "").trim();

  const candidates = [];

  try {
    candidates.push(extractFirstJsonObject(raw));
  } catch (extractErr) {
    console.warn("⚠️ extractFirstJsonObject falló, intentando reparación directa...");
    console.error("EXTRACT ERROR:\n", extractErr);
  }

  candidates.push(raw);

  const uniqueCandidates = [...new Set(candidates.filter(Boolean))];

  for (const candidate of uniqueCandidates) {
    const attempts = [
      candidate,
      tryRepairJson(candidate),
      tryRepairLooseJson(candidate),
      tryRepairLooseJson(tryRepairJson(candidate)),
    ];

    for (const attempt of attempts) {
      try {
        const parsed = JSON.parse(attempt);

        if (parsed?.pages && Array.isArray(parsed.pages)) {
          return parsed;
        }
      } catch {}
    }
  }

  console.error("JSON RAW FROM GROQ:\n", raw);

  try {
    console.warn("⚠️ Usando fallback por JSON roto...");
    return extractPagesWithRegexFallback(raw);
  } catch (fallbackErr) {
    console.error("FALLBACK FAILED:\n", fallbackErr);
    throw new Error(`Groq devolvió un storyboard inválido: ${fallbackErr.message}`);
  }
}
async function createOrUpdateCharacter(mangaTitle, name, description, stylePreset) {
  const cleanName = normalizeName(name);
  if (!cleanName) return null;
  if (isBannedGenericCharacterName(cleanName)) return null;

  const lowerName = cleanName.toLowerCase();
  const seed = generateCharacterSeed(cleanName);
  const existingCharacter = await findCharacter(mangaTitle, cleanName);
  const defaultAbility = buildDefaultAbilityProfile(cleanName, description, stylePreset);

  if (lowerName === "mefisto") {
    const identityPrompt = `
(1girl:1.8),
solo,
adult woman,
Mefisto,

STRICT CHARACTER IDENTITY,
female spiritual guide,

cat ears ALWAYS visible,
cat ears clearly defined,
cat ears visible from any angle,
ears clearly separated from hair,
no hair covering ears,
no hidden cat ears,
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
divine spiritual guide presence,

slim feminine body,
elegant mystical robes,
cultivator robe style,
dark fantasy aesthetic,
fully dressed,

face must be feminine,
no male traits,
no androgynous face,
not generic anime girl,

same exact face,
same exact hairstyle,
same exact eye color,
same exact character,

NO IDENTITY DRIFT,
NO ALTERNATIVE DESIGN,
RECOGNIZABLE AS SAME CHARACTER
`;

    return await Character.findOneAndUpdate(
      {
        mangaTitle,
        name: { $regex: `^${escapeRegex(cleanName)}$`, $options: "i" },
      },
      {
       $set: {
  identityPrompt,
  seed,
  gender: "female",
  visualStylePreset: stylePreset,
  profileVersion: CURRENT_PROFILE_VERSION,
  lockIdentity: isLockedCharacterName(cleanName),

  cultivationLevel: existingCharacter?.cultivationLevel || "D3",
  evolutionStage: existingCharacter?.evolutionStage || 1,

  abilityName: existingCharacter?.abilityName || defaultAbility.abilityName,
  abilityPrompt: existingCharacter?.abilityPrompt || defaultAbility.abilityPrompt,
  abilityElements: existingCharacter?.abilityElements?.length ? existingCharacter.abilityElements : defaultAbility.abilityElements,
  abilityColor: existingCharacter?.abilityColor || defaultAbility.abilityColor,
  abilityVfx: existingCharacter?.abilityVfx?.length ? existingCharacter.abilityVfx : defaultAbility.abilityVfx,

  // 🔥 NUEVO
  combatStyle: existingCharacter?.combatStyle || "balanced",
  preferredShots: existingCharacter?.preferredShots?.length ? existingCharacter.preferredShots : [],
  animationProfile: existingCharacter?.animationProfile || "standard",
},
        $setOnInsert: {
          name: cleanName,
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
      {
        mangaTitle,
        name: { $regex: `^${escapeRegex(cleanName)}$`, $options: "i" },
      },
      {
       $set: {
  identityPrompt,
  seed,
gender: "male",
  visualStylePreset: stylePreset,
  profileVersion: CURRENT_PROFILE_VERSION,
  lockIdentity: isLockedCharacterName(cleanName),

  cultivationLevel: existingCharacter?.cultivationLevel || "D3",
  evolutionStage: existingCharacter?.evolutionStage || 1,

  abilityName: existingCharacter?.abilityName || defaultAbility.abilityName,
  abilityPrompt: existingCharacter?.abilityPrompt || defaultAbility.abilityPrompt,
  abilityElements: existingCharacter?.abilityElements?.length ? existingCharacter.abilityElements : defaultAbility.abilityElements,
  abilityColor: existingCharacter?.abilityColor || defaultAbility.abilityColor,
  abilityVfx: existingCharacter?.abilityVfx?.length ? existingCharacter.abilityVfx : defaultAbility.abilityVfx,

  // 🔥 NUEVO
  combatStyle: existingCharacter?.combatStyle || "balanced",
  preferredShots: existingCharacter?.preferredShots?.length ? existingCharacter.preferredShots : [],
  animationProfile: existingCharacter?.animationProfile || "standard",
},
        $setOnInsert: {
          name: cleanName,
          referenceImage: null,
        },
      },
      {
        new: true,
        upsert: true,
      }
    );
  }

    if (lowerName === "shane" || lowerName === "shane han") {
    const identityPrompt = `
(1woman:1.6),
solo,
adult woman,
Shane Han,
elegant but deadly,
long dark hair,
pale skin like moonlight,
cold light blue eyes,
sharp feminine face,
slim but strong feminine body,
graceful posture,
dark assassin robes,
subtle red dragon emblems,
cold aura,
composed expression,
no male traits,
no masculine face,
same exact face,
same exact hairstyle,
same exact eye color,
same exact character,
recognizable feminine silhouette,
dark fantasy cultivator aesthetic,
fully dressed
`;

    return await Character.findOneAndUpdate(
      {
        mangaTitle,
        name: { $regex: `^${escapeRegex(cleanName)}$`, $options: "i" },
      },
      {
        $set: {
          identityPrompt,
          seed,
          gender: "female",
          visualStylePreset: stylePreset,
          profileVersion: CURRENT_PROFILE_VERSION,
          lockIdentity: isLockedCharacterName(cleanName),

          cultivationLevel: existingCharacter?.cultivationLevel || "D3",
          evolutionStage: existingCharacter?.evolutionStage || 1,

          abilityName: existingCharacter?.abilityName || defaultAbility.abilityName,
          abilityPrompt: existingCharacter?.abilityPrompt || defaultAbility.abilityPrompt,
          abilityElements: existingCharacter?.abilityElements?.length
            ? existingCharacter.abilityElements
            : defaultAbility.abilityElements,
          abilityColor: existingCharacter?.abilityColor || defaultAbility.abilityColor,
          abilityVfx: existingCharacter?.abilityVfx?.length
            ? existingCharacter.abilityVfx
            : defaultAbility.abilityVfx,

          combatStyle: existingCharacter?.combatStyle || "balanced",
          preferredShots: existingCharacter?.preferredShots?.length
            ? existingCharacter.preferredShots
            : [],
          animationProfile: existingCharacter?.animationProfile || "standard",
        },
        $setOnInsert: {
           name: "Shane",
          referenceImage: null,
        },
      },
      {
        new: true,
        upsert: true,
      }
    );
  }
  if (lowerName === "lin kanc" || lowerName === "lin") {
    const identityPrompt = `
(1man:1.8),
solo,
adult man,
Lin Kanc,
cold dominant male cultivator,
dark hair,
crimson eyes,
sharp masculine face,
strong jawline,
broad shoulders,
slim masculine body,
oppressive aura,
dark cultivator robes,
red dragon details,
no female traits,
no feminine face,
same exact face,
same exact hairstyle,
same exact eye color,
same exact character,
recognizable male silhouette,
dark fantasy cultivator aesthetic,
fully dressed
`;

    return await Character.findOneAndUpdate(
      {
        mangaTitle,
        name: { $regex: `^${escapeRegex(cleanName)}$`, $options: "i" },
      },
      {
        $set: {
          identityPrompt,
          seed,
          gender: "male",
          visualStylePreset: stylePreset,
          profileVersion: CURRENT_PROFILE_VERSION,
          lockIdentity: isLockedCharacterName(cleanName),

          cultivationLevel: existingCharacter?.cultivationLevel || "D3",
          evolutionStage: existingCharacter?.evolutionStage || 1,

          abilityName: existingCharacter?.abilityName || defaultAbility.abilityName,
          abilityPrompt: existingCharacter?.abilityPrompt || defaultAbility.abilityPrompt,
          abilityElements: existingCharacter?.abilityElements?.length
            ? existingCharacter.abilityElements
            : defaultAbility.abilityElements,
          abilityColor: existingCharacter?.abilityColor || defaultAbility.abilityColor,
          abilityVfx: existingCharacter?.abilityVfx?.length
            ? existingCharacter.abilityVfx
            : defaultAbility.abilityVfx,

          combatStyle: existingCharacter?.combatStyle || "balanced",
          preferredShots: existingCharacter?.preferredShots?.length
            ? existingCharacter.preferredShots
            : [],
          animationProfile: existingCharacter?.animationProfile || "standard",
        },
        $setOnInsert: {
          name: cleanName,
          referenceImage: null,
        },
      },
      {
        new: true,
        upsert: true,
      }
    );
  }
  if (lowerName === "lian" || lowerName === "lian han" || lowerName === "maestra lian" || lowerName === "maestra lian han") {
  const identityPrompt = `
(1woman:1.7),
solo,
adult woman,
Lian Han,
strict female master,
dark blue cultivator robe,
deep navy blue robe only,
long dark hair,
cold elegant eyes,
cold authoritative gaze,
calm but intimidating expression,
refined mature feminine face,
slim graceful body,
powerful master presence,
thunder-like aura,
electric spiritual energy,
wind moving her robe,
sect elder aesthetic,
fully dressed,
no revealing outfit,
no sexualized clothing,
no male traits,
no masculine face,
same exact face,
same exact hairstyle,
same exact robe color,
same exact character,
recognizable female sect master,
dark fantasy cultivator aesthetic
`;

  return await Character.findOneAndUpdate(
    {
      mangaTitle,
      name: { $regex: `^${escapeRegex("Lian Han")}$`, $options: "i" },
    },
    {
      $set: {
        identityPrompt,
        seed: generateCharacterSeed("Lian Han"),
        gender: "female",
        visualStylePreset: stylePreset,
        profileVersion: CURRENT_PROFILE_VERSION,
        lockIdentity: true,

        cultivationLevel: existingCharacter?.cultivationLevel || "D3",
        evolutionStage: existingCharacter?.evolutionStage || 1,

        abilityName: existingCharacter?.abilityName || "Autoridad del Trueno",
        abilityPrompt: existingCharacter?.abilityPrompt || "cold thunder aura, blue electric spiritual pressure, master-level lightning presence",
        abilityElements: existingCharacter?.abilityElements?.length ? existingCharacter.abilityElements : ["lightning", "aura", "master"],
        abilityColor: existingCharacter?.abilityColor || "deep blue",
        abilityVfx: existingCharacter?.abilityVfx?.length ? existingCharacter.abilityVfx : [
          "blue lightning aura",
          "spiritual wind",
          "electric particles",
          "master pressure"
        ],

        combatStyle: existingCharacter?.combatStyle || "master",
        preferredShots: existingCharacter?.preferredShots?.length ? existingCharacter.preferredShots : ["medium shot", "authority pose", "wide sect shot"],
        animationProfile: existingCharacter?.animationProfile || "master_presence",
      },
      $setOnInsert: {
        name: "Lian Han",
        referenceImage: null,
      },
    },
    {
      new: true,
      upsert: true,
    }
  );
}
// ================= SOFÍA GONZALES =================
if (
  lowerName === "sofia" ||
  lowerName === "sofía" ||
  lowerName === "sofia gonzales" ||
  lowerName === "sofía gonzales"
) {
  const identityPrompt = `
(1woman:1.7),
solo,
adult woman,
Sofía Gonzales,
elegant female disciple,
long light brown hair,
light chestnut hair only,
amber eyes,
warm but refined expression,
serene spiritual aura,
slim feminine body,
graceful posture,
sect disciple robes,
light blue and silver clothing,
fully dressed,
cultivator aesthetic,
soft but intelligent beauty,
same exact face,
same exact hairstyle,
same exact eye color,
same exact character,
recognizable feminine silhouette,
dark fantasy cultivator aesthetic,
no male traits,
no masculine face
`;

  return await Character.findOneAndUpdate(
    {
      mangaTitle,
      name: { $regex: `^${escapeRegex("Sofía Gonzales")}$`, $options: "i" },
    },
    {
      $set: {
        identityPrompt,
        seed: generateCharacterSeed("Sofía Gonzales"),
        gender: "female",
        visualStylePreset: stylePreset,
        profileVersion: CURRENT_PROFILE_VERSION,
        lockIdentity: true,

        cultivationLevel: existingCharacter?.cultivationLevel || "D2",
        evolutionStage: existingCharacter?.evolutionStage || 1,

        abilityName: existingCharacter?.abilityName || "Aura Serena",
        abilityPrompt:
          existingCharacter?.abilityPrompt ||
          "serene spiritual aura, graceful light energy, refined disciple energy",
        abilityElements:
          existingCharacter?.abilityElements?.length
            ? existingCharacter.abilityElements
            : ["light", "grace", "aura"],
        abilityColor: existingCharacter?.abilityColor || "soft gold",
        abilityVfx:
          existingCharacter?.abilityVfx?.length
            ? existingCharacter.abilityVfx
            : ["light aura", "gentle particles", "refined glow"],

        combatStyle: existingCharacter?.combatStyle || "balanced",
        preferredShots:
          existingCharacter?.preferredShots?.length
            ? existingCharacter.preferredShots
            : ["medium shot", "elegant pose", "sect dialogue"],
        animationProfile:
          existingCharacter?.animationProfile || "graceful",
      },
      $setOnInsert: {
        name: "Sofía Gonzales",
        referenceImage: null,
      },
    },
    {
      new: true,
      upsert: true,
    }
  );
}

// ================= FARID LEÓN =================
if (
  lowerName === "farid" ||
  lowerName === "farid leon" ||
  lowerName === "farid león"
) {
  const identityPrompt = `
(1man:1.8),
solo,
adult man,
Farid León,
arrogant noble disciple,
dark hair,
dark hair only,
golden sect robes,
sharp masculine face,
cold arrogant eyes,
dominant noble expression,
broad shoulders,
slim powerful masculine body,
wealthy sect heir,
elite cultivator aesthetic,
golden aura,
high-status presence,
same exact face,
same exact hairstyle,
same exact eye color,
same exact character,
recognizable male silhouette,
dark fantasy cultivator aesthetic,
fully dressed,
no female traits
`;

  return await Character.findOneAndUpdate(
    {
      mangaTitle,
      name: { $regex: `^${escapeRegex("Farid León")}$`, $options: "i" },
    },
    {
      $set: {
        identityPrompt,
        seed: generateCharacterSeed("Farid León"),
        gender: "male",
        visualStylePreset: stylePreset,
        profileVersion: CURRENT_PROFILE_VERSION,
        lockIdentity: true,

        cultivationLevel: existingCharacter?.cultivationLevel || "D1",
        evolutionStage: existingCharacter?.evolutionStage || 1,

        abilityName: existingCharacter?.abilityName || "Presión Dorada",
        abilityPrompt:
          existingCharacter?.abilityPrompt ||
          "golden oppressive aura, elite noble energy, spiritual pressure",
        abilityElements:
          existingCharacter?.abilityElements?.length
            ? existingCharacter.abilityElements
            : ["gold", "pressure", "authority"],
        abilityColor: existingCharacter?.abilityColor || "gold",
        abilityVfx:
          existingCharacter?.abilityVfx?.length
            ? existingCharacter.abilityVfx
            : ["golden aura", "dominant pressure", "light distortion"],

        combatStyle: existingCharacter?.combatStyle || "aggressive",
        preferredShots:
          existingCharacter?.preferredShots?.length
            ? existingCharacter.preferredShots
            : ["dominant pose", "arena confrontation", "noble close-up"],
        animationProfile:
          existingCharacter?.animationProfile || "dominant_rival",
      },
      $setOnInsert: {
        name: "Farid León",
        referenceImage: null,
      },
    },
    {
      new: true,
      upsert: true,
    }
  );
}

// ================= MAESTRO YANG HEN =================
if (
  lowerName === "yang hen" ||
  lowerName === "maestro yang hen" ||
  lowerName === "maestro yang"
) {
  const identityPrompt = `
(1man:1.9),
solo,
elder adult man,
Yang Hen,
supreme sect master,
gray cultivation robes,
storm master aesthetic,
electric spiritual aura,
powerful elder presence,
sharp mature masculine face,
long dark-gray hair,
spiritual beard,
cold authoritative gaze,
lightning pressure,
towering presence,
broad shoulders,
master cultivator body,
same exact face,
same exact hairstyle,
same exact aura,
same exact character,
recognizable elder silhouette,
thunder sect authority,
dark fantasy cultivator aesthetic,
fully dressed,
no female traits
`;

  return await Character.findOneAndUpdate(
    {
      mangaTitle,
      name: { $regex: `^${escapeRegex("Yang Hen")}$`, $options: "i" },
    },
    {
      $set: {
        identityPrompt,
        seed: generateCharacterSeed("Yang Hen"),
        gender: "male",
        visualStylePreset: stylePreset,
        profileVersion: CURRENT_PROFILE_VERSION,
        lockIdentity: true,

        cultivationLevel: existingCharacter?.cultivationLevel || "Nascent Soul",
        evolutionStage: existingCharacter?.evolutionStage || 5,

        abilityName: existingCharacter?.abilityName || "Autoridad del Trueno",
        abilityPrompt:
          existingCharacter?.abilityPrompt ||
          "massive lightning aura, overwhelming spiritual pressure, thunder authority",
        abilityElements:
          existingCharacter?.abilityElements?.length
            ? existingCharacter.abilityElements
            : ["lightning", "authority", "master"],
        abilityColor: existingCharacter?.abilityColor || "electric blue",
        abilityVfx:
          existingCharacter?.abilityVfx?.length
            ? existingCharacter.abilityVfx
            : [
                "lightning arcs",
                "storm pressure",
                "thunder aura",
                "spiritual dominance",
              ],

        combatStyle: existingCharacter?.combatStyle || "master",
        preferredShots:
          existingCharacter?.preferredShots?.length
            ? existingCharacter.preferredShots
            : ["wide authority shot", "master platform", "lightning descent"],
        animationProfile:
          existingCharacter?.animationProfile || "master_presence",
      },
      $setOnInsert: {
        name: "Yang Hen",
        referenceImage: null,
      },
    },
    {
      new: true,
      upsert: true,
    }
  );
}

// ================= LUCAS TORRES =================
if (
  lowerName === "lucas" ||
  lowerName === "lucas torres"
) {
  const identityPrompt = `
(1man:1.8),
solo,
adult man,
Lucas Torres,
strong loyal disciple,
short dark hair,
strong masculine face,
determined expression,
broad shoulders,
athletic cultivator body,
disciple combat robes,
reliable ally,
same exact face,
same exact hairstyle,
same exact character,
recognizable male silhouette,
dark fantasy cultivator aesthetic,
fully dressed,
no female traits
`;

  return await Character.findOneAndUpdate(
    {
      mangaTitle,
      name: { $regex: `^${escapeRegex("Lucas Torres")}$`, $options: "i" },
    },
    {
      $set: {
        identityPrompt,
        seed: generateCharacterSeed("Lucas Torres"),
        gender: "male",
        visualStylePreset: stylePreset,
        profileVersion: CURRENT_PROFILE_VERSION,
        lockIdentity: true,

        cultivationLevel: existingCharacter?.cultivationLevel || "D2",
        evolutionStage: existingCharacter?.evolutionStage || 1,

        abilityName: existingCharacter?.abilityName || "Defensa de Acero",
        abilityPrompt:
          existingCharacter?.abilityPrompt ||
          "solid combat aura, defensive pressure, disciplined warrior energy",
        abilityElements:
          existingCharacter?.abilityElements?.length
            ? existingCharacter.abilityElements
            : ["defense", "steel", "combat"],
        abilityColor: existingCharacter?.abilityColor || "steel gray",
        abilityVfx:
          existingCharacter?.abilityVfx?.length
            ? existingCharacter.abilityVfx
            : ["combat aura", "steel pressure", "disciplined stance"],

        combatStyle: existingCharacter?.combatStyle || "defensive",
        preferredShots:
          existingCharacter?.preferredShots?.length
            ? existingCharacter.preferredShots
            : ["combat stance", "brotherhood pose", "battle support"],
        animationProfile:
          existingCharacter?.animationProfile || "support_warrior",
      },
      $setOnInsert: {
        name: "Lucas Torres",
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
    {
      mangaTitle,
      name: { $regex: `^${escapeRegex(cleanName)}$`, $options: "i" },
    },
    {
      $set: {
  identityPrompt,
  seed,
  gender: "male",
  visualStylePreset: stylePreset,
  profileVersion: CURRENT_PROFILE_VERSION,
  lockIdentity: isLockedCharacterName(cleanName),

  cultivationLevel: existingCharacter?.cultivationLevel || "D3",
  evolutionStage: existingCharacter?.evolutionStage || 1,

  abilityName: existingCharacter?.abilityName || defaultAbility.abilityName,
  abilityPrompt: existingCharacter?.abilityPrompt || defaultAbility.abilityPrompt,
  abilityElements: existingCharacter?.abilityElements?.length ? existingCharacter.abilityElements : defaultAbility.abilityElements,
  abilityColor: existingCharacter?.abilityColor || defaultAbility.abilityColor,
  abilityVfx: existingCharacter?.abilityVfx?.length ? existingCharacter.abilityVfx : defaultAbility.abilityVfx,

  // 🔥 NUEVO
  combatStyle: existingCharacter?.combatStyle || "balanced",
  preferredShots: existingCharacter?.preferredShots?.length ? existingCharacter.preferredShots : [],
  animationProfile: existingCharacter?.animationProfile || "standard",
},
      $setOnInsert: {
        name: cleanName,
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
    "Rango",
    "Persona",
    "Gente",
    "Nadie",
    "Alguien",
    "Hombre",
    "Mujer",
    "Joven",
    "Guerrero",
    "Maestro",
    "Discípulo",
    "Discipulo",
    "Aventurero",
    "Enemigo",
    "Extra",
    "Grupo",
    "Multitud",
    "Muchacho",
    "Muchacha",
    "Adulto",
    "Adulta",
    "Figura",
    "Sombra",
    "Desconocido",
    "Desconocida"
  ]);

  const matches = text.match(/\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\b/g) || [];

  const filtered = matches.filter((word) => {
    if (stopWords.has(word)) return false;
    if (word.length <= 2) return false;
    if (isBannedGenericCharacterName(word)) return false;
    return true;
  });

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
    "juan",
  ];

  const found = [];

  for (const name of knownNames) {
    const regex = new RegExp(`\\b${escapeRegex(name)}\\b`, "i");
    if (regex.test(t)) {
      found.push(canonicalizeCharacterName(name));
    }
  }

  return dedupeCanonicalNames(found);
}
function extractAllCharacterNames(text) {
  const explicitNames = extractPossibleNames(text);
  const knownNames = extractKnownCharacterNames(text);

  return [...new Set(
    [...explicitNames, ...knownNames]
      .map(normalizeName)
      .filter(Boolean)
      .filter((name) => !isBannedGenericCharacterName(name))
  )];
}
function extractDetectedCharacterNames(text) {
  const found = extractAllCharacterNames(text).map(canonicalizeCharacterName);

  return dedupeCanonicalNames(
    found.filter((name) => {
      if (!name) return false;
      if (isBannedGenericCharacterName(name)) return false;

      return DETECTABLE_CHARACTER_NAMES.some(
        (tracked) => tracked.toLowerCase() === String(name).toLowerCase()
      );
    })
  );
}
function prioritizeStoryCharacters(names = [], dialogueText = "", visualText = "") {
  const lowerDialogue = String(dialogueText || "").toLowerCase();
  const lowerVisual = String(visualText || "").toLowerCase();
  const ordered = dedupeCanonicalNames(names);
  const priority = [];

  const importantOrder = [
    "Karol",
    "Kelvin",
    "Cristian",
    "Mefisto",
  ];

  for (const candidate of importantOrder) {
    const lower = candidate.toLowerCase();
    if (lowerDialogue.includes(lower) || lowerVisual.includes(lower)) {
      priority.push(candidate);
    }
  }

  const finalNames = [];

  for (const p of priority) {
    const found = ordered.find((n) => String(n).toLowerCase() === p.toLowerCase());
    if (found && !finalNames.some((x) => String(x).toLowerCase() === String(found).toLowerCase())) {
      finalNames.push(found);
    }
  }

  for (const n of ordered) {
    if (!finalNames.some((x) => String(x).toLowerCase() === String(n).toLowerCase())) {
      finalNames.push(n);
    }
  }

  return finalNames;
}

function isStrongTwoCharacterScene(dialogueText = "", visualText = "") {
  const text = `${dialogueText} ${visualText}`.toLowerCase();

  const trackedNames = [
    "karol",
    "cristian",
    "kelvin",
    "mefisto",
    "shane",
    "shane han",
    "lin kanc",
    "natalia",
    "camilo",
    "lex"
  ];

  const pairCount = trackedNames.filter((name) => text.includes(name)).length;

  if (pairCount < 2) return false;

  return (
    text.includes(" y ") ||
    text.includes(" junto a ") ||
    text.includes(" con ") ||
    text.includes(" conoció a ") ||
    text.includes(" habló con ") ||
    text.includes(" hablo con ") ||
    text.includes(" miró a ") ||
    text.includes(" miro a ") ||
    text.includes(" frente a ") ||
    text.includes(" acompañada de ") ||
    text.includes(" acompañado de ") ||
    text.includes(" pelear ") ||
    text.includes(" luchar ") ||
    text.includes(" lucharon juntos ") ||
    text.includes(" fight ") ||
    text.includes(" together ") ||
    text.includes(" duo ") ||
    text.includes(" juntos ")
  );
}

function inferSceneFocusFromNames(panelCharacters = [], visualText = "", dialogueText = "") {
  const explicit = Array.isArray(panelCharacters) ? panelCharacters.filter(Boolean) : [];
  if (explicit.length >= 3) return "group_scene";
  if (explicit.length >= 2) return "two_characters";
  if (explicit.length === 1) return "single_character";

  const names = extractDetectedCharacterNames(`${visualText} ${dialogueText}`);
  const unique = [...new Set(names.map(n => normalizeName(n).toLowerCase()))];

  if (unique.length >= 3) return "group_scene";
  if (unique.length >= 2) return "two_characters";
  if (unique.length === 1) return "single_character";

  return null;
}

function slugify(text = "") {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function uploadMangaImage(base64, mangaTitle, chapterNumber, page, panel) {
  const safeTitle = slugify(mangaTitle);
  const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const upload = await cloudinary.uploader.upload(
    `data:image/png;base64,${base64}`,
    {
      folder: `mangas/${safeTitle}/chapter_${chapterNumber}`,
      public_id: `page_${page}_panel_${panel}_${uniqueId}`,
      overwrite: false,
    }
  );

  return upload.secure_url;
}

export async function generateImage(payload) {
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

// ─── Phase 2: extracted to prompts/ module ───────────────────────────────
const getPanelComposition = _getPanelComposition;

// ─── Phase 2: extracted to prompts/ module ───────────────────────────────
const isWorldExplanation = _isWorldExplanation;

// ─── Phase 2: extracted to prompts/ module ───────────────────────────────
const buildWorldExplanationPrompt = _buildWorldExplanationPrompt;


export function getStoryProfile(contentProfile = "manga_long") {
  const mode = String(contentProfile || "manga_long").toLowerCase();

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
- If the story mentions a location, architecture, weapon, altar, lights, portal or environmental feature, it must be visible.
`,
      storyboardFormat: "cinematic horizontal manga storyboard",
      defaultPanelTag: "horizontal cinematic panel",
      targetPages: { min: 8, max: 14 },
      panelsPerPage: { min: 2, max: 4 }
    };
  }

  if (mode === "tiktok") {
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
- If the story mentions a tower, arena, sect, weapon, altar, portal, lights or other narrative object, it must still be visible.
`,
      storyboardFormat: "high-retention vertical short-form manga storyboard",
      defaultPanelTag: "vertical webtoon panel",
      targetPages: { min: 5, max: 9 },
      panelsPerPage: { min: 1, max: 3 }
    };
  }

  return {
    mode: "manga_long",
    dialogueRule: `
- Preserve the chapter's narrative richness.
- Do NOT over-compress exposition.
- Dialogue can be short, medium, or long depending on the beat.
- Allow narration boxes when useful.
- Keep emotional continuity, escalation and worldbuilding.
- Break long narrative blocks into multiple progressive beats instead of summarizing them.
- If the chapter contains several events, each event must get its own visual sequence.
- Never collapse multiple important events into a single panel.
- Important speeches may span multiple panels.
`,
    panelRule: `
- This is a long-form manga chapter, not a short-form recap.
- Prefer 3 to 5 panels per page.
- Prefer many pages when the source text is long.
- Each important paragraph, event, reveal, explanation, combat beat, training beat or location change must be expanded into 1 to 3 panels minimum.
- Scene transitions must be shown visually.
- Do not skip setup, reaction, consequence or atmosphere.
- The chapter must feel paced, cinematic and progressive.
`,
    imageRule: `
- Compose scenes as long-form vertical manga pages.
- Keep variety between close-up, medium shot, wide shot, environment shot and action shot.
- If the story mentions a city, tower, arena, library, sect, jungle, ruins, weapon, altar, lights, crystal, portal or beast, it must appear visually when relevant.
- Use establishing shots for new locations.
- Use reaction shots for emotional moments.
- Use multiple panels for training montages, tournament announcements, rule explanations and battle setups.
`,
    storyboardFormat: "long-form dark seinen manga storyboard",
    defaultPanelTag: "vertical manga panel",
    targetPages: { min: 8, max: 12 },
panelsPerPage: { min: 2, max: 3 }
  };
}

export function buildOpeningHook(title, prompt) {
  const raw = String(prompt || "").trim();

  if (!raw) {
    return `Something terrible is about to happen in ${title}.`;
  }

  const firstSentence =
    raw.split(/[.!?]/).map((x) => x.trim()).find(Boolean) || raw;

  if (firstSentence.length <= 90) return firstSentence;

  return `${firstSentence.slice(0, 90).trim()}...`;
}
function splitStoryIntoNarrativeBlocks(prompt = "") {
  return String(prompt || "")
    .replace(/\r/g, "\n")
    .split(/\n{2,}/)
    .map((x) => x.trim())
    .filter(Boolean);
}
export function splitStoryIntoGenerationBlocks(prompt = "", maxWordsPerBlock = 450) {
  const paragraphs = String(prompt || "")
    .replace(/\r/g, "\n")
    .split(/\n{2,}/)
    .map((x) => x.trim())
    .filter(Boolean);

  const blocks = [];
  let current = "";
  let currentWords = 0;

  for (const paragraph of paragraphs) {
    const words = countWords(paragraph);

    if (current && currentWords + words > maxWordsPerBlock) {
      blocks.push(current.trim());
      current = paragraph;
      currentWords = words;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
      currentWords += words;
    }
  }

  if (current.trim()) {
    blocks.push(current.trim());
  }

  return blocks.length ? blocks : [prompt];
}
function countWords(text = "") {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function countStoryboardPanels(storyboard) {
  if (!storyboard?.pages || !Array.isArray(storyboard.pages)) return 0;

  return storyboard.pages.reduce((acc, page) => {
    const panels = Array.isArray(page?.panels) ? page.panels.length : 0;
    return acc + panels;
  }, 0);
}

function storyboardCoversEnding(storyboard, originalPrompt = "") {
  const story = String(originalPrompt || "").toLowerCase();

  if (!story.includes("shane") && !story.includes("doble shi")) {
    return true;
  }

  const allText = (storyboard?.pages || [])
    .flatMap((page) => page.panels || [])
    .map((panel) => `${panel.dialogue || ""} ${panel.imagePrompt || ""}`)
    .join(" ")
    .toLowerCase();

  return (
    allText.includes("shane") &&
    allText.includes("doble shi") &&
    (
      allText.includes("vínculo") ||
      allText.includes("vinculo") ||
      allText.includes("destino")
    )
  );
}

function estimateStoryboardTargets(prompt = "", storyProfile = {}) {
  const blocks = splitStoryIntoNarrativeBlocks(prompt);
  const words = countWords(prompt);

  const explicitHeadingsBonus = (String(prompt || "").match(/[📜⚖️🔥❄️🌸🍂]/g) || []).length;
  const paragraphCount = Math.max(blocks.length, 1);

  let estimatedPages;

  if (storyProfile?.mode === "tiktok") {
    estimatedPages = Math.max(
      storyProfile?.targetPages?.min || 5,
      Math.ceil(paragraphCount * 0.8)
    );
  } else if (storyProfile?.mode === "youtube") {
    estimatedPages = Math.max(
      storyProfile?.targetPages?.min || 8,
      Math.ceil(paragraphCount * 1.0)
    );
  } else {
    estimatedPages = Math.max(
      storyProfile?.targetPages?.min || 12,
      Math.ceil(paragraphCount * 1.35) + Math.ceil(words / 180) + explicitHeadingsBonus
    );
  }

  const minPages = storyProfile?.targetPages?.min || 12;
  const maxPages = storyProfile?.targetPages?.max || 22;

  estimatedPages = Math.max(minPages, Math.min(maxPages, estimatedPages));

  const minPanelsPerPage = storyProfile?.panelsPerPage?.min || 3;
  const maxPanelsPerPage = storyProfile?.panelsPerPage?.max || 5;

  const minPanels = estimatedPages * minPanelsPerPage;
  const maxPanels = estimatedPages * maxPanelsPerPage;

  return {
    narrativeBlocks: paragraphCount,
    words,
    targetPages: estimatedPages,
    minPages,
    maxPages,
    minPanels,
    maxPanels,
    minPanelsPerPage,
    maxPanelsPerPage
  };
}

async function expandStoryboardIfTooShort({
  storyboard,
  title,
  safePrompt,
  storyProfile,
  previousPages = [],
  openingHook
}) {
  const targets = estimateStoryboardTargets(safePrompt, storyProfile);

  let currentStoryboard = storyboard;
  let attempts = 0;
  const maxAttempts = 1;

  while (attempts < maxAttempts) {
    const currentPages = Array.isArray(currentStoryboard?.pages)
      ? currentStoryboard.pages.length
      : 0;

    const currentPanels = countStoryboardPanels(currentStoryboard);

    const needsExpansion =
      currentPages < targets.targetPages ||
      currentPanels < targets.minPanels ||
      !storyboardCoversEnding(currentStoryboard, safePrompt);

    if (!needsExpansion) {
      return currentStoryboard;
    }

    console.warn(
      `⚠️ Expansión ${attempts + 1}: páginas=${currentPages}, paneles=${currentPanels}, objetivo=${targets.targetPages} páginas / ${targets.minPanels} paneles`
    );

    const expandPrompt = `
Expand this manga storyboard because it is too compressed or does not include the ending.

Return ONLY valid JSON with this exact structure:

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

MANDATORY RULES:
- This is LONG-FORM manga, not a recap.
- Minimum pages required: ${targets.minPages}
- Target pages: ${targets.targetPages}
- Maximum pages: ${targets.maxPages}
- Minimum total panels required: ${targets.minPanels}
- Prefer ${targets.minPanelsPerPage} to ${targets.maxPanelsPerPage} panels per page.
- Do NOT summarize multiple major events into one panel.
- Do NOT stop in the middle of the chapter.
- The ending MUST be included.
- The final panels MUST adapt the final paragraph of the source text.
- Preserve training, mission, combat, rewards, alchemy, meditation, Shane connection and final Doble Shi narration if present.
- Every important paragraph or event must become its own visual sequence.
- Include setup, reaction, atmosphere, transition and consequence.
- Keep the first panel strong using this hook idea: "${openingHook}"

Previous pages continuity:
${previousPages.length ? JSON.stringify(previousPages).slice(0, 5000) : "[]"}

Original full story:
${safePrompt}

Current incomplete storyboard:
${JSON.stringify(currentStoryboard).slice(0, 22000)}
`;

    const expandRes = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0.2,
      messages: [{ role: "user", content: expandPrompt }]
    });

    currentStoryboard = parseStoryboardJson(expandRes.choices[0].message.content);
    attempts++;
  }

  return currentStoryboard;
}

export async function rewriteStoryAsMangaDirector({
  title,
  safePrompt,
  storyProfile,
  previousPages = [],
  openingHook,
}) {
  const directorPrompt = `
You are a professional dark seinen manga screenwriter and storyboard director.

Your job is NOT to summarize.
Your job is to adapt the source story into clear manga beats before storyboard generation.

Return ONLY valid JSON.

{
  "adaptedStory": "",
  "mustShow": [],
  "visualContinuity": [],
  "emotionalProgression": [],
  "keyObjects": [],
  "keyLocations": [],
  "keyCharacters": [],
  "forbiddenMistakes": []
}

RULES:
- Preserve the full story.
- Do not remove important events.
- Do not invent a different plot.
- Keep the same order of events.
- Break the story into visual manga beats.
- Mark important scenes that MUST appear visually.
- Mark objects, locations, powers, rewards, missions, alchemy, meditation, combat and final narration if present.
- Preserve emotional conflict and consequence.
- Keep continuity with previous pages.
- Avoid vague panels.
- Avoid symbolic replacement when the scene needs literal objects.
- If the story mentions a sect, tower, arena, portal, altar, weapon, beast, pill, reward or ability, it must be listed in mustShow.
- The ending must be preserved.

Manga title:
${title}

Storyboard format:
${storyProfile.storyboardFormat}

Opening hook:
${openingHook}

Previous pages:
${previousPages.length ? JSON.stringify(previousPages).slice(0, 5000) : "[]"}

Original story:
${safePrompt}
`;

  const res = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    temperature: 0.15,
    messages: [{ role: "user", content: directorPrompt }],
  });

  const raw = res.choices[0].message.content;

  try {
    const parsed = JSON.parse(extractFirstJsonObject(raw));

    return {
      adaptedStory: String(parsed.adaptedStory || safePrompt),
      mustShow: Array.isArray(parsed.mustShow) ? parsed.mustShow : [],
      visualContinuity: Array.isArray(parsed.visualContinuity)
        ? parsed.visualContinuity
        : [],
      emotionalProgression: Array.isArray(parsed.emotionalProgression)
        ? parsed.emotionalProgression
        : [],
      keyObjects: Array.isArray(parsed.keyObjects) ? parsed.keyObjects : [],
      keyLocations: Array.isArray(parsed.keyLocations) ? parsed.keyLocations : [],
      keyCharacters: Array.isArray(parsed.keyCharacters) ? parsed.keyCharacters : [],
      forbiddenMistakes: Array.isArray(parsed.forbiddenMistakes)
        ? parsed.forbiddenMistakes
        : [],
    };
  } catch (err) {
    console.warn("⚠️ Director manga falló, usando historia original:", err.message);

    return {
      adaptedStory: safePrompt,
      mustShow: [],
      visualContinuity: [],
      emotionalProgression: [],
      keyObjects: [],
      keyLocations: [],
      keyCharacters: [],
      forbiddenMistakes: [],
    };
  }
}

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
    const mangaDirector = await rewriteStoryAsMangaDirector({
  title,
  safePrompt,
  storyProfile,
  previousPages,
  openingHook,
});

    if (!prompt) {
      throw new Error("Prompt vacío");
    }

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

  const blockStoryboard = parseStoryboardJson(blockRes.choices[0].message.content);
  const blockPages = Array.isArray(blockStoryboard.pages)
    ? blockStoryboard.pages
    : [];

  allPages.push(...blockPages);

  continuityPages = [...continuityPages, ...blockPages].slice(-6);
}

let storyboard = {
  pages: allPages.map((page, index) => ({
    ...page,
    page: index + 1,
  })),
};

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

    forceLiteralEnvironmentPrompt(panel);
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
  const combinedPanelText = `${visualText} ${dialogueText}`;
  const hasAbility = detectAbilityKeywords(combinedPanelText);
  const abilityDetails = buildAbilityDetails(combinedPanelText);
  const creatureDetails = buildCreatureDetails(combinedPanelText);
  const hasCreatures = detectCreatureKeywords(combinedPanelText).length > 0;

  const sectBannerBlock = hasSectBannerFocus(combinedPanelText)
  ? `
SECT BANNER VISUAL RULES:
show the sect as a banner, flag, sigil, emblem, crest or ceremonial standard,
do not default to a random character portrait,
the sect identity must be represented visually through symbols,
the symbol must be readable and iconic,
if multiple sects are mentioned, show multiple banners or emblems in the scene,
prioritize heraldry, insignias, ritual standards and symbolic identity,
${buildSectBannerDetails(combinedPanelText)}
`
  : "";

  const abilityPromptBlock = hasAbility
    ? `
ABILITY VISUAL RULES:
the character is actively using a visible ability,
the power must be clearly visible,
the ability must dominate the visual storytelling,
no passive idle pose,
show action, motion and energy emission,
show impact on the environment if appropriate,
visual effects must match the described power,
${abilityDetails}
`
    : "";

  const creaturePromptBlock = hasCreatures
    ? `
CREATURE VISUAL RULES:
if the prompt mentions goblin or goblin lord, show a monster, not a human,
enemy must be non-human,
do not replace monsters with anime girls,
do not feminize monsters,
goblin lord must look brutal, monstrous and male-coded if described as such,
NON-HUMAN CREATURE:
grotesque anatomy,
asymmetrical face,
deformed proportions,
monstrous skin texture,
non-beautiful,
non-human facial structure,
avoid anime human face,
creature must look threatening and unnatural

CREATURE DETAILS:
${creatureDetails}
`
    : "";

 const rawPanelNames = Array.isArray(panel.characters) ? panel.characters : [];
const inferredNames = await extractDetectedCharacterNamesForTitle(
  title,
  `${visualText} ${dialogueText}`
);

let combinedNames = [...rawPanelNames, ...inferredNames]
  .map((n) => canonicalizeCharacterName(n))
  .filter(Boolean);
combinedNames = dedupeCanonicalNames(combinedNames);
const uniqueDetected = dedupeCanonicalNames(combinedNames);

const forcedImportant = combinedNames.filter((n) =>
  LOCKED_CHARACTER_NAMES.some(
    (locked) => locked.toLowerCase() === canonicalizeCharacterName(n).toLowerCase()
  )
);
        const strongTwoCharacterScene = isStrongTwoCharacterScene(dialogueText, visualText);

        let sceneFocus =
  inferNarrativeVisualFocus({
    visualText,
    dialogueText,
    panelCharacters: panel.characters
  }) ||
  panel.sceneFocus ||
  inferSceneFocusFromNames(panel.characters, visualText, dialogueText) ||
  detectSceneType(visualText);

let viewAngle = panel.viewAngle || detectViewAngle(visualText);
const panelCharacters = Array.isArray(panel.characters) ? panel.characters : [];
const combinedSceneText = `${visualText} ${dialogueText}`;

const environmentDominant = isEnvironmentDominantScene(combinedSceneText);
const creatureDominant = isCreatureDominantScene(combinedSceneText);
const objectDominant =
  isObjectDominantScene(combinedSceneText) ||
  hasSectBannerFocus(combinedSceneText);

// PRIORIDAD REAL
if (creatureDominant) {
  sceneFocus = "creature_focus";
} else if (environmentDominant) {
  sceneFocus = "environment";
} else if (objectDominant) {
  sceneFocus = "object_focus";
}

// solo permitir escenas de dos personajes si NO domina entorno/objeto/monstruo
if (
  !environmentDominant &&
  !objectDominant &&
  !creatureDominant &&
  uniqueDetected.length >= 2 &&
  strongTwoCharacterScene
) {
  sceneFocus = "two_characters";
}

// NO convertir automáticamente entorno a personaje si el entorno debe dominar
if (
  sceneFocus === "environment" &&
  !environmentDominant &&
  uniqueDetected.length >= 1
) {
  sceneFocus = "character_in_environment";
}

if (
  sceneFocus === "environment" &&
  !environmentDominant &&
  hasCharacterPresence(visualText, panelCharacters)
) {
  sceneFocus = "character_in_environment";
}

        if (shouldForceFaceView(dialogueText, visualText, panelCharacters)) {
          if (
            sceneFocus !== "environment" &&
            sceneFocus !== "character_in_environment" &&
            sceneFocus !== "object_focus" &&
            sceneFocus !== "group_scene"
          ) {
            viewAngle = "front";
          }
        }

        const panelKind = panel.panelKind || "standard";
        const stylePreset = buildStylePreset(globalStylePreset);

        if (isWorldExplanation(dialogueText)) {
          sceneFocus = "environment";
        }

        const composition = getPanelComposition(panelKind, sceneFocus, storyProfile.mode);

        let charactersData = [];

        if (
          sceneFocus !== "environment" &&
          sceneFocus !== "object_focus" &&
          sceneFocus !== "creature_focus"
        ) {
          let names = [];

          if (uniqueDetected.length > 0) {
            names = [...uniqueDetected];
          } else if (Array.isArray(panelCharacters) && panelCharacters.length > 0) {
            names = panelCharacters;
          } else {
            names = extractDetectedCharacterNames(`${visualText} ${dialogueText}`);
          }

          names = prioritizeStoryCharacters(names, dialogueText, visualText);
          const existingCharacters = await findCharactersByNames(title, names);
const existingNamesSet = new Set(
  existingCharacters.map((c) => normalizeNameLower(c.name))
);

names = names.filter((n) => {
  const lower = normalizeNameLower(n);

  if (isBannedGenericCharacterName(lower)) return false;

  return (
    DETECTABLE_CHARACTER_NAMES.some((x) => x.toLowerCase() === lower) ||
    existingNamesSet.has(lower)
  );
});

          if (forcedImportant.length >= 2) {
            names = [...forcedImportant, ...names.filter(n => !forcedImportant.includes(n))];
          }

          const limit = sceneFocus === "group_scene" ? 2 : sceneFocus === "two_characters" ? 2 : 1;
          const uniqueNames = dedupeNames(names).slice(0, limit);

          for (const rawName of uniqueNames) {
  const name = normalizeName(rawName);
  if (!name) continue;
  if (isBannedGenericCharacterName(name)) continue;

  let character = await findCharacter(title, name);

  if (!character) {
    character = await createOrUpdateCharacter(
      title,
      name,
      `${visualText}\n${dialogueText}`,
      globalStylePreset
    );
  } else if (
    (!character.referenceImage || !character.identityPrompt) &&
    (character.profileVersion || 1) < CURRENT_PROFILE_VERSION
  ) {
    character = await createOrUpdateCharacter(
      title,
      name,
      `${visualText}\n${dialogueText}`,
      globalStylePreset
    );
  }

  if (!character) continue;

  character = await ensureCharacterReference(character);
  charactersData.push(character);
}

          charactersData = dedupeCharacters(charactersData);
        }

       if (sceneFocus === "two_characters" && charactersData.length < 2) {
          sceneFocus = "single_character";
        }

        if (sceneFocus === "single_character" && charactersData.length > 1) {
          const preferredSingleName =
            uniqueDetected.find((n) => normalizeNameLower(n) === "mefisto") ||
            uniqueDetected[0] ||
            null;
          const preferredSingleCharacter = preferReferenceCharacter(
            charactersData,
            preferredSingleName
          );

          charactersData = preferredSingleCharacter ? [preferredSingleCharacter] : charactersData.slice(0, 1);
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
clear symbolic composition,
${abilityPromptBlock}
`;
        } else if (sceneFocus === "environment") {
          const envDetails = buildEnvironmentDetails(`${visualText} ${dialogueText}`);
          const objDetails = buildObjectDetails(`${visualText} ${dialogueText}`);
          const crowdSupport = buildCrowdSupportPrompt(`${visualText} ${dialogueText}`);

          finalPrompt = `
ENVIRONMENT DOMINANT PANEL,
do not reduce the panel to a portrait,
the place is the main subject,
show the location clearly,
show architecture clearly,
show narrative objects if mentioned,
wide shot,
establishing shot preferred,

${stylePreset},

SCENE:
${visualText}

ENVIRONMENT DETAILS:
${envDetails}

OBJECT DETAILS:
${objDetails}
${sectBannerBlock}
${creaturePromptBlock}

${abilityPromptBlock}

GROUP ATMOSPHERE:
${crowdSupport}

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
world-scale architecture,
spiritual worldbuilding,
must visually represent the narrative described,
if the story mentions a tower, the tower must be visible,
if the story mentions a sect, the sect architecture must be visible,
if the story mentions an arena, the arena must be visible,
if the story mentions lights, they must be visible,
if the story mentions a weapon or altar, it must be visible
`;
        } else if (sceneFocus === "object_focus") {
  const envDetails = buildEnvironmentDetails(`${visualText} ${dialogueText}`);
  const objDetails = buildObjectDetails(`${visualText} ${dialogueText}`);

  finalPrompt = `
object-focused narrative panel,
important object must dominate the frame,
no unnecessary face close-up,
no human portrait,
no character as main focus,
show the relevant item clearly,
show surrounding setting if needed,
if a sect is mentioned, prioritize banner, sigil, emblem, crest or ceremonial flag,
if multiple sects are mentioned, show multiple banners or floating emblems,
no random elegant woman,
no random cultivator portrait,
symbolic faction identity only,

${stylePreset},

SCENE:
${visualText}

EMOTIONAL CONTEXT:
${dialogueText}

ENVIRONMENT DETAILS:
${envDetails}

OBJECT DETAILS:
${objDetails}

${combinedPanelText.toLowerCase().includes("loto")
  ? `
LOTUS SCENE RULES:
sacred spiritual lotus,
mystical flower energy,
no romance,
no sensual pose,
no erotic interpretation,
spiritual energy phenomenon,
overwhelming aura effect,
hallucinatory mystical atmosphere,
the lotus is the focus, not intimacy
`
  : ""}

${sectBannerBlock}

${abilityPromptBlock}

CAMERA:
${composition.camera},

${composition.composition},
${composition.extra},
${framingTag},
${extraFramingRules},

close-up on object or medium shot depending on readability,
cinematic storytelling,
high detail prop rendering,
clear narrative emphasis,
if the story mentions a weapon, the weapon must be visible,
if the story mentions lights, the lights must be visible,
if the story mentions an artifact, altar, scroll or portal, it must be visible,
if the story mentions a sect, the sect must be represented as a flag, emblem, sigil, crest or standard
`;
} else if (sceneFocus === "creature_focus") {
  const envDetails = buildEnvironmentDetails(`${visualText} ${dialogueText}`);
  const objDetails = buildObjectDetails(`${visualText} ${dialogueText}`);

  finalPrompt = `
CREATURE DOMINANT PANEL,
monster is the main subject,
do not reduce the panel to a hero portrait,
do not place a human face as the foreground focus,
the creature must occupy most of the frame,
the monster must be clearly visible,
non-human anatomy,
grotesque anatomy,
threatening posture,
ugly asymmetrical face,
monster-focused composition,
if goblin or goblin lord is mentioned, it must look monstrous and non-human,

${stylePreset},

SCENE ACTION:
${visualText}

EMOTIONAL CONTEXT:
${dialogueText}

ENVIRONMENT DETAILS:
${envDetails}

OBJECT DETAILS:
${objDetails}

${creaturePromptBlock}

${abilityPromptBlock}

CAMERA:
${composition.camera},

${composition.composition},
${composition.extra},
${framingTag},
${extraFramingRules},

creature dominance,
enemy clearly visible,
violent monster presence,
dark fantasy horror energy,
no anime hero portrait,
no pretty humanoid monster,
no foreground protagonist
`;
        } else if (sceneFocus === "group_scene") {
          const envDetails = buildEnvironmentDetails(`${visualText} ${dialogueText}`);
          const objDetails = buildObjectDetails(`${visualText} ${dialogueText}`);
          const crowdSupport = buildCrowdSupportPrompt(`${visualText} ${dialogueText}`);

          finalPrompt = `
group scene,
multiple figures visible,
do not make it a solo portrait,
main figures readable,
background people also visible,
wide shot or medium wide shot,
show the environment clearly,
show narrative objects clearly,

${stylePreset},

SCENE ACTION:
${visualText}

EMOTIONAL CONTEXT:
${dialogueText}

ENVIRONMENT DETAILS:
${envDetails}

OBJECT DETAILS:
${objDetails}
${creaturePromptBlock}

${abilityPromptBlock}

GROUP DETAILS:
${crowdSupport}

CAMERA:
${composition.camera},

${composition.composition},
${composition.extra},
${framingTag},
${extraFramingRules},

cinematic manga storytelling,
scene must feel populated,
disciples or crowd visible when implied,
balanced group staging,
clear readable composition
`;
        } else if (sceneFocus === "two_characters" && charactersData.length >= 2) {
          const sortedPair = sortCharactersForConsistency(charactersData).slice(0, 2);
          const charA = sortedPair[0];
          const charB = sortedPair[1];
          const persistentAbilityA = buildPersistentAbilityBlock(charA, combinedPanelText);
          const persistentAbilityB = buildPersistentAbilityBlock(charB, combinedPanelText);

          const safeVisualText = sanitizeMultiCharacterText(visualText);
          const safeDialogueText = sanitizeMultiCharacterText(dialogueText);
          const envDetails = buildEnvironmentDetails(`${visualText} ${dialogueText}`);
          const objDetails = buildObjectDetails(`${visualText} ${dialogueText}`);

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
cat ears visible from any angle,
ears clearly separated from hair,
no hair covering ears,
no hidden cat ears,
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
cat ears visible from any angle,
ears clearly separated from hair,
no hair covering ears,
no hidden cat ears,
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
medium two-shot or medium wide shot,
clear separation between both characters,
visible gap between bodies,
INTERACTION RULE:
no physical contact unless explicitly stated,
maintain personal space,
neutral or tense distance,
focus on eye contact or stance,
no romantic or intimate positioning unless specified
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
not a solo portrait,
not a crowd,
not three characters,
balanced composition,
clean silhouette separation,
must visually represent the narrative described,
if the location matters, the location must be visible,
if an object matters, the object must be visible,

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
same face identity,
same hair color,
same hairstyle,
same eye color,
same proportions,
same recognizable character,
allow pose variation,
allow expression variation,
allow action variation,
allow outfit variation if the scene requires it,
allow technique-driven visual changes,
no reinterpretation into a different person,
no alternate identity,
do not change hair color under any lighting,
do not change identity between panels

SCENE ACTION:
${safeVisualText}

EMOTIONAL CONTEXT:
${safeDialogueText}

ENVIRONMENT DETAILS:
${envDetails}

OBJECT DETAILS:
${objDetails}

${creaturePromptBlock}

PERSISTENT ABILITY A:
${persistentAbilityA}

PERSISTENT ABILITY B:
${persistentAbilityB}

${abilityPromptBlock}

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
        } else if (sceneFocus === "character_in_environment" && charactersData.length >= 1) {
          const char =
            preferReferenceCharacter(
              dedupeCharacters(charactersData),
              uniqueDetected[0] || charactersData[0]?.name || null
            );

          const persistentAbilityBlock = buildPersistentAbilityBlock(char, combinedPanelText);
          const techniqueVariationBlock = buildTechniqueVariationBlock(char, combinedPanelText);
          const envDetails = buildEnvironmentDetails(`${visualText} ${dialogueText}`);
          const objDetails = buildObjectDetails(`${visualText} ${dialogueText}`);
          const crowdSupport = buildCrowdSupportPrompt(`${visualText} ${dialogueText}`);
          const consistencyAnchor = buildCharacterConsistencyAnchor(char);

          let mefistoBoost = "";
          if (char.name.toLowerCase() === "mefisto") {
            mefistoBoost = `
STRICT MEFISTO VISUAL LOCK,
cat ears ALWAYS visible,
cat ears clearly visible,
cat ears visible from any angle,
ears clearly separated from hair,
no hair covering ears,
no hidden cat ears,
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
must look like fantasy guide,
use the same established reference identity
`;
          }

          finalPrompt = `
single main character inside a strong visible environment,
character and environment both important,
do not crop into face-only portrait,
show the place clearly,
show architecture or setting clearly,
medium wide shot or wide shot,
full body or three-quarter body preferred,
environment must be readable,
object elements must be visible if mentioned,
do not reduce the panel to only a face,

${stylePreset},

${char.identityPrompt}
${mefistoBoost}
${consistencyAnchor}

SCENE ACTION:
${visualText}

EMOTIONAL CONTEXT:
${dialogueText}
TECHNIQUE VARIATION:
${techniqueVariationBlock}
ENVIRONMENT DETAILS:
${envDetails}

OBJECT DETAILS:
${objDetails}

${creaturePromptBlock}

PERSISTENT CHARACTER ABILITY:
${persistentAbilityBlock}

${abilityPromptBlock}

GROUP ATMOSPHERE:
${crowdSupport}

must visually represent the narrative described,
must show the setting described in the text,
must not reduce the scene to only a face close-up,
clear background storytelling,
character integrated into environment,
if the story mentions a tower, show the tower,
if the story mentions an arena, show the arena,
if the story mentions a sect, show sect architecture,
if the story mentions a weapon, show the weapon,
if the story mentions lights, show the lights,

CAMERA:
${composition.camera},

${composition.composition},
${composition.extra},
${framingTag},
${extraFramingRules},

cinematic manga storytelling,
environmental storytelling,
balanced anatomy,
clear focal hierarchy
`;
        } else if (charactersData.length >= 1) {
          const preferredSingleName =
            uniqueDetected.find((n) => normalizeNameLower(n) === "mefisto") ||
            charactersData[0]?.name ||
            null;

          const char = preferReferenceCharacter(charactersData, preferredSingleName);
          const persistentAbilityBlock = buildPersistentAbilityBlock(char, combinedPanelText);
          let mefistoBoost = "";

          if (char.name.toLowerCase() === "mefisto") {
            mefistoBoost = `
STRICT MEFISTO VISUAL LOCK,
cat ears ALWAYS visible,
cat ears clearly visible,
cat ears visible from any angle,
ears clearly separated from hair,
no hair covering ears,
no hidden cat ears,
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
must look like fantasy guide,
high detail anime face,
consistent identity,
same exact character,
use the same established reference identity
`;
          }

          const consistencyAnchor = buildCharacterConsistencyAnchor(char);
          const backViewAnchor = buildBackViewAnchor(char);

          if (viewAngle === "back") {
            finalPrompt = `
single character focus,
CHARACTER VARIATION RULES:
same identity, different scene,
same face, different pose,
same face, different expression,
same face, different action,
same face, different framing,
allow dynamic combat movement if the scene requires it,
allow visible technique effects if the scene requires it,
do not repeat the same portrait composition every panel,
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
focus on the character involved in the dialogue,

${creaturePromptBlock}
PERSISTENT CHARACTER ABILITY:
${persistentAbilityBlock}

${abilityPromptBlock}

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
no random cropping
`;
          } else if (viewAngle === "profile") {
            finalPrompt = `
single character focus,
CHARACTER VARIATION RULES:
same identity, different scene,
same face, different pose,
same face, different expression,
same face, different action,
same face, different framing,
allow dynamic combat movement if the scene requires it,
allow visible technique effects if the scene requires it,
do not repeat the same portrait composition every panel,
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

PERSISTENT CHARACTER ABILITY:
${persistentAbilityBlock}

${abilityPromptBlock}

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
CHARACTER VARIATION RULES:
same identity, different scene,
same face, different pose,
same face, different expression,
same face, different action,
same face, different framing,
allow dynamic combat movement if the scene requires it,
allow visible technique effects if the scene requires it,
do not repeat the same portrait composition every panel,
only ${char.name} visible,
no other people,
portrait shot or medium action shot depending on the scene,
if a technique is active, prefer medium wide shot,
if a technique is active, prefer three-quarter body or full body,
if a technique is active, do not use tight portrait framing,
upper body visible only when no ability is active,
full face visible or mostly visible,
three-quarter body preferred during combat,
full body allowed if action or technique requires it,
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
focus on the character involved in the dialogue,

PERSISTENT CHARACTER ABILITY:
${persistentAbilityBlock}

${abilityPromptBlock}

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
${abilityPromptBlock},
cinematic scene
`;
        }
        panel.animation = {
  ...getDefaultPanelAnimation(panel),
  ...(panel.animation || {})
};

        let imageResult;
        let payload;

       if (
  sceneFocus === "environment" ||
  sceneFocus === "object_focus" ||
  sceneFocus === "group_scene" ||
  sceneFocus === "creature_focus"
) {
          payload = {
  prompt: finalPrompt,
  seed: null,
  styleSeed: panelSeed,
  gender: null,
  identityPrompt: "",
  referenceImage: null,
  characterCount: 0,
  duoType: null,
  abilityName: "",
  abilityPrompt: "",
  abilityColor: "",
  abilityVfx: [],
  animation: panel.animation || getDefaultPanelAnimation(panel)
};
        } else {
          const charactersForPayload =
            sceneFocus === "two_characters"
              ? sortCharactersForConsistency(dedupeCharacters(charactersData)).slice(0, 2)
              : [preferReferenceCharacter(dedupeCharacters(charactersData))].filter(Boolean);

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
        title,
        chapterNumber || 1,
        page.page,
        panelIndex
      );

        panel.imageUrl = imageUrl;
panel.animation = payload.animation || panel.animation || getDefaultPanelAnimation(panel);
panel.directorIntent = String(panel.directorIntent || "").trim();
panel.emotionalBeat = String(panel.emotionalBeat || "").trim();
panel.visualPriority = String(panel.visualPriority || "medium").trim();

if (typeof panel.veoCandidate !== "boolean") {
  panel.veoCandidate = false;
}

panel.veoPrompt = String(panel.veoPrompt || "").trim();

if (!panel.directorIntent) {
  panel.directorIntent = "Clear manga storytelling beat.";
}

if (!panel.emotionalBeat) {
  panel.emotionalBeat = "tension";
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
panel.generatedFrames = Array.isArray(imageResult.frames) ? imageResult.frames : [];
panel.renderMeta = {
  steps: imageResult.steps,
  guidance: imageResult.guidance,
  lora_scale: imageResult.lora_scale,
  motionUsed: panel.animation?.motion || "idle"
};
        panelIndex++;
      }
    }
    const veoExport = [];

for (const page of pages) {
  for (const [index, panel] of (page.panels || []).entries()) {
    if (!panel.veoCandidate) continue;

    veoExport.push({
      page: page.page,
      panel: index + 1,
      dialogue: panel.dialogue || "",
      image: panel.image || panel.imageUrl || "",
      imagePrompt: panel.imagePrompt || "",
      veoPrompt: panel.veoPrompt || "",
      animation: panel.animation || null,
      visualPriority: panel.visualPriority || "medium",
      emotionalBeat: panel.emotionalBeat || "",
      manualVideoUrl: ""
    });
  }
}

    return NextResponse.json({
      title,
      storyMode: storyProfile.mode,
      contentProfile,
      pages,
      veoExport
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json({
      error: err.message
    });
  }
}

// ─── Phase 2: extracted to prompts/ module ───────────────────────────────
const shouldForceFaceView = _shouldForceFaceView;

// ─── Phase 2: extracted to prompts/ module ───────────────────────────────
const buildPersonalityBlock = _buildPersonalityBlock;

// ─── Phase 2: extracted to prompts/ module ───────────────────────────────
const buildStylePreset = _buildStylePreset;

// ─── Phase 2: extracted to prompts/ module ───────────────────────────────
export const getMangaStyle = _getMangaStyle;

// ─── Phase 2: extracted to prompts/ module ───────────────────────────────
const detectSceneType = _detectSceneType;
// ─── Phase 2: extracted to prompts/ module ───────────────────────────────
const detectCreatureKeywords = _detectCreatureKeywords;
const buildCreatureDetails = _buildCreatureDetails;


// ─── Phase 2: extracted to prompts/ module ───────────────────────────────
const buildTechniqueVariationBlock = _buildTechniqueVariationBlock;

// \u2500\u2500\u2500 Extracted to helpers/worldModeHelpers.js (Phase 1) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Re-exported with the same names so external importers (storyboard/route.js, etc.)
// continue to work without any changes.
export const inferWorldMode = _inferWorldMode;
export const buildWorldModeStylePreset = _buildWorldModeStylePreset;
// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500


/**
 * Exported function: generates image for a single panel.
 * Used by /api/manga/generate-panel-image endpoint.
 *
 * @param {object} options
 * @param {object} options.panel - Panel data (imagePrompt, dialogue, characters, sceneFocus, panelKind, viewAngle, animation, worldMode, ...)
 * @param {string} options.title - Manga title
 * @param {number} options.chapterNumber
 * @param {number} options.pageNumber
 * @param {number} options.panelIndex - 1-based panel index
 * @param {string} options.contentProfile
 * @returns {Promise<{imageUrl, finalPrompt, generatedFrames, renderMeta}>}
 */
export async function generateSinglePanelImage({
  panel,
  title,
  chapterNumber = 1,
  pageNumber = 1,
  panelIndex = 1,
  contentProfile = "tiktok",
}) {
  const storyProfile = getStoryProfile(contentProfile);
  const globalStylePreset = getMangaStyle(title);
  const baseStyleSeed = generateStyleSeed(title);
  const panelSeed = baseStyleSeed + pageNumber * 100 + panelIndex;

  const visualText = String(panel.imagePrompt || "").trim();
  const dialogueText = String(panel.dialogue || "").trim();
  const combinedPanelText = `${visualText} ${dialogueText}`;

  const hasAbility = detectAbilityKeywords(combinedPanelText);
  const abilityDetails = buildAbilityDetails(combinedPanelText);
  const creatureDetails = buildCreatureDetails(combinedPanelText);
  const hasCreatures = detectCreatureKeywords(combinedPanelText).length > 0;

  const sectBannerBlock = hasSectBannerFocus(combinedPanelText)
    ? `
SECT BANNER VISUAL RULES:
show the sect as a banner, flag, sigil, emblem, crest or ceremonial standard,
do not default to a random character portrait,
the sect identity must be represented visually through symbols,
the symbol must be readable and iconic,
if multiple sects are mentioned, show multiple banners or emblems in the scene,
prioritize heraldry, insignias, ritual standards and symbolic identity,
${buildSectBannerDetails(combinedPanelText)}
`
    : "";

  // group_scene and world_explanation never get ability rules
  // Use panel.sceneFocus directly here since manualSceneFocus is declared below.
  const panelSceneFocusRaw = String(panel.sceneFocus || "").trim().toLowerCase();
  const abilityPromptBlock =
    hasAbility &&
    panelSceneFocusRaw !== "group_scene" &&
    panelSceneFocusRaw !== "world_explanation" &&
    !isWorldExplanation(combinedPanelText)
      ? `
ABILITY VISUAL RULES:
the character is actively using a visible ability,
the power must be clearly visible,
the ability must dominate the visual storytelling,
no passive idle pose,
show action, motion and energy emission,
show impact on the environment if appropriate,
visual effects must match the described power,
${abilityDetails}
`
      : "";


  const rawPanelNames = Array.isArray(panel.characters) ? panel.characters : [];
  const inferredNames = await extractDetectedCharacterNamesForTitle(
    title,
    `${visualText} ${dialogueText}`
  );

  let combinedNames = [...rawPanelNames, ...inferredNames]
    .map((n) => canonicalizeCharacterName(n))
    .filter(Boolean);
  combinedNames = dedupeCanonicalNames(combinedNames);
  const uniqueDetected = dedupeCanonicalNames(combinedNames);

  const forcedImportant = combinedNames.filter((n) =>
    LOCKED_CHARACTER_NAMES.some(
      (locked) =>
        locked.toLowerCase() === canonicalizeCharacterName(n).toLowerCase()
    )
  );

  const strongTwoCharacterScene = isStrongTwoCharacterScene(
    dialogueText,
    visualText
  );

  const panelCharacters = Array.isArray(panel.characters)
    ? panel.characters
    : [];
  const combinedSceneText = `${visualText} ${dialogueText}`;

  const environmentDominant = isEnvironmentDominantScene(combinedSceneText);
  const creatureDominant = isCreatureDominantScene(combinedSceneText);
  const objectDominant =
    isObjectDominantScene(combinedSceneText) ||
    hasSectBannerFocus(combinedSceneText);

  // --- sceneFocus resolution ---
  // If the panel has an explicit sceneFocus (set manually in admin or by the storyboard),
  // it takes ABSOLUTE priority over any keyword-based heuristic.
  const manualSceneFocus = String(panel.sceneFocus || "").trim().toLowerCase();

  let sceneFocus = manualSceneFocus ||
    inferNarrativeVisualFocus({
      visualText,
      dialogueText,
      panelCharacters: panel.characters,
    }) ||
    inferSceneFocusFromNames(panel.characters, visualText, dialogueText) ||
    detectSceneType(visualText);

  // Keyword-based overrides — ONLY apply when no manual sceneFocus was provided.
  // This prevents creatureDominant from hijacking a deliberate "group_scene",
  // "environment", or any other manually chosen focus.
  if (!manualSceneFocus) {
    if (creatureDominant) sceneFocus = "creature_focus";
    else if (environmentDominant) sceneFocus = "environment";
    else if (objectDominant) sceneFocus = "object_focus";

    if (
      !environmentDominant &&
      !objectDominant &&
      !creatureDominant &&
      uniqueDetected.length >= 2 &&
      strongTwoCharacterScene
    ) {
      sceneFocus = "two_characters";
    }

    if (
      sceneFocus === "environment" &&
      !environmentDominant &&
      uniqueDetected.length >= 1
    ) {
      sceneFocus = "character_in_environment";
    }

    if (
      sceneFocus === "environment" &&
      !environmentDominant &&
      hasCharacterPresence(visualText, panelCharacters)
    ) {
      sceneFocus = "character_in_environment";
    }
  }
   // creaturePromptBlock is ONLY populated when the resolved sceneFocus is "creature_focus".
  // Even when dialogue mentions monsters/enemies, other scene types (group_scene, environment,
  // two_characters, etc.) must never receive CREATURE VISUAL RULES or CREATURE DETAILS.
  const creaturePromptBlock =
    sceneFocus === "creature_focus" && hasCreatures
      ? `
CREATURE VISUAL RULES:
if the prompt mentions goblin or goblin lord, show a monster, not a human,
enemy must be non-human,
do not replace monsters with anime girls,
do not feminize monsters,
goblin lord must look brutal, monstrous and male-coded if described as such,
NON-HUMAN CREATURE:
grotesque anatomy,
asymmetrical face,
deformed proportions,
monstrous skin texture,
non-beautiful,
non-human facial structure,
avoid anime human face,
creature must look threatening and unnatural

CREATURE DETAILS:
${creatureDetails}
`
      : "";

  let viewAngle = panel.viewAngle || detectViewAngle(visualText);

  if (shouldForceFaceView(dialogueText, visualText, panelCharacters)) {
    if (
      sceneFocus !== "environment" &&
      sceneFocus !== "character_in_environment" &&
      sceneFocus !== "object_focus" &&
      sceneFocus !== "group_scene"
    ) {
      viewAngle = "front";
    }
  }

  const panelKind = panel.panelKind || "standard";
  const baseStylePreset = buildStylePreset(globalStylePreset);

  // Resolve worldMode: use panel value, infer from text, or fall back to "auto"
  const resolvedWorldMode =
    panel.worldMode && panel.worldMode !== "auto"
      ? panel.worldMode
      : inferWorldMode(dialogueText, visualText);

  // Build style preset adapted to worldMode
  const stylePreset = buildWorldModeStylePreset(
    resolvedWorldMode,
    baseStylePreset,
    storyProfile.mode
  );

  if (!manualSceneFocus && isWorldExplanation(dialogueText)) {
    sceneFocus = "world_explanation";
  }

  const composition = getPanelComposition(panelKind, sceneFocus, storyProfile.mode);

  let charactersData = [];

  if (
    sceneFocus !== "environment" &&
    sceneFocus !== "object_focus" &&
    sceneFocus !== "creature_focus" &&
    sceneFocus !== "group_scene" &&     // group_scene is pure txt2img — no character references needed
    sceneFocus !== "world_explanation"  // world_explanation is pure infographic — no characters
  ) {
    let names = [];

    if (uniqueDetected.length > 0) {
      names = [...uniqueDetected];
    } else if (Array.isArray(panelCharacters) && panelCharacters.length > 0) {
      names = panelCharacters;
    } else {
      names = extractDetectedCharacterNames(`${visualText} ${dialogueText}`);
    }

    names = prioritizeStoryCharacters(names, dialogueText, visualText);
    const existingCharacters = await findCharactersByNames(title, names);
    const existingNamesSet = new Set(
      existingCharacters.map((c) => normalizeNameLower(c.name))
    );

    names = names.filter((n) => {
      const lower = normalizeNameLower(n);
      if (isBannedGenericCharacterName(lower)) return false;
      return (
        DETECTABLE_CHARACTER_NAMES.some((x) => x.toLowerCase() === lower) ||
        existingNamesSet.has(lower)
      );
    });

    if (forcedImportant.length >= 2) {
      names = [
        ...forcedImportant,
        ...names.filter((n) => !forcedImportant.includes(n)),
      ];
    }

    const limit =
      sceneFocus === "group_scene"
        ? 2
        : sceneFocus === "two_characters"
        ? 2
        : 1;
    const uniqueNames = dedupeNames(names).slice(0, limit);

    for (const rawName of uniqueNames) {
      const name = normalizeName(rawName);
      if (!name) continue;
      if (isBannedGenericCharacterName(name)) continue;

      let character = await findCharacter(title, name);

      if (!character) {
        character = await createOrUpdateCharacter(
          title,
          name,
          `${visualText}\n${dialogueText}`,
          globalStylePreset
        );
      } else if (
        (!character.referenceImage || !character.identityPrompt) &&
        (character.profileVersion || 1) < CURRENT_PROFILE_VERSION
      ) {
        character = await createOrUpdateCharacter(
          title,
          name,
          `${visualText}\n${dialogueText}`,
          globalStylePreset
        );
      }

      if (!character) continue;

      character = await ensureCharacterReference(character);
      charactersData.push(character);
    }

    charactersData = dedupeCharacters(charactersData);
  }

  if (sceneFocus === "two_characters" && charactersData.length < 2) {
    sceneFocus = "single_character";
  }

  if (sceneFocus === "single_character" && charactersData.length > 1) {
    const preferredSingleName =
      uniqueDetected.find((n) => normalizeNameLower(n) === "mefisto") ||
      uniqueDetected[0] ||
      null;
    const preferredSingleCharacter = preferReferenceCharacter(
      charactersData,
      preferredSingleName
    );
    charactersData = preferredSingleCharacter
      ? [preferredSingleCharacter]
      : charactersData.slice(0, 1);
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

  // --- Build finalPrompt (same logic as in the main POST loop) ---
  let finalPrompt = "";

  if (sceneFocus === "world_explanation" || isWorldExplanation(dialogueText)) {
    // Force sceneFocus to world_explanation for consistency
    sceneFocus = "world_explanation";
    finalPrompt = buildWorldExplanationPrompt(dialogueText, storyProfile.mode);
  } else if (sceneFocus === "environment") {
    const envDetails = buildEnvironmentDetails(`${visualText} ${dialogueText}`, resolvedWorldMode);
    const objDetails = buildObjectDetails(`${visualText} ${dialogueText}`, resolvedWorldMode);
    const crowdSupport = buildCrowdSupportPrompt(`${visualText} ${dialogueText}`);

    // Strip character-focused terms from the style preset for environment panels
    const environmentStylePreset = stylePreset
      .replace(/cultivator robes,?\s*/gi, "")
      .replace(/martial cultivator aesthetic,?\s*/gi, "")
      .replace(/portrait-friendly staging,?\s*/gi, "")
      .replace(/close readable focus,?\s*/gi, "");

    // Environment panels need wide landscape framing, not portrait/mobile framing
    const environmentFramingRules =
      storyProfile.mode === "youtube"
        ? `
horizontal cinematic framing,
16:9 safe composition,
wide landscape composition,
panoramic establishing shot,
leave generous space for architecture and environment,
avoid any face crop,
avoid character close-up,
wide readable staging
`
        : `
vertical wide framing,
grand establishing shot,
environment dominates the full frame,
no portrait crop,
no character focus,
panoramic storytelling
`;

    // Explicit negatives for environment panels
    const environmentNegatives = `
NEGATIVES — DO NOT GENERATE:
anime girl,
anime woman,
anime portrait,
portrait,
close-up face,
single character portrait,
character focus,
solo character,
face close-up,
random cultivator portrait,
random anime girl,
no character as main subject
`;

    finalPrompt = `
ENVIRONMENT DOMINANT PANEL,
the place is the main subject — NOT a character,
do not reduce the panel to a portrait,
do not add a random anime girl or character in the foreground,
show the location clearly,
show architecture clearly,
show narrative objects if mentioned,
wide shot,
establishing shot preferred,
architecture and worldbuilding are the visual priority,

${environmentStylePreset},

ENVIRONMENT FOCUS RULES:
prioritize architecture over character,
prioritize worldbuilding over portrait,
prioritize cityscape over face,
prioritize towers, buildings, landscapes, atmosphere,
environment storytelling,
epic scale,
grand scenery,

SCENE:
${visualText}

ENVIRONMENT DETAILS:
${envDetails}

OBJECT DETAILS:
${objDetails}
${sceneFocus === "environment" && (resolvedWorldMode === "cultivation_world" || resolvedWorldMode === "auto") ? sectBannerBlock : ""}
${creaturePromptBlock}

${abilityPromptBlock}

GROUP ATMOSPHERE:
${crowdSupport}

CAMERA:
${composition.camera},

${composition.composition},
${composition.extra},
${framingTag},
${environmentFramingRules},

${resolvedWorldMode === "modern_world" ? `
city environment storytelling,
high detail modern background,
urban cinematic atmosphere,
contemporary city landscape,
modern infrastructure clearly visible,
must visually represent the narrative described,
if the story mentions buildings, show modern buildings,
if the story mentions screens or TVs, show them,
if the story mentions streets, show modern streets,
if the story mentions crowds, show modern people in contemporary clothing
` : resolvedWorldMode === "tower_emergence" ? `
apocalyptic cityscape,
modern city streets below,
ancient colossal towers erupting from the ground,
world-scale supernatural event,
spiritual energy pillars,
blue energy beams from towers,
dramatic scale contrast: modern buildings vs ancient towers,
must visually represent the narrative described,
if the story mentions a tower, the tower must be visible and enormous,
if the story mentions lights or beams, they must be visible
` : resolvedWorldMode === "inside_tower" ? `
tower interior storytelling,
high detail dungeon background,
mystical atmospheric lighting,
ancient rune-covered walls,
dark fantasy dungeon aesthetic,
must visually represent the narrative described,
if the story mentions a monster, the monster must be visible,
if the story mentions a portal or door, it must be visible,
if the story mentions traps or trials, they must be visible
` : `
cinematic landscape,
high detail background,
dark mystical atmosphere,
ancient colossal towers,
world-scale architecture,
spiritual worldbuilding,
must visually represent the narrative described,
if the story mentions a tower, the tower must be visible,
if the story mentions a sect, the sect architecture must be visible,
if the story mentions an arena, the arena must be visible,
if the story mentions lights, they must be visible,
if the story mentions a weapon or altar, it must be visible
`}

${environmentNegatives}
`;
  } else if (sceneFocus === "object_focus") {
    const envDetails = buildEnvironmentDetails(`${visualText} ${dialogueText}`, resolvedWorldMode);
    const objDetails = buildObjectDetails(`${visualText} ${dialogueText}`, resolvedWorldMode);

    finalPrompt = `
object-focused narrative panel,
important object must dominate the frame,
no unnecessary face close-up,
no human portrait,
no character as main focus,
show the relevant item clearly,
show surrounding setting if needed,
if a sect is mentioned, prioritize banner, sigil, emblem, crest or ceremonial flag,
if multiple sects are mentioned, show multiple banners or floating emblems,
no random elegant woman,
no random cultivator portrait,
symbolic faction identity only,

${stylePreset},

SCENE:
${visualText}

EMOTIONAL CONTEXT:
${dialogueText}

ENVIRONMENT DETAILS:
${envDetails}

OBJECT DETAILS:
${objDetails}

${combinedPanelText.toLowerCase().includes("loto")
  ? `
LOTUS SCENE RULES:
sacred spiritual lotus,
mystical flower energy,
no romance,
no sensual pose,
no erotic interpretation,
spiritual energy phenomenon,
overwhelming aura effect,
hallucinatory mystical atmosphere,
the lotus is the focus, not intimacy
`
  : ""}

${sectBannerBlock}

${abilityPromptBlock}

CAMERA:
${composition.camera},

${composition.composition},
${composition.extra},
${framingTag},
${extraFramingRules},

close-up on object or medium shot depending on readability,
cinematic storytelling,
high detail prop rendering,
clear narrative emphasis,
if the story mentions a weapon, the weapon must be visible,
if the story mentions lights, the lights must be visible,
if the story mentions an artifact, altar, scroll or portal, it must be visible,
if the story mentions a sect, the sect must be represented as a flag, emblem, sigil, crest or standard
`;
  } else if (sceneFocus === "creature_focus") {
    const envDetails = buildEnvironmentDetails(`${visualText} ${dialogueText}`, resolvedWorldMode);
    const objDetails = buildObjectDetails(`${visualText} ${dialogueText}`, resolvedWorldMode);

    finalPrompt = `
CREATURE DOMINANT PANEL,
monster is the main subject,
do not reduce the panel to a hero portrait,
do not place a human face as the foreground focus,
the creature must occupy most of the frame,
the monster must be clearly visible,
non-human anatomy,
grotesque anatomy,
threatening posture,
ugly asymmetrical face,
monster-focused composition,
if goblin or goblin lord is mentioned, it must look monstrous and non-human,

${stylePreset},

SCENE ACTION:
${visualText}

EMOTIONAL CONTEXT:
${dialogueText}

ENVIRONMENT DETAILS:
${envDetails}

OBJECT DETAILS:
${objDetails}

${creaturePromptBlock}

${abilityPromptBlock}

CAMERA:
${composition.camera},

${composition.composition},
${composition.extra},
${framingTag},
${extraFramingRules},

creature dominance,
enemy clearly visible,
violent monster presence,
dark fantasy horror energy,
no anime hero portrait,
no pretty humanoid monster,
no foreground protagonist
`;
  } else if (sceneFocus === "group_scene") {
    const envDetails = buildEnvironmentDetails(`${visualText} ${dialogueText}`, resolvedWorldMode);
    const objDetails = buildObjectDetails(`${visualText} ${dialogueText}`, resolvedWorldMode);
    const crowdSupport = buildCrowdSupportPrompt(`${visualText} ${dialogueText}`);

    finalPrompt = `
group scene,
multiple figures clearly visible,
at least 8 people visible in the scene,
multiple full bodies shown,
crowd occupies the foreground and midground,
no single lone figure in an empty space,
no empty plaza or deserted environment,
group must dominate the frame,
characters in motion or ready stance,
no creature anatomy,
no monster design,
no non-human enemies unless the panel explicitly requires it,

${stylePreset},

SCENE ACTION:
${visualText}

EMOTIONAL CONTEXT:
${dialogueText}

ENVIRONMENT DETAILS:
${envDetails}

OBJECT DETAILS:
${objDetails}

GROUP DETAILS:
${crowdSupport}

CROWD RULES:
show multiple distinct silhouettes,
characters visible at different depths,
foreground figures partially cropped is acceptable,
midground figures fully visible,
background figures as silhouettes or partial,
group must feel like a real army, guild, crowd or team,
no single hero portrait in a crowd context,

CAMERA:
${composition.camera},

${composition.composition},
${composition.extra},
${framingTag},
${extraFramingRules},

cinematic manga storytelling,
scene must feel populated and alive,
crowd energy and tension must be visible,
balanced group staging,
clear readable composition
`;
  } else if (sceneFocus === "two_characters" && charactersData.length >= 2) {
    const sortedPair = sortCharactersForConsistency(charactersData).slice(0, 2);
    const charA = sortedPair[0];
    const charB = sortedPair[1];
    const persistentAbilityA = buildPersistentAbilityBlock(charA, combinedPanelText);
    const persistentAbilityB = buildPersistentAbilityBlock(charB, combinedPanelText);
    const safeVisualText = sanitizeMultiCharacterText(visualText);
    const safeDialogueText = sanitizeMultiCharacterText(dialogueText);
    const envDetails = buildEnvironmentDetails(`${visualText} ${dialogueText}`, resolvedWorldMode);
    const objDetails = buildObjectDetails(`${visualText} ${dialogueText}`, resolvedWorldMode);

    finalPrompt = `
exactly two characters,
only two characters,
both characters clearly visible,
both faces visible,
both heads visible,
left character and right character,
medium two-shot or medium wide shot,
clear separation between both characters,
visible gap between bodies,
INTERACTION RULE:
no physical contact unless explicitly stated,
maintain personal space,
neutral or tense distance,
focus on eye contact or stance,

${stylePreset},

Character A:
${charA.identityPrompt}
${buildCharacterConsistencyAnchor(charA)}

Character B:
${charB.identityPrompt}
${buildCharacterConsistencyAnchor(charB)}

SCENE ACTION:
${safeVisualText}

EMOTIONAL CONTEXT:
${safeDialogueText}

ENVIRONMENT DETAILS:
${envDetails}

OBJECT DETAILS:
${objDetails}

${creaturePromptBlock}

PERSISTENT ABILITY A:
${persistentAbilityA}

PERSISTENT ABILITY B:
${persistentAbilityB}

${abilityPromptBlock}

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
  } else if (sceneFocus === "character_in_environment" && charactersData.length >= 1) {
    const char = preferReferenceCharacter(
      dedupeCharacters(charactersData),
      uniqueDetected[0] || charactersData[0]?.name || null
    );
    const persistentAbilityBlock = buildPersistentAbilityBlock(char, combinedPanelText);
    const techniqueVariationBlock = buildTechniqueVariationBlock(char, combinedPanelText);
    const envDetails = buildEnvironmentDetails(`${visualText} ${dialogueText}`, resolvedWorldMode);
    const objDetails = buildObjectDetails(`${visualText} ${dialogueText}`, resolvedWorldMode);
    const crowdSupport = buildCrowdSupportPrompt(`${visualText} ${dialogueText}`);
    const consistencyAnchor = buildCharacterConsistencyAnchor(char);

    finalPrompt = `
single main character inside a strong visible environment,
character and environment both important,
do not crop into face-only portrait,
show the place clearly,
show architecture or setting clearly,
medium wide shot or wide shot,
full body or three-quarter body preferred,
environment must be readable,
object elements must be visible if mentioned,

${stylePreset},

${char.identityPrompt}
${consistencyAnchor}

SCENE ACTION:
${visualText}

EMOTIONAL CONTEXT:
${dialogueText}
TECHNIQUE VARIATION:
${techniqueVariationBlock}
ENVIRONMENT DETAILS:
${envDetails}

OBJECT DETAILS:
${objDetails}

${creaturePromptBlock}

PERSISTENT CHARACTER ABILITY:
${persistentAbilityBlock}

${abilityPromptBlock}

GROUP ATMOSPHERE:
${crowdSupport}

must visually represent the narrative described,
must show the setting described in the text,

CAMERA:
${composition.camera},

${composition.composition},
${composition.extra},
${framingTag},
${extraFramingRules},

cinematic manga storytelling,
environmental storytelling,
balanced anatomy,
clear focal hierarchy
`;
  } else if (charactersData.length >= 1) {
    const preferredSingleName =
      uniqueDetected.find((n) => normalizeNameLower(n) === "mefisto") ||
      charactersData[0]?.name ||
      null;

    const char = preferReferenceCharacter(charactersData, preferredSingleName);
    const persistentAbilityBlock = buildPersistentAbilityBlock(char, combinedPanelText);
    const consistencyAnchor = buildCharacterConsistencyAnchor(char);

    finalPrompt = `
single character focus,
CHARACTER VARIATION RULES:
same identity, different scene,
same face, different pose,
same face, different expression,
same face, different action,
allow dynamic combat movement if the scene requires it,
allow visible technique effects if the scene requires it,
do not repeat the same portrait composition every panel,
only ${char.name} visible,
no other people,
portrait shot or medium action shot depending on the scene,
full head visible,
no face crop,
no head crop,
no chest-only crop,
no torso-only crop,
centered character framing,

${stylePreset},

${char.identityPrompt}
${consistencyAnchor}

CURRENT ACTION:
${visualText}

EMOTIONAL CONTEXT:
${dialogueText}

must visually represent the narrative described,
must match the dialogue context,
no unrelated objects,
focus on the character involved in the dialogue,

PERSISTENT CHARACTER ABILITY:
${persistentAbilityBlock}

${abilityPromptBlock}

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
  } else {
    finalPrompt = `
${stylePreset},
${visualText},
${composition.camera},
${composition.composition},
${composition.extra},
${framingTag},
${extraFramingRules},
${abilityPromptBlock},
cinematic scene
`;
  }

  // Normalize animation
  const panelAnimation = {
    ...getDefaultPanelAnimation(panel),
    ...(panel.animation || {}),
  };

  // ── Clear stale panel data so regeneration is always fresh ──────────────
  // Prevents old generatedFrames / referenceImage from leaking into the new call
  panel.generatedFrames = [];
  panel.renderMeta = null;

  // Build payload
  let payload;

  if (
    sceneFocus === "environment" ||
    sceneFocus === "object_focus" ||
    sceneFocus === "group_scene" ||
    sceneFocus === "world_explanation" || // pure infographic — no character data
    sceneFocus === "creature_focus"
  ) {
    payload = {
  prompt: finalPrompt,
  seed: null,
  styleSeed: panelSeed,
  gender: null,
  identityPrompt: "",
  referenceImage: null,
  characterCount: 0,
  duoType: null,
  abilityName: "",
  abilityPrompt: "",
  abilityColor: "",
  abilityVfx: [],
  animation: panelAnimation,

  // 🔥 IMPORTANTE
  worldMode: resolvedWorldMode || "auto",
  sceneFocus: sceneFocus || "auto",
};

    // ── Debug log: verify pure txt2img payload for no-character sceneFocus ──
    if (sceneFocus === "group_scene" || sceneFocus === "world_explanation") {
      console.log(`${sceneFocus.toUpperCase()} PAYLOAD:`, JSON.stringify(payload, null, 2));
    }
  } else {
    const charactersForPayload =
      sceneFocus === "two_characters"
        ? sortCharactersForConsistency(dedupeCharacters(charactersData)).slice(0, 2)
        : [preferReferenceCharacter(dedupeCharacters(charactersData))].filter(Boolean);

    payload = await buildGenerationPayload(
      { ...panel, imagePrompt: finalPrompt },
      charactersForPayload,
      panelSeed
    );

    // Attach worldMode so FastAPI receives it on every branch
payload.worldMode = resolvedWorldMode || "auto";
payload.sceneFocus = sceneFocus || "auto";
  }

  const imageResult = await generateImage(payload);
  const base64 = imageResult.image;

  // Auto-save reference image for new characters
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
    title,
    chapterNumber,
    pageNumber,
    panelIndex
  );

  const generatedFrames = Array.isArray(imageResult.frames)
    ? imageResult.frames
    : [];

  const renderMeta = {
    steps: imageResult.steps,
    guidance: imageResult.guidance,
    lora_scale: imageResult.lora_scale,
    motionUsed: panelAnimation?.motion || "idle",
    sceneFocus,
    viewAngle,
    worldMode: resolvedWorldMode,
  };

  return {
    imageUrl,
    finalPrompt: finalPrompt.trim(),
    generatedFrames,
    renderMeta,
  };
}

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

const LOCKED_CHARACTER_NAMES = [
  "Karol",
  "Cristian",
  "Kelvin",
  "Mefisto",
  "Siete",
  "Amanecer",
  "Mapa"
];

const DETECTABLE_CHARACTER_NAMES = [
  "Karol",
  "Cristian",
  "Kelvin",
  "Mefisto",
  "Siete",
  "Amanecer",
  "Mapa",
  "Lex",
  "Natalia",
  "Camilo",
  "Jairo",
  "Yack",
  "Natalia Selecte",
  "Camilo Ricón",
  "Lex Stoll",
  "Jairo Velásquez",
  "Yack Parces"
];

const CHARACTER_NAME_ALIASES = {
  karol: "Karol",
  cristian: "Cristian",
  kelvin: "Kelvin",
  mefisto: "Mefisto",
  siete: "Siete",
  amanecer: "Amanecer",
  mapa: "Mapa",

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
  "yack parces": "Yack"
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
    t.includes("character") ||
    t.includes("disciple") ||
    t.includes("warrior") ||
    t.includes("master")
  );
}

function detectEnvironmentKeywords(text = "") {
  const t = String(text || "").toLowerCase();

  const map = [
    { key: "tower", words: ["tower", "torre", "torres"] },
    { key: "arena", words: ["arena", "coliseo", "stadium", "battlefield", "campo de batalla"] },
    { key: "sect", words: ["sect", "secta", "temple", "palace", "clan hall", "headquarters"] },
    { key: "forest", words: ["forest", "bosque", "woods"] },
    { key: "mountain", words: ["mountain", "montaña", "montañas", "peak", "cumbre"] },
    { key: "city", words: ["city", "ciudad", "village", "pueblo"] },
    { key: "sky", words: ["sky", "cielo", "clouds", "storm", "tormenta"] },
    { key: "throne_room", words: ["throne room", "salón del trono", "royal hall", "grand hall"] },
    { key: "hall", words: ["hall", "salón", "pasillo", "corridor"] },
    { key: "ruins", words: ["ruins", "ruinas", "ancient ruins"] },
  ];

  return map
    .filter(item => item.words.some(w => t.includes(w)))
    .map(item => item.key);
}

function detectObjectKeywords(text = "") {
  const t = String(text || "").toLowerCase();

  const map = [
    { key: "weapon", words: ["weapon", "arma", "sword", "espada", "blade", "lanza", "spear", "dagger", "katana"] },
    { key: "lights", words: ["lights", "luces", "glow", "glowing lights", "floating lights", "orbs", "brillos", "resplandor"] },
    { key: "artifact", words: ["artifact", "artefacto", "relic", "reliquia"] },
    { key: "portal", words: ["portal", "gate", "puerta dimensional"] },
    { key: "altar", words: ["altar", "ritual altar"] },
    { key: "book", words: ["book", "libro", "manual", "scroll", "pergamino"] },
    { key: "chain", words: ["chain", "cadena", "chains", "cadenas"] },
    { key: "crystal", words: ["crystal", "cristal", "gem", "gema"] },
  ];

  return map
    .filter(item => item.words.some(w => t.includes(w)))
    .map(item => item.key);
}

function detectAbilityKeywords(text = "") {
  const t = String(text || "").toLowerCase();

  return (
    t.includes("habilidad") ||
    t.includes("ira del dios de la guerra") ||
    t.includes("despierta") ||
    t.includes("llamas doradas") ||
    t.includes("se envolvió en llamas doradas") ||
    t.includes("velocidad inhumana") ||
    t.includes("skill") ||
    t.includes("power") ||
    t.includes("poder") ||
    t.includes("energia") ||
    t.includes("energía") ||
    t.includes("aura") ||
    t.includes("explosion") ||
    t.includes("explosión") ||
    t.includes("shockwave") ||
    t.includes("ataque") ||
    t.includes("attack") ||
    t.includes("golpe") ||
    t.includes("magia") ||
    t.includes("magic") ||
    t.includes("spell") ||
    t.includes("hechizo") ||
    t.includes("invoca") ||
    t.includes("invocar") ||
    t.includes("summon") ||
    t.includes("summoning") ||
    t.includes("transforma") ||
    t.includes("transformación") ||
    t.includes("transformacion") ||
    t.includes("fuego") ||
    t.includes("fire") ||
    t.includes("llamas") ||
    t.includes("flames") ||
    t.includes("hielo") ||
    t.includes("ice") ||
    t.includes("frost") ||
    t.includes("rayo") ||
    t.includes("lightning") ||
    t.includes("electric") ||
    t.includes("electricidad") ||
    t.includes("sombra") ||
    t.includes("shadow") ||
    t.includes("dark energy") ||
    t.includes("luz") ||
    t.includes("holy light") ||
    t.includes("radiant") ||
    t.includes("beam") ||
    t.includes("laser") ||
    t.includes("mana") ||
    t.includes("qi") ||
    t.includes("chi") ||
    t.includes("desató su poder") ||
    t.includes("desato su poder") ||
    t.includes("liberó su aura") ||
    t.includes("libero su aura") ||
    t.includes("activó su poder") ||
    t.includes("activo su poder") ||
    t.includes("usó su habilidad") ||
    t.includes("uso su habilidad")
  );
}

function buildAbilityDetails(text = "") {
  const t = String(text || "").toLowerCase();
  const parts = [];

  if (["fuego", "fire", "llamas", "flames"].some(w => t.includes(w))) {
    parts.push("flames around the body, burning aura, fire energy emission, heat distortion, embers in the air");
  }

  if (["hielo", "ice", "frost", "escarcha"].some(w => t.includes(w))) {
    parts.push("ice shards, frost aura, cold mist, frozen particles, icy ground details");
  }

  if (["rayo", "lightning", "electric", "electricidad"].some(w => t.includes(w))) {
    parts.push("lightning arcs, electric current around the body, bright impact flashes, charged atmosphere");
  }

  if (["oscuro", "dark", "shadow", "sombra"].some(w => t.includes(w))) {
    parts.push("dark energy emission, shadow aura, black-purple particles, ominous smoky power");
  }

  if (["luz", "holy", "radiant", "sagrada"].some(w => t.includes(w))) {
    parts.push("radiant light aura, holy light beams, glowing particles, brilliant energy halo");
  }

  if (["energia", "energía", "aura", "mana", "qi", "chi"].some(w => t.includes(w))) {
    parts.push("visible energy aura, power emission, glowing spiritual particles, surrounding energy waves");
  }

  if (["explosion", "explosión", "shockwave"].some(w => t.includes(w))) {
    parts.push("explosion impact, shockwave distortion, flying debris, violent energy burst");
  }

  if (["invoca", "invocar", "summon", "summoning"].some(w => t.includes(w))) {
    parts.push("summoning circle, magical glyphs, ritual light, energy formation appearing");
  }

  if (["beam", "laser", "rayo de energia", "rayo de energía"].some(w => t.includes(w))) {
    parts.push("energy beam, focused blast of light, projected power attack, strong directional impact");
  }

  if (["transforma", "transformación", "transformacion"].some(w => t.includes(w))) {
    parts.push("transformation aura, body surrounded by power, energy metamorphosis effect, intense glowing transition");
  }

  return parts.join(", ");
}

function detectGroupScene(text = "") {
  const t = String(text || "").toLowerCase();

  return (
    t.includes("group") ||
    t.includes("grupo") ||
    t.includes("crowd") ||
    t.includes("multitud") ||
    t.includes("several people") ||
    t.includes("varios") ||
    t.includes("many disciples") ||
    t.includes("disciples") ||
    t.includes("sect members") ||
    t.includes("army") ||
    t.includes("ejército") ||
    t.includes("many warriors") ||
    t.includes("multiple figures")
  );
}

function buildEnvironmentDetails(text = "") {
  const envs = detectEnvironmentKeywords(text);
  const parts = [];

  if (envs.includes("tower")) {
    parts.push("massive ancient tower, colossal vertical structure, dominant architectural presence");
  }
  if (envs.includes("arena")) {
    parts.push("battle arena, circular stone battlefield, wide combat ground");
  }
  if (envs.includes("sect")) {
    parts.push("mystical sect headquarters, ancient eastern architecture, ceremonial halls");
  }
  if (envs.includes("forest")) {
    parts.push("dark mystical forest, dense trees, spiritual fog");
  }
  if (envs.includes("mountain")) {
    parts.push("towering mountain range, sacred peaks, dramatic scale");
  }
  if (envs.includes("city")) {
    parts.push("fantasy cultivator city, ancient streets, eastern rooftops");
  }
  if (envs.includes("sky")) {
    parts.push("dramatic sky, glowing clouds, mystical atmosphere");
  }
  if (envs.includes("throne_room")) {
    parts.push("grand throne room, monumental hall, royal dark fantasy architecture");
  }
  if (envs.includes("hall")) {
    parts.push("large ceremonial hall, detailed interior architecture");
  }
  if (envs.includes("ruins")) {
    parts.push("ancient ruins, broken stone structures, old mystical remains");
  }

  return parts.join(", ");
}

function buildObjectDetails(text = "") {
  const objs = detectObjectKeywords(text);
  const parts = [];

  if (objs.includes("weapon")) {
    parts.push("prominent weapon in frame, detailed blade design, mystical metal reflections");
  }
  if (objs.includes("lights")) {
    parts.push("floating spiritual lights, glowing particles, luminous magical atmosphere");
  }
  if (objs.includes("artifact")) {
    parts.push("ancient magical artifact, detailed relic, mysterious power aura");
  }
  if (objs.includes("portal")) {
    parts.push("glowing dimensional portal, mystical gateway, energy distortion");
  }
  if (objs.includes("altar")) {
    parts.push("ritual altar, engraved stone, spiritual energy focus");
  }
  if (objs.includes("book")) {
    parts.push("ancient book or scroll, arcane symbols, mystical manuscript");
  }
  if (objs.includes("chain")) {
    parts.push("visible chains, metallic detail, ominous symbolic restraint");
  }
  if (objs.includes("crystal")) {
    parts.push("glowing crystal, luminous gem core, magical refraction");
  }

  return parts.join(", ");
}

function buildCrowdSupportPrompt(text = "") {
  if (!detectGroupScene(text)) return "";

  return `
several background figures,
group presence,
supporting crowd silhouettes,
disciples in the background,
multiple people visible,
scene must feel populated,
do not make it a solo portrait
`;
}
function isEnvironmentDominantScene(text = "") {
  const t = String(text || "").toLowerCase();
  const envs = detectEnvironmentKeywords(t);
  const creatures = detectCreatureKeywords(t);
  const objs = detectObjectKeywords(t);
  const hasAbility = detectAbilityKeywords(t);

  if (!envs.length) return false;
  if (creatures.length) return false;
  if (hasAbility) return false;

  // si explícitamente pide primer plano de personaje, no forzar entorno
  if (
    t.includes("close-up") ||
    t.includes("primer plano") ||
    t.includes("rostro") ||
    t.includes("cara") ||
    t.includes("face") ||
    t.includes("portrait")
  ) {
    return false;
  }

  return true;
}

function isCreatureDominantScene(text = "") {
  const t = String(text || "").toLowerCase();
  const creatures = detectCreatureKeywords(t);

  if (!creatures.length) return false;

  // si además hay poder/habilidad humana, no forzamos monstruo total
  if (detectAbilityKeywords(t)) return false;

  return true;
}

function isObjectDominantScene(text = "") {
  const t = String(text || "").toLowerCase();
  const objs = detectObjectKeywords(t);
  const envs = detectEnvironmentKeywords(t);
  const creatures = detectCreatureKeywords(t);

  if (!objs.length) return false;
  if (envs.length) return false;
  if (creatures.length) return false;
  if (detectAbilityKeywords(t)) return false;

  return true;
}
function inferNarrativeVisualFocus({
  visualText = "",
  dialogueText = "",
  panelCharacters = []
}) {
  const combined = `${visualText} ${dialogueText}`.toLowerCase();
  const envs = detectEnvironmentKeywords(combined);
  const objs = detectObjectKeywords(combined);
  const charCount = Array.isArray(panelCharacters) ? panelCharacters.length : 0;
  const trackedCount = extractDetectedCharacterNames(combined).length;
  const totalChars = Math.max(charCount, trackedCount);

  if (detectGroupScene(combined) || totalChars >= 3) {
    return "group_scene";
  }

  if (envs.length && totalChars >= 1) {
    return "character_in_environment";
  }

  if (envs.length) {
    return "environment";
  }

  if (objs.length && totalChars === 0) {
    return "object_focus";
  }

  if (objs.length && totalChars >= 1) {
    return "character_in_environment";
  }

  if (detectAbilityKeywords(combined) && totalChars >= 1 && (envs.length || objs.length)) {
    return "character_in_environment";
  }

  if (detectAbilityKeywords(combined) && totalChars >= 1) {
    return totalChars >= 2 ? "two_characters" : "single_character";
  }

  if (totalChars >= 2) {
    return "two_characters";
  }

  if (totalChars === 1) {
    return "single_character";
  }

  return null;
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
same core facial identity,
same silhouette,
recognizable identity,
consistent visual identity,
same exact character,
no identity drift,
outfit can adapt to scene context,
clothing variation allowed if story requires it,
combat stance variation allowed,
expression variation allowed,
pose variation allowed,
no alternate design,

IF A TECHNIQUE OR SKILL IS ACTIVATED:
the character MUST visually transform,
visible aura,
energy emission,
light distortion,
environment reacting to power,
motion blur or impact effects,
no static pose allowed,
no neutral stance allowed,
the technique state must dominate over the idle state
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
same exact face,
same hair color,
same hairstyle,
same exact character as before,

KELVIN VARIATION RULES:
keep the same face identity,
keep the same hairstyle,
keep the same eye color,
keep the same masculine build,
allow different poses,
allow different camera angles,
allow different facial expressions,
allow different action stances,
allow battle movement,
allow clothing variation appropriate to the scene,
allow power stance variation,
do not freeze Kelvin into a single reference pose,
do not repeat the exact same composition every time
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
cat ears visible from any angle,
ears clearly separated from hair,
no hair covering ears,
no hidden cat ears,
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
not a generic anime girl,
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
cat ears clearly visible from behind,
ears separated from hair,
recognizable feminine mystical silhouette,
same ethereal robe design,
same blue hair color,
same slim feminine body
`;
  }

  return anchor;
}

function getDuoType(charA, charB) {
  if (!charA?.gender || !charB?.gender) return null;

  if (charA.gender === "male" && charB.gender === "male") return "male_male";
  if (charA.gender === "female" && charB.gender === "female") return "female_female";

  return "female_male";
}

function buildSoloReferencePrompt(character) {
  const isMefisto = String(character?.name || "").toLowerCase() === "mefisto";

  if (isMefisto) {
    return `
solo portrait of Mefisto,
female spiritual guide,
cat ears ALWAYS visible,
cat ears clearly defined,
cat ears visible from any angle,
ears clearly separated from hair,
no hair covering ears,
long sapphire blue hair,
blue hair only,
emerald green glowing eyes,
green eyes only,
ethereal mystical aura,
spiritual particles,
fantasy spiritual guide,
elegant mystical robes,
upper body,
visible face,
looking at viewer,
centered composition,
neutral mystical background,
character reference sheet,
same hairstyle,
same face,
same identity,
recognizable cat-eared female spirit,
not generic anime girl
    `.trim();
  }

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
same core design,
recognizable outfit language,
outfit may adapt to scene context,
same facial structure,
same identity,
recognizable character design
  `.trim();
}

function buildDefaultAbilityProfile(cleanName, description = "", stylePreset = "dark_cultivator") {
  const lowerName = String(cleanName || "").toLowerCase();
  const text = String(description || "").toLowerCase();

  if (lowerName === "karol") {
    return {
      abilityName: "Llama Espiritual Dorada",
      abilityPrompt: `
golden spiritual fire,
flames around the body,
burning aura,
glowing embers,
radiant golden energy,
elegant but destructive power,
fire waves expanding outward,
visible power release
`.trim(),
      abilityElements: ["fire", "spirit", "aura"],
      abilityColor: "golden",
      abilityVfx: [
        "flames around the body",
        "burning aura",
        "glowing embers",
        "golden energy waves"
      ]
    };
  }

  if (lowerName === "mefisto") {
    return {
      abilityName: "Aura Felina Azul Arcana",
      abilityPrompt: `
sapphire blue mystical aura,
emerald spiritual particles,
cat-spirit energy,
ethereal magical glow,
floating glyphs,
arcane blue flames,
mystical summoning presence,
spiritual power visibly surrounding the body
`.trim(),
      abilityElements: ["arcane", "spirit", "summon", "aura"],
      abilityColor: "sapphire blue",
      abilityVfx: [
        "blue mystical aura",
        "emerald particles",
        "floating glyphs",
        "arcane flames"
      ]
    };
  }

  if (lowerName === "cristian") {
    return {
      abilityName: "Impacto Oscuro",
      abilityPrompt: `
dark violent energy,
shadow aura,
black-purple particles,
explosive power release,
ominous smoke energy,
heavy destructive impact,
shockwave distortion,
debris thrown outward
`.trim(),
      abilityElements: ["dark", "impact", "shadow"],
      abilityColor: "black-purple",
      abilityVfx: [
        "shadow aura",
        "black-purple particles",
        "shockwave distortion",
        "flying debris"
      ]
    };
  }

 if (lowerName === "kelvin") {
  return {
    abilityName: "Ira del Dios de la Guerra",
    abilityPrompt: `
golden battle aura,
golden flames around the body,
burning spiritual pressure,
shockwave release,
explosive combat energy,
brutal high-speed attack motion,
powerful impact distortion,
war-god presence
`.trim(),
    abilityElements: ["fire", "battle", "shockwave", "aura"],
    abilityColor: "golden",
    abilityVfx: [
      "golden flames around the body",
      "burning spiritual pressure",
      "shockwave distortion",
      "explosive combat aura"
    ]
  };
}

  if (text.includes("fuego") || text.includes("fire") || text.includes("llama")) {
    return {
      abilityName: "Fuego Espiritual",
      abilityPrompt: "spiritual fire, flames, burning aura, embers, visible fire power",
      abilityElements: ["fire", "aura"],
      abilityColor: "orange-gold",
      abilityVfx: ["flames", "embers", "burning aura"]
    };
  }

  if (text.includes("hielo") || text.includes("ice") || text.includes("frost")) {
    return {
      abilityName: "Escarcha Arcana",
      abilityPrompt: "ice shards, frost aura, cold mist, frozen particles, visible freezing energy",
      abilityElements: ["ice", "frost"],
      abilityColor: "icy blue",
      abilityVfx: ["ice shards", "cold mist", "frozen particles"]
    };
  }

  if (text.includes("rayo") || text.includes("lightning") || text.includes("electric")) {
    return {
      abilityName: "Descarga Espiritual",
      abilityPrompt: "lightning arcs, electric aura, charged atmosphere, bright flashes, visible electric attack",
      abilityElements: ["lightning", "electric"],
      abilityColor: "electric blue",
      abilityVfx: ["lightning arcs", "electric aura", "bright flashes"]
    };
  }

  return {
    abilityName: "Aura Espiritual",
    abilityPrompt: "visible spiritual aura, glowing particles, energy emission, surrounding power waves",
    abilityElements: ["aura", "spirit"],
    abilityColor: "white-gold",
    abilityVfx: ["glowing particles", "energy emission", "power waves"]
  };
}

function buildPersistentAbilityBlock(character, panelText = "") {
  if (!character) return "";

  const text = String(panelText || "").toLowerCase();
  const hasAbility =
    detectAbilityKeywords(text) ||
    text.includes("usa su habilidad") ||
    text.includes("usó su habilidad") ||
    text.includes("uso su habilidad") ||
    text.includes("activo su poder") ||
    text.includes("activó su poder") ||
    text.includes("desató su poder") ||
    text.includes("desato su poder") ||
    text.includes("liberó su aura") ||
    text.includes("libero su aura") ||
    text.includes("release his power") ||
    text.includes("release her power");

  if (!hasAbility) return "";

  const abilityName = character.abilityName || "Spiritual Ability";
  const abilityPrompt = character.abilityPrompt || "";
  const abilityColor = character.abilityColor || "";
  const abilityVfx = Array.isArray(character.abilityVfx) ? character.abilityVfx.join(", ") : "";

  return `
PERSISTENT CHARACTER ABILITY:
${character.name} is using the ability "${abilityName}",
this character must always express this same signature power style,
signature color: ${abilityColor},
signature effects: ${abilityVfx},
visual ability identity:
${abilityPrompt},

ABILITY VISUAL RULES:
the power must be clearly visible,
the face must remain recognizable while using the technique,
do not replace identity with generic energy effects,
the ability must transform the pose and scene composition,
show technique-specific combat stance,
show dynamic body movement,
show scene reaction to the power,
the character must not look passive,
show power release, aura, energy emission and impact,
the environment can react to the power if appropriate,
keep the same power style across panels,
do not invent a different random power effect
`;
}

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
          lockIdentity: true,
          cultivationLevel: existingCharacter?.cultivationLevel || "D3",
          evolutionStage: existingCharacter?.evolutionStage || 1,
          abilityName: existingCharacter?.abilityName || defaultAbility.abilityName,
          abilityPrompt: existingCharacter?.abilityPrompt || defaultAbility.abilityPrompt,
          abilityElements: existingCharacter?.abilityElements?.length ? existingCharacter.abilityElements : defaultAbility.abilityElements,
          abilityColor: existingCharacter?.abilityColor || defaultAbility.abilityColor,
          abilityVfx: existingCharacter?.abilityVfx?.length ? existingCharacter.abilityVfx : defaultAbility.abilityVfx,
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
          lockIdentity: true,
          cultivationLevel: existingCharacter?.cultivationLevel || "D3",
          evolutionStage: existingCharacter?.evolutionStage || 1,
          abilityName: existingCharacter?.abilityName || defaultAbility.abilityName,
          abilityPrompt: existingCharacter?.abilityPrompt || defaultAbility.abilityPrompt,
          abilityElements: existingCharacter?.abilityElements?.length ? existingCharacter.abilityElements : defaultAbility.abilityElements,
          abilityColor: existingCharacter?.abilityColor || defaultAbility.abilityColor,
          abilityVfx: existingCharacter?.abilityVfx?.length ? existingCharacter.abilityVfx : defaultAbility.abilityVfx,
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
        gender,
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
    "siete",
    "amanecer",
    "mapa"
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
    "Siete",
    "Amanecer",
    "Mapa"
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
          : sceneFocus === "character_in_environment"
            ? (isYoutube ? "cinematic medium wide shot" : "medium wide shot")
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
      extra: "kinetic energy, action storytelling, visible power release, strong impact effects"
    };
  }

  return {
    camera:
      sceneFocus === "environment"
        ? (isYoutube ? "cinematic wide shot" : "wide cinematic shot")
        : sceneFocus === "character_in_environment"
          ? (isYoutube ? "cinematic medium wide shot" : "medium wide shot")
          : sceneFocus === "two_characters"
            ? (isYoutube ? "cinematic two-shot" : "medium two-shot")
            : sceneFocus === "group_scene"
              ? (isYoutube ? "cinematic wide group shot" : "wide group shot")
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
- If the story mentions a location, architecture, weapon, altar, lights, portal or environmental feature, it must be visible.
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
- If the story mentions a tower, arena, sect, weapon, altar, portal, lights or other narrative object, it must still be visible.
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
          "sceneFocus":"environment | object_focus | single_character | two_characters | group_scene | character_in_environment",
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
- sceneFocus="environment" for tower, city, world explanation, landscape, arena, sect architecture, temple, palace or place-focused panels.
- sceneFocus="object_focus" for weapon, relic, portal, lights, altar, book or other important narrative object.
- sceneFocus="single_character" when only one person should appear and the setting is secondary.
- sceneFocus="character_in_environment" when a named or important character appears but the location, architecture or object must also be visible.
- sceneFocus="two_characters" only when both characters are clearly part of the same moment.
- sceneFocus="group_scene" when several disciples, sect members, a crowd or more than two figures matter.
- panelKind="panoramic_top" for opening world panels or big environment moments.
- panelKind="dialogue" for conversation scenes.
- panelKind="emotional_closeup" for emotional face emphasis only when the place/object is not the main point.
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
- If the panel mentions a tower, the tower must be visible.
- If the panel mentions an arena, the arena must be visible.
- If the panel mentions a sect or temple, the sect architecture must be visible.
- If the panel mentions an altar, the altar must be visible.
- If the panel mentions a weapon, the weapon must be visible.
- If the panel mentions lights, glowing particles or floating lights, they must be visible.
- If the panel mentions an ability, power, aura, spell, transformation or attack, it must be visible.
- If the panel mentions several people, the scene must not become a solo portrait.
- Do not reduce environment scenes to only a big face close-up.

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
  const combinedPanelText = `${visualText} ${dialogueText}`;
  const hasAbility = detectAbilityKeywords(combinedPanelText);
  const abilityDetails = buildAbilityDetails(combinedPanelText);
  const creatureDetails = buildCreatureDetails(combinedPanelText);
  const hasCreatures = detectCreatureKeywords(combinedPanelText).length > 0;

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
const objectDominant = isObjectDominantScene(combinedSceneText);

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
show the relevant item clearly,
show surrounding setting if needed,

${stylePreset},

SCENE:
${visualText}

EMOTIONAL CONTEXT:
${dialogueText}

ENVIRONMENT DETAILS:
${envDetails}

OBJECT DETAILS:
${objDetails}

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
if the story mentions an artifact, altar, scroll or portal, it must be visible
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

  const envs = detectEnvironmentKeywords(t);
  const objs = detectObjectKeywords(t);
  const creatures = detectCreatureKeywords(t);

  if (detectGroupScene(t)) return "group_scene";

  if (
    creatures.length &&
    (
      t.includes("man") ||
      t.includes("woman") ||
      t.includes("character") ||
      t.includes("cultivator") ||
      t.includes("girl") ||
      t.includes("boy")
    )
  ) {
    return "character_in_environment";
  }

  if (creatures.length) return "group_scene";

  if (
    envs.length &&
    (
      t.includes("man") ||
      t.includes("woman") ||
      t.includes("character") ||
      t.includes("cultivator") ||
      t.includes("girl") ||
      t.includes("boy")
    )
  ) {
    return "character_in_environment";
  }

  if (envs.length) return "environment";
  if (objs.length) return "object_focus";

  if (detectAbilityKeywords(t) && (t.includes("man") || t.includes("woman") || t.includes("character") || t.includes("cultivator") || t.includes("girl") || t.includes("boy"))) {
    return "single_character";
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
function detectCreatureKeywords(text = "") {
  const t = String(text || "").toLowerCase();

  const words = [
    "goblin",
    "goblin lord",
    "monster",
    "monstruo",
    "bestia",
    "creature",
    "criatura",
    "orc",
    "demon",
    "beast"
  ];

  return words.filter(w => t.includes(w));
}

function buildCreatureDetails(text = "") {
  const t = String(text || "").toLowerCase();
  const parts = [];

  if (t.includes("goblin lord")) {
    parts.push("massive goblin lord, monstrous humanoid creature, dark green skin, brutal face, sharp teeth, large iron sword, menacing non-human anatomy");
  } else if (t.includes("goblin")) {
    parts.push("small savage goblin, green skin, monstrous face, sharp ears, ugly non-human creature, crude weapon");
  }

  if (t.includes("monster") || t.includes("monstruo") || t.includes("bestia")) {
    parts.push("clearly non-human enemy, monster anatomy, threatening creature design");
  }

  return parts.join(", ");
}

function buildTechniqueVariationBlock(character, panelText = "") {
  if (!character) return "";

  const lowerName = String(character.name || "").toLowerCase();
  const text = String(panelText || "").toLowerCase();
  const hasAbility = detectAbilityKeywords(text);

  if (!hasAbility) return "";

  if (lowerName === "kelvin") {
    return `
KELVIN TECHNIQUE VISUAL MODE:
same exact Kelvin face,
same short black hair,
same dark eyes,
same masculine identity,
dynamic battle pose,
combat stance variation,
body movement,
impact motion,
golden battle aura clearly visible,
golden flames clearly visible,
shockwave distortion,
power release affecting the environment,
war-god presence,
do not make Kelvin look static,
do not repeat the same portrait composition,
do not hide the technique,
the technique must visibly change the scene
`;
  }

  return `
TECHNIQUE VISUAL MODE:
same exact character identity,
dynamic pose variation,
visible power release,
environment reacting to the power,
do not repeat the same static composition
`;
}
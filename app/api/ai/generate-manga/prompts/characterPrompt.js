/**
 * prompts/characterPrompt.js
 *
 * Character identity, consistency anchor, ability and technique prompt builders,
 * extracted from generate-manga/route.js (Phase 2).
 *
 * Exports:
 *   buildCharacterConsistencyAnchor(character)              → string
 *   buildBackViewAnchor(character)                          → string
 *   buildSoloReferencePrompt(character)                     → string
 *   getDuoType(charA, charB)                                → string|null
 *   buildDefaultAbilityProfile(cleanName, description, stylePreset) → object
 *   buildPersistentAbilityBlock(character, panelText)       → string
 *   buildTechniqueVariationBlock(character, panelText)      → string
 */

import { detectAbilityKeywords } from "../helpers/detectors.js";

export function buildCharacterConsistencyAnchor(character) {
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

export function buildBackViewAnchor(character) {
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

export function getDuoType(charA, charB) {
  if (!charA?.gender || !charB?.gender) return null;

  if (charA.gender === "male" && charB.gender === "male") return "male_male";
  if (charA.gender === "female" && charB.gender === "female") return "female_female";

  return "female_male";
}

export function buildSoloReferencePrompt(character) {
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

export function buildDefaultAbilityProfile(cleanName, description = "", stylePreset = "dark_cultivator") {
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

export function buildPersistentAbilityBlock(character, panelText = "") {
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

export function buildTechniqueVariationBlock(character, panelText = "") {
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

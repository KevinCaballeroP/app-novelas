/**
 * prompts/environmentPrompt.js
 *
 * Sect/banner detection, scene-type classifiers, and world explanation prompt builder,
 * extracted from generate-manga/route.js (Phase 2).
 *
 * The SECT_VISUALS constant is duplicated here (same data as in route.js) so this
 * module is self-contained and imports nothing from route.js.
 *
 * Exports:
 *   detectSectMentions(text)                                     → object[]
 *   hasSectBannerFocus(text)                                     → boolean
 *   buildSectBannerDetails(text)                                 → string
 *   isEnvironmentDominantScene(text)                             → boolean
 *   isCreatureDominantScene(text)                                → boolean
 *   isObjectDominantScene(text)                                  → boolean
 *   buildAbilityDetails(text)                                    → string
 *   isWorldExplanation(text)                                     → boolean
 *   buildWorldExplanationPrompt(dialogueText, stylePreset, storyMode) → string
 */

import {
  detectEnvironmentKeywords,
  detectObjectKeywords,
  detectAbilityKeywords,
} from "../helpers/detectors.js";
import { detectCreatureKeywords } from "./creaturePrompt.js";

// Duplicated from route.js — same data, no import needed
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

export function detectSectMentions(text = "") {
  const t = String(text || "").toLowerCase();
  const found = [];

  for (const key of Object.keys(SECT_VISUALS)) {
    if (t.includes(key)) {
      found.push(SECT_VISUALS[key]);
    }
  }

  const unique = [];
  const seen = new Set();

  for (const item of found) {
    if (!item?.canonical) continue;
    const k = item.canonical.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(item);
  }

  return unique;
}

export function hasSectBannerFocus(text = "") {
  const t = String(text || "").toLowerCase();
  const sects = detectSectMentions(t);

  if (sects.length >= 1) return true;

  return (
    t.includes("secta") ||
    t.includes("sectas") ||
    t.includes("sect") ||
    t.includes("facción") ||
    t.includes("faccion") ||
    t.includes("clan") ||
    t.includes("banner") ||
    t.includes("bandera") ||
    t.includes("banderas") ||
    t.includes("estandarte") ||
    t.includes("estandartes") ||
    t.includes("emblema") ||
    t.includes("emblemas") ||
    t.includes("simbolo") ||
    t.includes("símbolo") ||
    t.includes("simbolos") ||
    t.includes("símbolos") ||
    t.includes("insignia") ||
    t.includes("insignias") ||
    t.includes("sigil") ||
    t.includes("crest")
  );
}

export function buildSectBannerDetails(text = "") {
  const sects = detectSectMentions(text);
  if (!sects.length) return "";

  return sects.map((sect) => `
sect name: ${sect.canonical},
main symbol: ${sect.symbol},
main colors: ${sect.colors},
banner type: ${sect.banner},
energy style: ${sect.aura},
show a ceremonial sect flag, emblem, sigil or standard,
the symbol must be readable,
the design must feel iconic and recognizable,
ancient eastern fantasy sect identity
  `.trim()).join("\n");
}

export function isEnvironmentDominantScene(text = "") {
  const t = String(text || "").toLowerCase();
  const envs = detectEnvironmentKeywords(t);
  const creatures = detectCreatureKeywords(t);
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

export function isCreatureDominantScene(text = "") {
  const t = String(text || "").toLowerCase();
  const creatures = detectCreatureKeywords(t);

  if (!creatures.length) return false;

  // si además hay poder/habilidad humana, no forzamos monstruo total
  if (detectAbilityKeywords(t)) return false;

  return true;
}

export function isObjectDominantScene(text = "") {
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

export function buildAbilityDetails(text = "") {
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

export function isWorldExplanation(text) {
  const t = String(text || "").toLowerCase();

  return (
    // Spanish keywords (original)
    t.includes("clasificados en rangos") ||
    t.includes("rango d") ||
    t.includes("rango c") ||
    t.includes("rango b") ||
    t.includes("rango a") ||
    t.includes("rango s") ||
    t.includes("subniveles") ||
    t.includes("sistema de rangos") ||
    t.includes("aventureros eran clasificados") ||
    t.includes("jerarquía") ||
    t.includes("jerarquia") ||
    t.includes("clasificación") ||
    t.includes("clasificacion") ||
    t.includes("estadística") ||
    t.includes("estadistica") ||
    t.includes("nivel de poder") ||
    t.includes("sistema de poder") ||
    t.includes("sistema de niveles") ||
    t.includes("explicación") ||
    t.includes("explicacion") ||
    t.includes("las siete torres son") ||
    t.includes("el shi es") ||
    t.includes("el shi ") ||
    // English keywords
    t.includes("rank d") ||
    t.includes("rank c") ||
    t.includes("rank b") ||
    t.includes("rank a") ||
    t.includes("rank s") ||
    t.includes("d rank") ||
    t.includes("c rank") ||
    t.includes("b rank") ||
    t.includes("a rank") ||
    t.includes("s rank") ||
    t.includes("adventurer rank") ||
    t.includes("ranking system") ||
    t.includes("power level") ||
    t.includes("power system") ||
    t.includes("hierarchy") ||
    t.includes("classification") ||
    t.includes("tier system") ||
    t.includes("grade system") ||
    t.includes("level tier") ||
    t.includes("world system") ||
    t.includes("world rules") ||
    t.includes("how the towers work") ||
    t.includes("tower rules") ||
    t.includes("the towers are")
  );
}

export function buildWorldExplanationPrompt(dialogueText, stylePreset, storyMode = "tiktok") {
  const isYoutube = storyMode === "youtube";
  return `
INFOGRAPHIC DOMINANT PANEL,
focus on information,
focus on diagrams,
focus on charts,
focus on symbols,
focus on hierarchy visualization,
focus on worldbuilding explanation,

ranking boards,
system interfaces,
guild records,
historical diagrams,
magical charts,
classification systems,

rank symbols D, C, B, A, S clearly visible,
mystical ranking monument,
spiritual inscriptions,
guild classification board,
cultivation hierarchy visualized,
ancient magical interface,
clear symbolic worldbuilding,
legible fantasy typography,
ordered layout with clear sections,

no characters in foreground,
no character portraits,
no action pose,
no creature,
no combat,

${isYoutube ? "horizontal cinematic infographic composition," : "vertical infographic composition,"}
dark seinen manga tone,
dramatic dark background,
glowing mystical inscriptions,
gold and dark color palette,

SCENE CONTEXT:
${dialogueText}
`;
}

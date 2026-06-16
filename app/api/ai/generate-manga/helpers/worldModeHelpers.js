/**
 * helpers/worldModeHelpers.js
 *
 * World mode inference and style preset building, extracted from generate-manga/route.js (Phase 1).
 * These functions determine the visual context (modern vs fantasy vs tower etc.)
 * and produce the appropriate style preset string for the image generation prompt.
 *
 * Functions exported:
 *   inferWorldMode(dialogue, imagePrompt)                        → string
 *   buildWorldModeStylePreset(worldMode, baseStylePreset, mode) → string
 */

/**
 * Infers the worldMode from panel text when the panel doesn't have one set manually.
 * Priority order: combat > inside_tower > tower_emergence > modern_world > cultivation_world > "auto"
 *
 * @param {string} dialogue    - Panel dialogue text.
 * @param {string} imagePrompt - Panel image prompt text.
 * @returns {"combat"|"inside_tower"|"tower_emergence"|"modern_world"|"cultivation_world"|"auto"}
 */
export function inferWorldMode(dialogue = "", imagePrompt = "") {
  const t = `${dialogue} ${imagePrompt}`.toLowerCase();

  // combat — highest priority
  if (
    t.includes("atack") ||
    t.includes("ataque") ||
    t.includes("pelea") ||
    t.includes("golpe") ||
    t.includes("explosion") ||
    t.includes("explosión") ||
    t.includes("habilidad") ||
    t.includes("monstruo") ||
    t.includes("monster") ||
    t.includes("aura") ||
    t.includes("poder") ||
    t.includes("poder espiritual") ||
    t.includes("batalla") ||
    t.includes("combat") ||
    t.includes("fight") ||
    t.includes("boss") ||
    t.includes("goblin") ||
    t.includes("bestia") ||
    t.includes("beast")
  ) {
    return "combat";
  }

  // inside_tower
  if (
    t.includes("dentro de la torre") ||
    t.includes("interior de la torre") ||
    t.includes("mazmorra") ||
    t.includes("dungeon") ||
    t.includes("portal") ||
    t.includes("sala misteriosa") ||
    t.includes("sala oscura") ||
    t.includes("cuarto oscuro") ||
    t.includes("prueba") ||
    t.includes("inside the tower") ||
    t.includes("tower interior") ||
    t.includes("piso") ||
    t.includes("floor of the tower")
  ) {
    return "inside_tower";
  }

  // tower_emergence
  if (
    t.includes("siete torres") ||
    t.includes("7 torres") ||
    t.includes("torres emergieron") ||
    t.includes("torres colosales") ||
    t.includes("torres aparecieron") ||
    t.includes("torres surgieron") ||
    t.includes("las torres") ||
    t.includes("haz de luz") ||
    t.includes("haces de luz") ||
    t.includes("elegidos") ||
    t.includes("evento mundial") ||
    t.includes("towers emerged") ||
    t.includes("seven towers")
  ) {
    return "tower_emergence";
  }

  // modern_world — before the towers appear
  if (
    t.includes("2025") ||
    t.includes("2026") ||
    t.includes("diciembre") ||
    t.includes("enero") ||
    t.includes("universidad") ||
    t.includes("university") ||
    t.includes("ciudad moderna") ||
    t.includes("televisión") ||
    t.includes("television") ||
    t.includes("noticias") ||
    t.includes("celular") ||
    t.includes("smartphone") ||
    t.includes("calles modernas") ||
    t.includes("edificios modernos") ||
    t.includes("mundo normal") ||
    t.includes("vida normal") ||
    t.includes("trabajo") ||
    t.includes("oficina") ||
    t.includes("escuela") ||
    t.includes("colegio") ||
    t.includes("ropa moderna") ||
    t.includes("ropa normal")
  ) {
    return "modern_world";
  }

  // cultivation_world — default for xianxia/wuxia content
  if (
    t.includes("cultivador") ||
    t.includes("cultivator") ||
    t.includes("secta") ||
    t.includes("sect") ||
    t.includes("qi") ||
    t.includes("dao") ||
    t.includes("xianxia") ||
    t.includes("wuxia") ||
    t.includes("túnica") ||
    t.includes("arenas de cultivo")
  ) {
    return "cultivation_world";
  }

  return "auto";
}

/**
 * Returns the correct style preset string for a given worldMode.
 * Replaces or augments the base buildStylePreset output for each world context.
 *
 * @param {string} worldMode        - One of: modern_world | tower_emergence | cultivation_world | inside_tower | combat | auto
 * @param {string} baseStylePreset  - The default preset from buildStylePreset() (xianxia/cultivator).
 * @param {string} storyMode        - "tiktok" | "youtube"
 * @returns {string}
 */
export function buildWorldModeStylePreset(worldMode, baseStylePreset, storyMode = "tiktok") {
  const isYoutube = storyMode === "youtube";

  switch (worldMode) {
    case "modern_world":
      return `
dark seinen manga tone,
dramatic lighting,
contemporary urban world,
modern city setting,
modern architecture,
modern clothing,
realistic human environment,
city streets,
contemporary interior spaces,
no xianxia,
no wuxia,
no ancient eastern fantasy,
no cultivator robes,
no spiritual aura unless explicitly mentioned,
no magical energy unless the scene specifically describes it,
${isYoutube ? "horizontal cinematic framing," : "vertical cinematic composition,"}
epic scale
`;

    case "tower_emergence":
      return `
dark seinen manga tone,
dramatic lighting,
apocalyptic atmosphere,
modern city background,
ancient mystical towers emerging,
seven colossal towers breaking through reality,
spiritual energy mixing with the modern world,
cosmic contrast: modern buildings vs ancient towers,
global crisis atmosphere,
overwhelming scale,
light beams from the towers,
heavenly phenomenon,
epic scale
`;

    case "inside_tower":
      return `
dark seinen manga tone,
dramatic lighting,
tower interior,
mystical dungeon aesthetic,
dark stone corridors,
glowing spiritual inscriptions on the walls,
ancient trial chamber,
supernatural architecture,
oppressive spiritual pressure visible,
dark fantasy dungeon,
mystical light sources,
dark mystical atmosphere,
epic scale
`;

    case "combat":
      return `
${baseStylePreset},
combat scene,
dynamic action,
power release visible,
energy effects,
high intensity,
impact frame,
speed lines,
combat aura
`;

    case "cultivation_world":
    case "auto":
    default:
      return baseStylePreset;
  }
}

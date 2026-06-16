/**
 * prompts/cameraPrompt.js
 *
 * Camera composition and style preset builders, extracted from route.js (Phase 2).
 *
 * Exports:
 *   getPanelComposition(panelKind, sceneFocus, storyMode) → {camera, composition, extra}
 *   buildStylePreset(style)                               → string
 *   buildPersonalityBlock(personality, archetype)         → string
 *   shouldForceFaceView(dialogueText, visualText, panelCharacters) → boolean
 */

export function getPanelComposition(panelKind, sceneFocus, storyMode = "tiktok") {
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

export function buildStylePreset(style) {
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

export function buildPersonalityBlock(personality, archetype) {
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

export function shouldForceFaceView(dialogueText, visualText, panelCharacters = []) {
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

/**
 * prompts/negativePrompt.js
 *
 * Style/manga detection utilities, extracted from route.js (Phase 2).
 *
 * Exports:
 *   getMangaStyle(title)         → string
 *   detectSceneType(imagePrompt) → string
 */

import {
  detectEnvironmentKeywords,
  detectObjectKeywords,
  detectGroupScene,
  detectAbilityKeywords,
} from "../helpers/detectors.js";
import { detectCreatureKeywords } from "./creaturePrompt.js";
import { hasSectBannerFocus, isWorldExplanation } from "./environmentPrompt.js";

export function getMangaStyle(title) {
  if (title.toLowerCase().includes("torres")) {
    return "dark_cultivator";
  }
  return "dark_cultivator";
}

export function detectSceneType(imagePrompt) {
  const t = String(imagePrompt || "").toLowerCase();

  const envs = detectEnvironmentKeywords(t);
  const objs = detectObjectKeywords(t);
  const creatures = detectCreatureKeywords(t);
  const sectSymbolic = hasSectBannerFocus(t);

  // world_explanation has highest priority — infographic panels
  if (isWorldExplanation(t)) return "world_explanation";

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

  // 🔥 PRIORIDAD: grupo encapuchado con identidad de secta
  if (
    sectSymbolic &&
    (
      t.includes("grupo") ||
      t.includes("encapuch") ||
      t.includes("túnica") ||
      t.includes("tunica") ||
      t.includes("miembros") ||
      t.includes("vestía") ||
      t.includes("vestian") ||
      t.includes("vestían") ||
      t.includes("sombras") ||
      t.includes("sombra de dragón") ||
      t.includes("sombra de dragon")
    )
  ) {
    return "group_scene";
  }

  // símbolo puro (sin personas)
  if (sectSymbolic) return "object_focus";

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

  if (objs.length) return "object_focus";
  if (envs.length) return "environment";

  if (
    detectAbilityKeywords(t) &&
    (
      t.includes("man") ||
      t.includes("woman") ||
      t.includes("character") ||
      t.includes("cultivator") ||
      t.includes("girl") ||
      t.includes("boy")
    )
  ) {
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

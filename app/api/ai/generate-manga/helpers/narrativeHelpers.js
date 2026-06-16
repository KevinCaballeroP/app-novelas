/**
 * helpers/narrativeHelpers.js
 *
 * Narrative visual focus inference extracted from generate-manga/route.js (Phase 1).
 *
 * Functions exported:
 *   inferNarrativeVisualFocus({ visualText, dialogueText, panelCharacters }) → string | null
 *
 * Note: extractDetectedCharacterNames remains in route.js (complex dependencies).
 * This helper receives the character count as a pre-computed value via panelCharacters.
 */

import {
  detectEnvironmentKeywords,
  detectObjectKeywords,
  detectGroupScene,
  detectAbilityKeywords,
} from "./detectors.js";
import { isWorldExplanation } from "../prompts/environmentPrompt.js";

/**
 * Infers the most appropriate sceneFocus from panel text and character list.
 * Returns one of: "world_explanation" | "group_scene" | "character_in_environment" |
 *                 "environment" | "object_focus" | "two_characters" | "single_character" | null
 *
 * IMPORTANT: This is called BEFORE manualSceneFocus takes over.
 * The caller (generateSinglePanelImage) must still respect manualSceneFocus
 * as the absolute priority.
 *
 * @param {object} options
 * @param {string}   options.visualText       - Panel imagePrompt text.
 * @param {string}   options.dialogueText     - Panel dialogue text.
 * @param {string[]} options.panelCharacters  - Characters listed in the panel.
 * @param {number}   [options.trackedCount]   - Pre-computed count from extractDetectedCharacterNames.
 * @returns {string|null}
 */
export function inferNarrativeVisualFocus({
  visualText = "",
  dialogueText = "",
  panelCharacters = [],
  trackedCount = 0,
}) {
  const combined = `${visualText} ${dialogueText}`.toLowerCase();

  // world_explanation has highest priority — infographic panels override all other heuristics
  if (isWorldExplanation(combined)) {
    return "world_explanation";
  }

  const envs = detectEnvironmentKeywords(combined);
  const objs = detectObjectKeywords(combined);
  const charCount = Array.isArray(panelCharacters) ? panelCharacters.length : 0;
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

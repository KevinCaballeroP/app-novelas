/**
 * prompts/groupPrompt.js
 *
 * Group scene crowd support prompt builder, extracted from route.js (Phase 2).
 *
 * Exports:
 *   buildCrowdSupportPrompt(text) → string
 */

import { detectGroupScene } from "../helpers/detectors.js";

export function buildCrowdSupportPrompt(text = "") {
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

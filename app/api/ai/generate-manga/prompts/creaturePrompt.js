/**
 * prompts/creaturePrompt.js
 *
 * Creature keyword detection and prompt building, extracted from route.js (Phase 2).
 *
 * Exports:
 *   detectCreatureKeywords(text) → string[]
 *   buildCreatureDetails(text)   → string
 */

export function detectCreatureKeywords(text = "") {
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

export function buildCreatureDetails(text = "") {
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

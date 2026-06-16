/**
 * helpers/environmentHelpers.js
 *
 * Environment and object detail builders extracted from generate-manga/route.js (Phase 1).
 * These functions build the ENVIRONMENT DETAILS and OBJECT DETAILS sections of a panel's
 * finalPrompt, adapting their output based on the panel's worldMode.
 *
 * Functions exported:
 *   buildEnvironmentDetails(text, worldMode) → string
 *   buildObjectDetails(text, worldMode)      → string
 */

import {
  detectEnvironmentKeywords,
  detectObjectKeywords,
} from "./detectors.js";

/**
 * Returns environment description strings appropriate for the given worldMode.
 * @param {string} text       - Combined visualText + dialogueText of the panel.
 * @param {string} worldMode  - One of: modern_world | tower_emergence | cultivation_world | inside_tower | combat | auto
 * @returns {string}
 */
export function buildEnvironmentDetails(text = "", worldMode = "auto") {
  const envs = detectEnvironmentKeywords(text);
  const parts = [];
  const isModern = worldMode === "modern_world";
  const isTowerEmergence = worldMode === "tower_emergence";

  if (envs.includes("tower")) {
    if (isModern || isTowerEmergence) {
      parts.push("massive colossal tower breaking through the skyline, gigantic supernatural structure above the modern city");
    } else {
      parts.push("massive ancient tower, colossal vertical structure, dominant architectural presence");
    }
  }
  if (envs.includes("arena")) {
    if (isModern) {
      parts.push("modern sports arena or stadium, urban battle space");
    } else {
      parts.push("battle arena, circular stone battlefield, wide combat ground");
    }
  }
  if (envs.includes("sect")) {
    if (!isModern) {
      parts.push("mystical sect headquarters, ancient eastern architecture, ceremonial halls");
    }
  }
  if (envs.includes("forest")) {
    if (isModern) {
      parts.push("urban park, city trees, modern natural space");
    } else {
      parts.push("dark mystical forest, dense trees, spiritual fog");
    }
  }
  if (envs.includes("mountain")) {
    parts.push("towering mountain range, dramatic scale");
  }
  if (envs.includes("city")) {
    if (isModern || isTowerEmergence) {
      parts.push("modern city streets, glass skyscrapers, asphalt roads, contemporary urban architecture, city traffic, concrete buildings");
    } else {
      parts.push("fantasy cultivator city, ancient streets, eastern rooftops");
    }
  }
  if (envs.includes("sky")) {
    if (isModern) {
      parts.push("overcast urban sky, grey clouds, city skyline silhouette");
    } else if (isTowerEmergence) {
      parts.push("apocalyptic sky, dramatic clouds, light beams from towers");
    } else {
      parts.push("dramatic sky, glowing clouds, mystical atmosphere");
    }
  }
  if (envs.includes("throne_room")) {
    if (!isModern) {
      parts.push("grand throne room, monumental hall, royal dark fantasy architecture");
    }
  }
  if (envs.includes("hall")) {
    if (isModern) {
      parts.push("large modern hall, contemporary interior architecture");
    } else {
      parts.push("large ceremonial hall, detailed interior architecture");
    }
  }
  if (envs.includes("ruins")) {
    if (isModern) {
      parts.push("collapsed modern building ruins, urban destruction, concrete debris");
    } else {
      parts.push("ancient ruins, broken stone structures, old mystical remains");
    }
  }

  return parts.join(", ");
}

/**
 * Returns object description strings appropriate for the given worldMode.
 * @param {string} text       - Combined visualText + dialogueText of the panel.
 * @param {string} worldMode  - One of: modern_world | tower_emergence | cultivation_world | inside_tower | combat | auto
 * @returns {string}
 */
export function buildObjectDetails(text = "", worldMode = "auto") {
  const objs = detectObjectKeywords(text);
  const parts = [];
  const isModern = worldMode === "modern_world";

  if (objs.includes("weapon")) {
    parts.push("prominent weapon in frame, detailed blade design, metallic reflections");
  }
  if (objs.includes("lights")) {
    if (isModern) {
      // Only add modern lighting — no spiritual/magical
      parts.push("emergency lights, broadcast screens, city illumination, news screens");
    } else {
      parts.push("floating spiritual lights, glowing particles, luminous magical atmosphere");
    }
  }
  if (objs.includes("artifact")) {
    if (!isModern) {
      parts.push("ancient magical artifact, detailed relic, mysterious power aura");
    }
  }
  if (objs.includes("portal")) {
    if (isModern) {
      parts.push("glowing dimensional rift, supernatural phenomenon breaking through reality");
    } else {
      parts.push("glowing dimensional portal, mystical gateway, energy distortion");
    }
  }
  if (objs.includes("altar")) {
    if (!isModern) {
      parts.push("ritual altar, engraved stone, spiritual energy focus");
    }
  }
  if (objs.includes("book")) {
    if (isModern) {
      parts.push("book or document, readable text, modern material");
    } else {
      parts.push("ancient book or scroll, arcane symbols, mystical manuscript");
    }
  }
  if (objs.includes("chain")) {
    parts.push("visible chains, metallic detail, ominous symbolic restraint");
  }
  if (objs.includes("crystal")) {
    if (!isModern) {
      parts.push("glowing crystal, luminous gem core, magical refraction");
    }
  }
  if (objs.includes("lotus")) {
    parts.push("sacred mystical lotus flower, glowing crimson lotus petals, spiritual flower bloom, luminous floral core, magical blossom, real flower shape clearly visible");
  }

  return parts.join(", ");
}

/**
 * helpers/detectors.js
 *
 * Pure keyword-detection utilities extracted from generate-manga/route.js (Phase 1).
 * No external dependencies — safe to import from any helper or route.
 *
 * Functions exported:
 *   detectEnvironmentKeywords(text)  → string[]
 *   detectObjectKeywords(text)       → string[]
 *   detectGroupScene(text)           → boolean
 *   detectAbilityKeywords(text)      → boolean
 */

export function detectEnvironmentKeywords(text = "") {
  const t = String(text || "").toLowerCase();

  const map = [
    { key: "tower",       words: ["tower", "torre", "torres"] },
    { key: "arena",       words: ["arena", "coliseo", "stadium", "battlefield", "campo de batalla"] },
    { key: "sect",        words: ["sect", "secta", "temple", "palace", "clan hall", "headquarters"] },
    { key: "forest",      words: ["forest", "bosque", "woods"] },
    { key: "mountain",    words: ["mountain", "montaña", "montañas", "peak", "cumbre"] },
    { key: "city",        words: ["city", "ciudad", "village", "pueblo"] },
    { key: "sky",         words: ["sky", "cielo", "clouds", "storm", "tormenta"] },
    { key: "throne_room", words: ["throne room", "salón del trono", "royal hall", "grand hall"] },
    { key: "hall",        words: ["hall", "salón", "pasillo", "corridor"] },
    { key: "ruins",       words: ["ruins", "ruinas", "ancient ruins"] },
  ];

  return map
    .filter((item) => item.words.some((w) => t.includes(w)))
    .map((item) => item.key);
}

export function detectObjectKeywords(text = "") {
  const t = String(text || "").toLowerCase();

  const map = [
    { key: "weapon",   words: ["weapon", "arma", "sword", "espada", "blade", "lanza", "spear", "dagger", "katana"] },
    { key: "lights",   words: ["lights", "luces", "glow", "glowing lights", "floating lights", "orbs", "brillos", "resplandor"] },
    { key: "artifact", words: ["artifact", "artefacto", "relic", "reliquia"] },
    { key: "portal",   words: ["portal", "gate", "puerta dimensional"] },
    { key: "altar",    words: ["altar", "ritual altar"] },
    { key: "book",     words: ["book", "libro", "manual", "scroll", "pergamino"] },
    { key: "chain",    words: ["chain", "cadena", "chains", "cadenas"] },
    { key: "crystal",  words: ["crystal", "cristal", "gem", "gema"] },
    {
      key: "lotus",
      words: ["loto", "loto carmesi", "loto carmesí", "loto del deseo", "flor de loto", "flor de loto carmesi", "flor de loto carmesí"],
    },
  ];

  return map
    .filter((item) => item.words.some((w) => t.includes(w)))
    .map((item) => item.key);
}

export function detectGroupScene(text = "") {
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

export function detectAbilityKeywords(text = "") {
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

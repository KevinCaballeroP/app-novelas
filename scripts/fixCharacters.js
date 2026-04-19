import mongoose from "mongoose";
import Character from "../models/Character.js";

// 🔐 Validar que exista la variable de entorno
const MONGO_URI = process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error("❌ ERROR: Falta la variable de entorno MONGODB_URI");
  process.exit(1);
}

try {
  await mongoose.connect(MONGO_URI);
  console.log("✅ Conectado a Mongo");

  await Character.updateMany(
    {},
    {
      $set: {
        abilityName: "",
        abilityPrompt: "",
        abilityColor: "",
        abilityVfx: [],
        combatStyle: "balanced",
        preferredShots: [],
        animationProfile: "standard",
      },
    }
  );

  console.log("✅ Personajes actualizados");

  await mongoose.disconnect();
  process.exit(0);

} catch (error) {
  console.error("❌ Error ejecutando script:", error);
  process.exit(1);
}
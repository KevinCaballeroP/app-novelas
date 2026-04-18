import mongoose from "mongoose";
import Character from "../models/Character.js";

await mongoose.connect(
  process.env.MONGODB_URI ||
    "mongodb+srv://kevincaballero5885:dMZsuvMsWokD9Wfu@cluster0.xycc3vr.mongodb.net/novelasDB?appName=Cluster0"
);

console.log("Conectado a Mongo");

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
      animationProfile: "standard"
    }
  }
);

console.log("✅ Personajes actualizados");

await mongoose.disconnect();
process.exit();
import mongoose from "mongoose";

const CharacterSchema = new mongoose.Schema({
  name: String,
  mangaTitle: String,
  seed: Number,
  referenceImage: String,
  identityPrompt: String,
  visualStylePreset: String,
  gender: String,

  cultivationLevel: {
    type: String,
    default: "D3"
  },

  evolutionStage: {
    type: Number,
    default: 1
  },

  profileVersion: {
    type: Number,
    default: 3
  }
});

CharacterSchema.index({ mangaTitle: 1, name: 1 }, { unique: true });

export default mongoose.models.Character || mongoose.model("Character", CharacterSchema);
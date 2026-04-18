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
    default: 10
  },

  abilityName: {
    type: String,
    default: ""
  },

  abilityPrompt: {
    type: String,
    default: ""
  },

  abilityColor: {
    type: String,
    default: ""
  },

  abilityVfx: {
    type: [String],
    default: () => []
  },

  combatStyle: {
    type: String,
    default: "balanced"
  },

  preferredShots: {
    type: [String],
    default: () => []
  },

  animationProfile: {
    type: String,
    default: "standard"
  }
});

CharacterSchema.set("minimize", false);

CharacterSchema.index({ mangaTitle: 1, name: 1 }, { unique: true });

export default mongoose.models.Character || mongoose.model("Character", CharacterSchema);
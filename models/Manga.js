import mongoose from "mongoose";

const PanelSchema = new mongoose.Schema(
  {
    type: { type: String, default: "narration" },
    dialogue: { type: String, default: "" },
    imagePrompt: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    imageB64: { type: String, default: "" },
    order: { type: Number, required: true },

    // Storyboard director fields
    characters: { type: [String], default: [] },
    sceneFocus: { type: String, default: "" },
    panelKind: { type: String, default: "" },
    viewAngle: { type: String, default: "front" },
    directorIntent: { type: String, default: "" },
    emotionalBeat: { type: String, default: "" },
    visualPriority: { type: String, default: "medium" },
    worldMode: { type: String, default: "auto" },

    // Animation & video
    animation: { type: mongoose.Schema.Types.Mixed, default: null },
    veoCandidate: { type: Boolean, default: false },
    veoPrompt: { type: String, default: "" },
    manualVideoUrl: { type: String, default: "" },
    generatedFrames: { type: [String], default: [] },

    // Image generation result
    finalPrompt: { type: String, default: "" },
    renderMeta: { type: mongoose.Schema.Types.Mixed, default: null },

    // Review flow
    approved: { type: Boolean, default: false },
  },
  { _id: false }
);

const PageSchema = new mongoose.Schema(
  {
    pageNumber: { type: Number, required: true },
    panels: { type: [PanelSchema], default: [] },
    layout: { type: String, default: "standard" },
  },
  { _id: false }
);

const ChapterSchema = new mongoose.Schema(
  {
    chapterNumber: { type: Number, required: true },
    title: { type: String, default: "" },
    prompt: { type: String, default: "" },
    pages: { type: [PageSchema], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const MangaSchema = new mongoose.Schema(
  {
    type: { type: String, default: "manga" },

    title: { type: String, required: true, index: true },
    description: { type: String, default: "" },

    author: { type: String, required: true },
    coverUrl: { type: String, default: "" },

    genres: { type: [String], default: [] },

    chapters: { type: [ChapterSchema], default: [] },

    // opcional, solo compatibilidad vieja
    pages: { type: [PageSchema], default: [] },

    published: { type: Boolean, default: false },
    visibility: {
      type: String,
      enum: ["public", "private", "draft"],
      default: "draft",
    },

    aiGenerated: { type: Boolean, default: true },
    sourceChapters: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  },
  { timestamps: true }
);

export default mongoose.models.Manga || mongoose.model("Manga", MangaSchema);
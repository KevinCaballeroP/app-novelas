import mongoose from "mongoose";

const PanelSchema = new mongoose.Schema({
    dialogue: { type: String, default: "" },
    imagePrompt: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    imageB64: { type: String, default: "" },
    order: { type: Number, required: true },
}, 
     { _id: false }
);

const PageSchema = new mongoose.Schema(
  {
    pageNumber: { type: Number, required: true },
    panels: { type: [PanelSchema], default: [] },
    layout: { type: String, default: "standard" }, // p.ej. "2x2", "vertical", "webtoon"
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

    pages: { type: [PageSchema], default: [] },

    // metadata
    published: { type: Boolean, default: false },
    visibility: { type: String, enum: ["public", "private", "draft"], default: "draft" },

    // estadisticas / versionado
    aiGenerated: { type: Boolean, default: true },
    sourceChapters: { type: [mongoose.Schema.Types.ObjectId], default: [] }, // si quieres enlazar a novelas/capítulos

  },
  { timestamps: true }
);

// Previene redeclaration en hot reload (Next.js)
export default mongoose.models.Manga || mongoose.model("Manga", MangaSchema);
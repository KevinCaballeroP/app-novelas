import mongoose from "mongoose";

const ChapterSchema = new mongoose.Schema({
  title: String,
  content: String,
});

const NovelSchema = new mongoose.Schema({
 title: {
      type: String,
      required: true,
    },
    author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
    description: {
      type: String,
      required: true,
    },
    cover: {
      type: String,
      default: "", // URL de la portada si existe
    },
    genres: {
      type: [String],
      default: [],
    },
    publishedYear: {
      type: Number,
      default: null,
    },
  chapters: [ChapterSchema],  
},
 {
    timestamps: true, // createdAt y updatedAt automáticos
  }
);

export const Novel = mongoose.models.Novel || mongoose.model("Novel", NovelSchema);

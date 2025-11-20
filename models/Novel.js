import mongoose from "mongoose";

const ChapterSchema = new mongoose.Schema({
  title: String,
  content: String,
});

const NovelSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    author: {
      type: String,   // 👈 EMAIL, no objectId
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    cover: {
      type: String,
      default: "",
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
    timestamps: true,
  }
);

// 👇 Fuerza a Mongoose a regenerar el modelo
if (mongoose.models.Novel) {
  delete mongoose.models.Novel;
}

export const Novel = mongoose.model("Novel", NovelSchema);

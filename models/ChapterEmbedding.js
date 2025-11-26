// /models/ChapterEmbedding.js
import mongoose from "mongoose";

const ChapterEmbeddingSchema = new mongoose.Schema({
  novelId: { type: String, index: true },
  chapterNumber: Number,
  text: String,
  embedding: {
    type: [Number], // vector
    index: "vector", // MongoDB Atlas Vector Index
    dimensions: 768 // Nomic embedding size
  },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.ChapterEmbedding ||
  mongoose.model("ChapterEmbedding", ChapterEmbeddingSchema);

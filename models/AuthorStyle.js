import mongoose from "mongoose";

const AuthorStyleSchema = new mongoose.Schema({
  novelId: { type: String, unique: true },   // 👈 corregido
  style: { type: Object },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.AuthorStyle ||
  mongoose.model("AuthorStyle", AuthorStyleSchema);

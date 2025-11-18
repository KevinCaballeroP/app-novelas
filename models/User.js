import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  }
});

// Evita recompilar el modelo en Hot Reload
export default mongoose.models.User || mongoose.model("User", UserSchema);

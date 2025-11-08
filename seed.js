// seed.js
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();
const MONGODB_URI = process.env.MONGODB_URI;
 // Pega aquí tu string de conexión

// Esquema de capítulos
const ChapterSchema = new mongoose.Schema({
  title: String,
  content: String,
});

// Esquema de novelas
const NovelSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    author: { type: String, required: true },
    description: { type: String, required: true },
    coverImage: { type: String, default: "" },
    genres: { type: [String], default: [] },
    publishedYear: { type: Number, default: null },
    chapters: [ChapterSchema],
  },
  { timestamps: true }
);

const Novel = mongoose.models.Novel || mongoose.model("Novel", NovelSchema);

// Función para insertar datos
async function seedNovels() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Conectado a MongoDB Atlas ✅");

    // Array de novelas
    const novels = [
      {
        title: "Cien años de soledad",
        author: "Gabriel García Márquez",
        description:
          "Historia de la familia Buendía en el pueblo ficticio de Macondo.",
        coverImage: "",
        genres: ["Realismo mágico", "Literatura latinoamericana"],
        publishedYear: 1967,
        chapters: [
          { title: "Capítulo 1", content: "Contenido del capítulo 1..." },
          { title: "Capítulo 2", content: "Contenido del capítulo 2..." },
        ],
      },
      {
        title: "Don Quijote de la Mancha",
        author: "Miguel de Cervantes",
        description:
          "Las aventuras de un hidalgo que enloquece leyendo libros de caballerías.",
        coverImage: "",
        genres: ["Clásico", "Aventura"],
        publishedYear: 1605,
        chapters: [
          { title: "Capítulo 1", content: "Contenido del capítulo 1..." },
        ],
      },
    ];

    // Limpiar colección antes de insertar
    await Novel.deleteMany({});
    console.log("Colección limpiada 🗑️");

    // Insertar novelas
    await Novel.insertMany(novels);
    console.log("Novelas insertadas con éxito 📚");

    mongoose.connection.close();
  } catch (error) {
    console.error("Error al insertar novelas:", error);
    mongoose.connection.close();
  }
}

seedNovels();

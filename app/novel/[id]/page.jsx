import { connectToDB } from "@/lib/mongodb";
import mongoose from "mongoose";
import "@/style/novel.css"; // 👈 Asegúrate de tener este archivo

const ChapterSchema = new mongoose.Schema({
  title: String,
  content: String,
});

const NovelSchema = new mongoose.Schema({
  title: String,
  author: String,
  description: String,
  cover: String,
  genres: [String],
  publishedYear: Number,
  chapters: [ChapterSchema],
});

const Novel = mongoose.models.Novel || mongoose.model("Novel", NovelSchema);

export default async function NovelPage({ params }) {
  const { id } = await params;
  await connectToDB();

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return <div className="novel-error">❌ ID inválido o no proporcionado</div>;
  }

  const novel = await Novel.findById(id).lean();
  if (!novel) return <div className="novel-error">❌ Novela no encontrada</div>;

  return (
    <div className="novel-container">
      <div className="novel-header">
        {novel.cover && (
          <img
            src={novel.cover}
            alt={novel.title}
            className="novel-cover"
          />
        )}
        <div className="novel-info">
          <h1 className="novel-title">{novel.title}</h1>
          <p className="novel-author">Por {novel.author}</p>
          <p className="novel-description">{novel.description}</p>
          {novel.genres?.length > 0 && (
            <div className="novel-genres">
              {novel.genres.map((g, i) => (
                <span key={i} className="genre-tag">{g}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="novel-chapters">
        <h2>📖 Capítulos</h2>
        <ul>
          {novel.chapters.map((ch, i) => (
            <li key={i}>
              <a href={`/novel/${id}/${i}`} className="chapter-link">
                {ch.title || `Capítulo ${i + 1}`}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

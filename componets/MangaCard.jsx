export default function MangaCard({ manga }) {
  return (
    <div className="novel-card">
      <img
        src={manga.coverUrl}
        className="novel-cover"
        alt="Manga Cover"
      />
      <h3>{manga.title}</h3>
      <p>{manga.author ? manga.author.name : "Desconocido"}</p>
    </div>
  );
}

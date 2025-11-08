import "../style/NovelCard.css";

export default function NovelCard({ novel }) {
  // Soporte para 'cover' o 'coverImage'
  const cover = novel.cover || novel.coverImage || "";

  // Si es URL absoluta, la usamos; si es relativa, agregamos la ruta base
const imageUrl = cover.startsWith("http")
  ? cover
  : `${process.env.NEXT_PUBLIC_BASE_URL || ""}${encodeURI(cover)}`;


  return (
    <div style={{ border: "1px solid #ccc", padding: "10px" }}>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={novel.title}
          width="100%"
          onError={(e) => {
            // Si falla la imagen, simplemente ocultarla o dejar sin src
            e.target.style.display = "none";
          }}
        />
      ) : (
        <div
          style={{
            width: "100%",
            height: "200px",
            backgroundColor: "#eee",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#666",
          }}
        >
          Sin imagen
        </div>
      )}
      <h2>{novel.title}</h2>
    </div>
  );
}

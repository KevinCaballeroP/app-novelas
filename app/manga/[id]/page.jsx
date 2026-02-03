"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import "@/style/MangaReader.css"; 

export default function MangaReader() {
  const { id } = useParams();
  const router = useRouter();
  const [manga, setManga] = useState(null);

  useEffect(() => {
    if (!id) return;

    fetch(`/api/mangas/${id}`)
      .then(res => res.json())
      .then(data => setManga(data));
  }, [id]);

  if (!manga) return <div className="loading">Cargando manga...</div>;

  return (
    <div className="manga-reader-container">

      {/* HEADER */}
      <div className="manga-header">
        <button className="back-btn" onClick={() => router.push("/")}>
          ⬅ Volver al inicio
        </button>

        <h1 className="manga-title">{manga.title}</h1>
        {manga.description && (
          <p className="manga-description">{manga.description}</p>
        )}
      </div>

      {/* CONTENIDO */}
      <div className="manga-pages">
        {manga.pages.map(page => (
          <div key={page.pageNumber} className="manga-page">
            <h3 className="page-number">Página {page.pageNumber}</h3>

            {page.panels.map((panel, i) => (
             <div className="manga-panel">
  <div className="panel-image-wrapper">
    <img
      src={panel.imageUrl}
      className="panel-img"
      alt="Panel manga"
    />

   {panel.dialogue && (
  <div className={`speech-bubble pos-${i % 3}`}>
    {panel.dialogue}
  </div>
)}
  </div>
</div>

            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

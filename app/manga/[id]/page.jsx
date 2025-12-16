"use client";

import { useEffect, useState } from "react";

export default function MangaReader({ params }) {
  const { id } = params;
  const [manga, setManga] = useState(null);

  useEffect(() => {
    fetch(`/api/mangas/${id}`)
      .then((res) => res.json())
      .then((data) => setManga(data));
  }, [id]);

  if (!manga) return <div>Cargando manga...</div>;

  return (
    <div className="manga-reader">
      <h1>{manga.title}</h1>
      <p>{manga.description}</p>

      {manga.pages.map((page) => (
        <div key={page.pageNumber} className="manga-page">
          <h3>Página {page.pageNumber}</h3>

          {page.panels.map((panel, i) => (
            <div key={i} className="panel">
              <img src={panel.imageUrl} className="panel-img" />
              {panel.dialogue && <p className="dialogue">{panel.dialogue}</p>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

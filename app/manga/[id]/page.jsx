"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import "@/style/MangaReader.css";

export default function MangaReader() {
  const { id } = useParams();
  const router = useRouter();
  const [manga, setManga] = useState(null);

  useEffect(() => {
    if (!id) return;

    fetch(`/api/mangas/${id}`)
      .then((res) => res.json())
      .then((data) => setManga(data))
      .catch((err) => {
        console.error("Error cargando manga:", err);
      });
  }, [id]);

  const chapters = useMemo(() => {
    if (!manga) return [];

    // formato nuevo
    if (Array.isArray(manga.chapters) && manga.chapters.length > 0) {
      return manga.chapters.map((chapter, chapterIndex) => ({
        chapterNumber: chapter.chapterNumber || chapterIndex + 1,
        title: chapter.title || `Capítulo ${chapterIndex + 1}`,
        pages: (chapter.pages || []).map((page, pageIndex) => ({
          pageNumber: page.pageNumber || page.page || pageIndex + 1,
          panels: (page.panels || []).map((panel, panelIndex) => ({
            type: panel.type || "narration",
            dialogue: panel.dialogue || "",
            imageUrl: panel.imageUrl || panel.image || "",
            order: panel.order || panelIndex + 1,
          })),
        })),
      }));
    }

    // compatibilidad vieja
    if (Array.isArray(manga.pages) && manga.pages.length > 0) {
      return [
        {
          chapterNumber: 1,
          title: "Capítulo 1",
          pages: manga.pages.map((page, pageIndex) => ({
            pageNumber: page.pageNumber || page.page || pageIndex + 1,
            panels: (page.panels || []).map((panel, panelIndex) => ({
              type: panel.type || "narration",
              dialogue: panel.dialogue || "",
              imageUrl: panel.imageUrl || panel.image || "",
              order: panel.order || panelIndex + 1,
            })),
          })),
        },
      ];
    }

    return [];
  }, [manga]);

  if (!manga) return <div className="loading">Cargando manga...</div>;

  return (
    <div className="manga-reader-container">
      <div className="manga-header">
        <button className="back-btn" onClick={() => router.push("/")}>
          ⬅ Volver al inicio
        </button>

        <h1 className="manga-title">{manga.title}</h1>

        {manga.description && (
          <p className="manga-description">{manga.description}</p>
        )}
      </div>

      <div className="manga-pages">
        {chapters.length === 0 && (
          <p style={{ textAlign: "center" }}>
            Este manga todavía no tiene capítulos o páginas guardadas.
          </p>
        )}

        {chapters.map((chapter) => (
          <div key={chapter.chapterNumber} className="manga-chapter-block">
            <h2 className="chapter-title">
              {chapter.title || `Capítulo ${chapter.chapterNumber}`}
            </h2>

            {chapter.pages.map((page) => (
              <div key={`${chapter.chapterNumber}-${page.pageNumber}`} className="manga-page">
                <h3 className="page-number">Página {page.pageNumber}</h3>

                {page.panels.map((panel, i) => (
                  <div
                    key={`${chapter.chapterNumber}-${page.pageNumber}-${i}`}
                    className="manga-panel"
                  >
                    <div className="panel-image-wrapper">
                      {panel.imageUrl && (
                        <img
                          src={panel.imageUrl}
                          className="panel-img"
                          alt="Panel manga"
                        />
                      )}

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
        ))}
      </div>
    </div>
  );
}
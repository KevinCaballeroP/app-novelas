"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import "@/style/reader.css";

export default function Reader({ params }) {
  const { id, capituloId } = params;

  const [novel, setNovel] = useState(null);
  const [chapter, setChapter] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      const res = await fetch(`/api/novels/${id}`);
      const data = await res.json();
      setNovel(data);
      setChapter(data.chapters[capituloId]);
    };
    fetchData();
  }, [id, capituloId]);

  if (!novel || !chapter)
    return <div className="reader-container">Cargando...</div>;

  const nextChapter = parseInt(capituloId) + 1;
  const prevChapter = parseInt(capituloId) - 1;

  return (
    <div className="reader-container">
      <div className="reader-content">
        {/* 🔙 Botón centrado arriba del título */}
        <div className="reader-back" style={{ textAlign: "center", marginBottom: "15px" }}>
          <Link href={`/novel/${id}`} className="back-button">
            ⬅️ Volver a la novela
          </Link>
        </div>

        {/* 📖 Contenido del capítulo */}
        <h1 className="reader-title">{chapter.title}</h1>
        <p className="reader-text">{chapter.content}</p>

        {/* 🔄 Navegación entre capítulos */}
        <div className="reader-navigation">
          {prevChapter >= 0 && (
            <a href={`/novel/${id}/${prevChapter}`} className="reader-button">
              ← Anterior
            </a>
          )}
          {nextChapter < novel.chapters.length && (
            <a
              href={`/novel/${id}/${nextChapter}`}
              className="reader-button ml-auto"
            >
              Siguiente →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

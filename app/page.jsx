"use client";

import { useEffect, useState } from "react";
import NovelCard from "../componets/NovelCard";
import Link from "next/link";
import "../style/HomePage.css";

export default function HomePage() {
  const [novels, setNovels] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("");

  useEffect(() => {
    fetch("/api/novels")
      .then((res) => res.json())
      .then((data) => setNovels(data));
  }, []);

  const filteredNovels = novels.filter((novel) => {
    const matchesSearch = novel.title
      .toLowerCase()
      .includes(search.toLowerCase());

    const matchesGenre =
      selectedGenre === "" ||
      (novel.genres && novel.genres.includes(selectedGenre));

    return matchesSearch && matchesGenre;
  });

  // 🔹 Obtener géneros únicos
  const genres = [...new Set(novels.flatMap((n) => n.genres || []))];

  // 🔹 Colores visuales asignados por índice
  const genreColors = [
    "#00b7ff",
    "#ff007a",
    "#8d00ff",
    "#00ffa3",
    "#ffb100",
    "#ff3c3c",
    "#6eff00",
  ];

  return (
    <>
      {/* 🔷 Encabezado / Navbar */}
      <header className="navbar">
        <div className="navbar-content">
          <Link href="/" className="navbar-logo">
            🌌 SPT Novelas
          </Link>

          <nav>
            <Link href="/login" className="navbar-link">
              Panel de Administración
            </Link>
          </nav>
        </div>
      </header>

      {/* 🔹 Contenido principal */}
      <main className="main-container">
        <h1>📚 Novelas disponibles</h1>

        {/* 🟢 Filtro por categorías (color tags) */}
        <div className="genre-filter">
          <button
            className={`genre-btn ${selectedGenre === "" ? "active" : ""}`}
            onClick={() => setSelectedGenre("")}
            style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
          >
            Todas
          </button>

          {genres.map((genre, i) => (
            <button
              key={genre}
              className={`genre-btn ${
                selectedGenre === genre ? "active" : ""
              }`}
              onClick={() => setSelectedGenre(genre)}
              style={{
                backgroundColor:
                  selectedGenre === genre
                    ? genreColors[i % genreColors.length]
                    : "rgba(255,255,255,0.1)",
                borderColor: genreColors[i % genreColors.length],
                color:
                  selectedGenre === genre
                    ? "#fff"
                    : genreColors[i % genreColors.length],
              }}
            >
              {genre}
            </button>
          ))}
        </div>

        {/* 🟣 Buscador */}
        <input
          type="text"
          placeholder="Buscar novela..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-bar"
        />

        {/* 🟠 Grid de novelas */}
        <div className="novels-grid">
          {filteredNovels.map((novel) =>
            novel._id ? (
              <Link
                key={novel._id}
                href={`/novel/${novel._id}`}
                className="card-link"
              >
                <NovelCard novel={novel} />
              </Link>
            ) : (
              <div key={novel.title}>Novela sin ID</div>
            )
          )}
        </div>
      </main>
    </>
  );
}

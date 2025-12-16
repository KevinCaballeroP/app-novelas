"use client";

import { useEffect, useState } from "react";
import NovelCard from "../componets/NovelCard";
import Link from "next/link";
import "../style/HomePage.css";

export default function HomePage() {
  const [novels, setNovels] = useState([]);
  const [mangas, setMangas] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("");

  // 🔹 Cargar novelas
  useEffect(() => {
    fetch("/api/novels")
      .then((res) => res.json())
      .then((data) => setNovels(data));
  }, []);

  // 🔹 Cargar mangas
  useEffect(() => {
    fetch("/api/mangas")
      .then((res) => res.json())
      .then((data) => setMangas(data));
  }, []);

  // 🔹 Filtro novelas
  const filteredNovels = novels.filter((novel) => {
    const matchesSearch = novel.title
      .toLowerCase()
      .includes(search.toLowerCase());

    const matchesGenre =
      selectedGenre === "" ||
      (novel.genres && novel.genres.includes(selectedGenre));

    return matchesSearch && matchesGenre;
  });

  // 🔹 Filtro mangas
  const filteredMangas = mangas.filter((manga) => {
    const matchesSearch = manga.title
      .toLowerCase()
      .includes(search.toLowerCase());

    return matchesSearch;
  });

  // 🔹 Obtener géneros únicos
  const genres = [...new Set(novels.flatMap((n) => n.genres || []))];

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
      {/* 🔷 Navbar */}
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

      <main className="main-container">
        <h1>📚 Novelas disponibles</h1>

        {/* 🔹 Filtros */}
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

        {/* 🔹 Buscador */}
        <input
          type="text"
          placeholder="Buscar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-bar"
        />

        {/* 🟠 NOVELAS */}
        <h2>📖 Novelas</h2>
        <div className="novels-grid">
          {filteredNovels.map((novel) => (
            <Link
              key={novel._id}
              href={`/novel/${novel._id}`}
              className="card-link"
            >
              <NovelCard novel={novel} />
            </Link>
          ))}
        </div>

        {/* 🟣 MANGAS */}
        <h2>🖤 Mangas</h2>
        <div className="novels-grid">
          {filteredMangas.map((manga) => (
            <Link
              key={manga._id}
              href={`/manga/${manga._id}`}
              className="card-link"
            >
              <div className="novel-card">
                {manga.coverUrl ? (
  <img
    src={manga.coverUrl}
    className="novel-cover"
    alt="Manga Cover"
  />
) : null}

                <h3>{manga.title}</h3>
                <p>{manga.author}</p>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}

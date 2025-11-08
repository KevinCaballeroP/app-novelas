"use client";

import { useEffect, useState } from "react";
import NovelCard from "../componets/NovelCard";
import Link from "next/link";
import "../style/HomePage.css";

export default function HomePage() {
  const [novels, setNovels] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/novels")
      .then((res) => res.json())
      .then((data) => setNovels(data));
  }, []);

  const filteredNovels = novels.filter((novel) =>
    novel.title.toLowerCase().includes(search.toLowerCase())
  );

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

        <input
          type="text"
          placeholder="Buscar novela..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-bar"
        />

        <div className="novels-grid">
          {filteredNovels.map((novel) =>
            novel._id ? (
              <Link key={novel._id} href={`/novel/${novel._id}`} className="card-link">
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

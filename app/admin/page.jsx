"use client";

import { useState, useEffect } from "react";
import "../../style/AdminPage.css";

export default function AdminPage() {

  const [tab, setTab] = useState("novels");


  const [novels, setNovels] = useState([]);
  const [mangas, setMangas] = useState([]);

  
  const [selectedId, setSelectedId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cover, setCover] = useState("");
  const [file, setFile] = useState(null);

  // NOVEL
  const [chapters, setChapters] = useState([{ title: "", content: "" }]);
  const [genres, setGenres] = useState([]);
  const [genresText, setGenresText] = useState("");
  const [uploading, setUploading] = useState(false);

  // MANGA
  const [mangaPages, setMangaPages] = useState([]);
  const [mangaPrompt, setMangaPrompt] = useState("");
  // -------------------------------------------------
  // LOAD DATA
  // -------------------------------------------------
  const loadData = async () => {
    const currentUser = sessionStorage.getItem("adminUser");

    const resNovels = await fetch("/api/novels");
    const resMangas = await fetch("/api/mangas");

    const novelsData = await resNovels.json();
    const mangasData = await resMangas.json();

    setNovels(novelsData.filter(n => !n.author || n.author === currentUser));
    setMangas(mangasData.filter(m => !m.author || m.author === currentUser));
  };

  useEffect(() => {
    loadData();
  }, []);

  // -------------------------------------------------
  // UPLOAD IMAGE
  // -------------------------------------------------
  const handleFileChange = e => setFile(e.target.files[0]);

  const uploadImage = async () => {
    if (!file) return;
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    setCover(data.url);
    setUploading(false);
  };

  // -------------------------------------------------
  // SELECT ITEM
  // -------------------------------------------------
  const handleSelect = (type, id) => {
    setSelectedId(id);
    setTab(type);

    const list = type === "novels" ? novels : mangas;
    const item = list.find(x => x._id === id);

    setTitle(item?.title || "");
    setDescription(item?.description || "");
    setCover(item?.cover || item?.coverUrl || "");

    if (type === "novels") {
      setChapters(item?.chapters?.length ? item.chapters : [{ title: "", content: "" }]);
      setGenres(item?.genres || []);
      setGenresText((item?.genres || []).join(", "));
      setMangaPages([]);
    }

    if (type === "mangas") {
      setChapters([]);
      setGenres([]);
      setGenresText("");
      setMangaPages(item?.pages || []);
    }
  };

  // -------------------------------------------------
  // RESET FORM
  // -------------------------------------------------
  const resetForm = () => {
    setSelectedId("");
    setTitle("");
    setDescription("");
    setCover("");
    setFile(null);
    setChapters([{ title: "", content: "" }]);
    setGenres([]);
    setGenresText("");
    setMangaPages([]);
  };

  // -------------------------------------------------
  // SAVE NOVEL
  // -------------------------------------------------
  const saveNovel = async e => {
    e.preventDefault();

    const currentUser = sessionStorage.getItem("adminUser");

    const payload = {
      title,
      description,
      author: currentUser,
      cover,
      chapters,
      genres: genresText
        .split(",")
        .map(g => g.trim())
        .filter(g => g.length > 0),
    };

    const url = selectedId ? `/api/novels/${selectedId}` : "/api/novels";
    const method = selectedId ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      alert("Novela guardada");
      resetForm();
      loadData();
    } else {
      alert("Error al guardar");
    }
  };

  // -------------------------------------------------
  // SAVE MANGA
  // -------------------------------------------------
  const saveManga = async e => {
  e.preventDefault();

  const currentUser = sessionStorage.getItem("adminUser");

  const normalizedPages = mangaPages.map((page, pageIndex) => ({
    pageNumber: page.page || page.pageNumber || pageIndex + 1,
    panels: page.panels.map((panel, panelIndex) => ({
      dialogue: panel.dialogue || "",
      imagePrompt: panel.imagePrompt || "",
      imageUrl: panel.image || panel.imageUrl || "",
      order: panelIndex + 1,
    })),
  }));

  const payload = {
    title,
    coverUrl: cover,
    author: currentUser,
    pages: normalizedPages,
  };

  const url = selectedId ? `/api/mangas/${selectedId}` : "/api/mangas";
  const method = selectedId ? "PUT" : "POST";

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (res.ok) {
    alert("Manga guardado");
    resetForm();
    loadData();
  } else {
    const err = await res.text();
    console.error("❌ ERROR SAVE MANGA:", err);
    alert("Error guardando manga");
  }
};

  // -------------------------------------------------
  // DELETE ITEM
  // -------------------------------------------------
  const deleteItem = async () => {
    if (!selectedId) return alert("Selecciona uno");

    if (!confirm("¿Eliminar definitivamente?")) return;

    const endpoint = tab === "novels" ? "/api/novels" : "/api/mangas";

    const res = await fetch(`${endpoint}/${selectedId}`, {
      method: "DELETE",
    });

    if (res.ok) {
      alert("Eliminado correctamente");
      resetForm();
      loadData();
    }
  };

  // -------------------------------------------------
  // GENERATE MANGA (AI)
  // -------------------------------------------------
const generateManga = async () => {
  if (!title.trim()) return alert("Pon un título");
  if (!mangaPrompt.trim()) return alert("Describe el capítulo");

  const res = await fetch("/api/ai/generate-manga", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      prompt: mangaPrompt,
      previousPages: mangaPages, // 🔥 AQUÍ VA
    }),
  });

  const data = await res.json();

  if (data.pages) {
    setMangaPages(prev => {
      const offset = prev.length;

      const newPages = data.pages.map((p, i) => ({
        ...p,
        page: offset + i + 1,
      }));

      return [...prev, ...newPages];
    });
  } else {
    alert("Error generando manga");
  }
};



  // -------------------------------------------------
  // GENERATE CHAPTER AI
  // -------------------------------------------------
  const generateChapterAI = async () => {
    const res = await fetch("/api/ai/generate-chapter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        novelId: selectedId,
        title,
        description,
        chapters,
      }),
    });

    const data = await res.json();

    if (!data.chapter) return alert("Error generando capítulo");

    const lines = data.chapter.split("\n").filter(l => l.trim() !== "");

    const newChapter = {
      title: lines[0].replace("Título:", "").trim(),
      content: lines.slice(1).join("\n"),
    };

    setChapters([...chapters, newChapter]);
  };

  // -------------------------------------------------
  // UI
  // -------------------------------------------------
  return (
    <div className="admin-container">
      <h1 className="admin-title">Panel de Administración</h1>

      {/* Botón Inicio */}
      <button
        className="admin-button"
        onClick={() => (window.location.href = "/")}
      >
        ⬅ Inicio
      </button>

      {/* TABS */}
      <div className="tab-buttons">
        <button
          className={`admin-button ${tab === "novels" ? "tab-active" : ""}`}
          onClick={() => {
            resetForm();
            setTab("novels");
          }}
        >
          📖 Novelas
        </button>

        <button
          className={`admin-button ${tab === "mangas" ? "tab-active" : ""}`}
          onClick={() => {
            resetForm();
            setTab("mangas");
          }}
        >
          🖤 Mangas
        </button>
      </div>

      {/* ---------------------- NOVELS ---------------------- */}
      {tab === "novels" && (
        <div>
          <h2>Gestión de Novelas</h2>

          <select
            value={selectedId}
            onChange={e => handleSelect("novels", e.target.value)}
            className="admin-select short-select"
          >
            <option value="">Nueva novela</option>
            {novels.map(n => (
              <option key={n._id} value={n._id}>
                {n.title}
              </option>
            ))}
          </select>

          <form onSubmit={saveNovel} className="admin-form">
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título" />

            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descripción" />

            {/* Géneros */}
            <div className="genres-section">
              <label>Categorías:</label>

              <input
                type="text"
                value={genresText}
                onChange={e => setGenresText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    const newGenre = e.target.value.trim().replace(",", "");
                    if (newGenre && !genres.includes(newGenre)) {
                      setGenres([...genres, newGenre]);
                    }
                    setGenresText("");
                  }
                }}
                placeholder="Escribe una categoría"
              />

              <div className="genres-tags">
                {genres.map((g, i) => (
                  <span key={i} className="genre-tag">
                    {g}
                    <button
                      type="button"
                      className="remove-tag"
                      onClick={() => setGenres(genres.filter((_, idx) => idx !== i))}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Imagen */}
            <input type="file" onChange={handleFileChange} />

            <button type="button" onClick={uploadImage}>
              {uploading ? "Subiendo..." : "Subir portada"}
            </button>

            {cover && <img src={cover} alt="Portada" className="cover-preview" />}

            {/* Capítulos */}
            <h3>Capítulos</h3>
            {chapters.map((ch, idx) => (
              <div key={idx} className="chapter-card">
                <input
                  value={ch.title}
                  onChange={e => {
                    const updated = [...chapters];
                    updated[idx].title = e.target.value;
                    setChapters(updated);
                  }}
                  placeholder="Título del capítulo"
                />

                <textarea
                  value={ch.content}
                  onChange={e => {
                    const updated = [...chapters];
                    updated[idx].content = e.target.value;
                    setChapters(updated);
                  }}
                  placeholder="Contenido"
                />
              </div>
            ))}

            {/* Botones */}
            <div className="admin-buttons">
              <button className="admin-button" type="button" onClick={() => setChapters([...chapters, { title: "", content: "" }])}>
                + Capítulo
              </button>

              <button className="admin-button" type="button" onClick={() => setChapters(chapters.slice(0, -1))}>
                - Quitar
              </button>

              <button className="admin-button" type="button" onClick={generateChapterAI}>
                ✨ Generar Capítulo IA
              </button>

              <button className="admin-button" type="submit">{selectedId ? "Actualizar" : "Guardar"}</button>

              {selectedId && (
                <button className="admin-button delete" type="button" onClick={deleteItem}>
                  🗑 Eliminar
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {/* ---------------------- MANGAS ---------------------- */}
      {tab === "mangas" && (
        <div>
          <h2>Gestión de Mangas</h2>

          <select
            value={selectedId}
            onChange={e => handleSelect("mangas", e.target.value)}
            className="admin-select short-select"
          >
            <option value="">Nuevo manga</option>
            {mangas.map(m => (
              <option key={m._id} value={m._id}>
                {m.title}
              </option>
            ))}
          </select>

          <form onSubmit={saveManga} className="admin-form">

            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Título del manga"
            />

            <input type="file" onChange={handleFileChange} />
            <textarea
  value={mangaPrompt}
  onChange={e => setMangaPrompt(e.target.value)}
  placeholder="Describe qué pasa en este capítulo, personajes, emociones, escenario..."
/>

            <button className="admin-button" type="button" onClick={uploadImage}>
              {uploading ? "Subiendo..." : "Subir portada"}
            </button>

            {cover && <img src={cover} className="cover-preview" />}

            {/* Botón generar manga */}
            <button className="admin-button" type="button" onClick={generateManga}>
              🖤 Generar Manga IA
            </button>

            {/* Agregar páginas */}
            <button
              className="admin-button"
              type="button"
              onClick={() =>
                setMangaPages([
                  ...mangaPages,
                  {
                    page: mangaPages.length + 1,
                    panels: [{ image: "", dialogue: "" }],
                  },
                ])
              }
            >
              ➕ Agregar Página
            </button>

             <button className="admin-button" type="button"  onClick={() =>
                setMangaPages(mangaPages.slice(0, -1))
              }>
                - Quitar
              </button>

            <h3>Páginas del Manga</h3>

            {mangaPages.length === 0 && <p>No hay páginas.</p>}

            {mangaPages.map((page, pageIndex) => (
              <div key={pageIndex} className="manga-page">
                <h4>Página {page.page}</h4>

                {page.panels.map((panel, panelIndex) => (
                  <div key={panelIndex} className="manga-panel">
                    {panel.image && (
                        <img
                          src={panel.image}
                          alt="Panel de manga"
                          className="manga-image"
                        />
                      )}


                    <textarea
                      value={panel.dialogue}
                      onChange={e => {
                        const updated = [...mangaPages];
                        updated[pageIndex].panels[panelIndex].dialogue = e.target.value;
                        setMangaPages(updated);
                      }}
                      placeholder="Diálogo"
                    />
                  </div>
                ))}
              </div>
            ))}

            {/* Guardar / Eliminar */}
            <div className="admin-buttons">
              <button className="admin-button" type="submit">{selectedId ? "Actualizar" : "Guardar"}</button>

              {selectedId && (
                <button className="admin-button delete" type="button" onClick={deleteItem}>
                  🗑 Eliminar Manga
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

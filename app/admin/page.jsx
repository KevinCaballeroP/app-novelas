"use client";

import { useState, useEffect } from "react";
import "../../style/AdminPage.css";

export default function AdminPage() {
  const [novels, setNovels] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [author, setAuthor] = useState("");
  const [cover, setCover] = useState("");
  const [file, setFile] = useState(null);
  const [chapters, setChapters] = useState([{ title: "", content: "" }]);
  const [uploading, setUploading] = useState(false);
  const [genres, setGenres] = useState([]);
  const [genresText, setGenresText] = useState("");

const loadNovels = async () => {
  const currentUser = sessionStorage.getItem("adminUser");

  const res = await fetch("/api/novels");
  const data = await res.json();

  const userNovels = data.filter((novel) => {
    // novelas viejas sin author → se muestran igual
    if (!novel.author) return true;

    return novel.author === currentUser;
  });

  setNovels(userNovels);
};

useEffect(() => {
   loadNovels();
}, []);


  const handleFileChange = (e) => setFile(e.target.files[0]);

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

  const handleSelectChange = (id) => {
    setSelectedId(id);
    const novela = novels.find((n) => n._id === id);

    if (novela) {
      setTitle(novela.title || "");
      setDescription(novela.description || "");
      setAuthor(novela.author || "");
      setCover(novela.cover || "");
      setChapters(novela.chapters?.length ? novela.chapters : [{ title: "", content: "" }]);
      setGenres(novela.genres || []);
      setGenresText((novela.genres || []).join(", "));
    } else {
      setGenres([]);
      setGenresText("");
    }
  };

  const handleSubmit = async (e) => {
  e.preventDefault();

  const currentUser = sessionStorage.getItem("adminUser");

  const payload = {
    title,
    description,
    author: currentUser, // 👈 SIEMPRE GUARDA EL ID DEL USUARIO
    cover,
    chapters,
    genres: genresText
      .split(",")
      .map((g) => g.trim())
      .filter((g) => g.length > 0),
  };

  const url = selectedId ? `/api/novels/${selectedId}` : "/api/novels";
  const method = selectedId ? "PUT" : "POST";

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (res.ok) {
    alert(selectedId ? "Novela actualizada correctamente" : "Novela guardada correctamente");
    resetForm();
   await loadNovels();
  } else {
    const error = await res.json();
    alert("Error: " + error.error);
  }
};


  const handleDelete = async () => {
    if (!selectedId) {
      alert("Selecciona una novela para eliminar");
      return;
    }

    if (!confirm("¿Seguro que deseas eliminar esta novela?")) return;

    const res = await fetch(`/api/novels/${selectedId}`, {
      method: "DELETE",
    });

    if (res.ok) {
      alert("Novela eliminada correctamente");
      resetForm();

      await loadNovels();

    } else {
      const error = await res.json();
      alert("Error al eliminar: " + error.error);
    }
  };

  const resetForm = () => {
    setSelectedId("");
    setTitle("");
    setDescription("");
    setAuthor("");
    setCover("");
    setFile(null);
    setChapters([{ title: "", content: "" }]);
  };

  const generateChapterAI = async () => {
  const res = await fetch("/api/ai/generate-chapter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      novelId: selectedId,   // 👈 AQUI LO MANDAMOS
      title,
      description,
      chapters,
    }),
  });


  const data = await res.json();

  if (data.chapter) {
    const lines = data.chapter.split("\n").filter(l => l.trim() !== "");

    const newChapter = {
      title: lines[0].replace("Título:", "").trim(),
      content: lines.slice(1).join("\n"),
    };

    setChapters([...chapters, newChapter]);
    alert("Capítulo generado con IA");
  } else {
    alert("Error generando capítulo");
  }
};


  return (
    <div className="admin-container">
      <h1 className="admin-title">Panel de Administración</h1>
      <div className="home-button-container">
  <button
    className="admin-button home"
    onClick={() => (window.location.href = "/")}
  >
    ⬅ Volver al inicio
  </button>
</div>

       <select
        value={selectedId}
        onChange={(e) => handleSelectChange(e.target.value)}
        className="admin-select"
      >
        <option value="">Nueva novela</option>
        {novels.map((n) => (
          <option key={n._id} value={n._id}>
            {n.title}
          </option>
        ))}
      </select>

      <form onSubmit={handleSubmit} className="admin-form">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción" />
        {/* <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Autor" />  */}
        {/* 🟢 Campo de categorías */}
{/* 🟢 Campo de categorías mejorado con tags */}
<div className="genres-section">
  <label>Categorías:</label>

  {/* Campo de entrada */}
  <input
    type="text"
    value={genresText}
    onChange={(e) => setGenresText(e.target.value)}
    onKeyDown={(e) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        const newGenre = e.target.value.trim().replace(",", "");
        if (newGenre && !genres.includes(newGenre)) {
          setGenres([...genres, newGenre]);
        }
        setGenresText("");
      }
    }}
    placeholder="Escribe una categoría y presiona Enter o coma"
  />

  {/* Visualización de tags */}
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

        <input type="file" onChange={handleFileChange} />
        <div className="admin-buttons">
          <button
            type="button"
            className="admin-button"
            onClick={uploadImage}
            disabled={uploading}
          >
            {uploading ? "Subiendo..." : "Subir portada"}
          </button>
        </div>

        {cover && (
          <div className="admin-upload-preview">
            <img src={cover} alt="Portada" />
          </div>
        )}

        <div className="chapter-section">
          <h2>Capítulos</h2>
          {chapters.map((ch, i) => (
            <div key={i} className="chapter-card">
              <input
                value={ch.title}
                onChange={(e) => {
                  const updated = [...chapters];
                  updated[i].title = e.target.value;
                  setChapters(updated);
                }}
                placeholder="Título del capítulo"
              />
              <textarea
                value={ch.content}
                onChange={(e) => {
                  const updated = [...chapters];
                  updated[i].content = e.target.value;
                  setChapters(updated);
                }}
                placeholder="Contenido"
              />
            </div>
          ))}
        </div>

        <div className="admin-buttons">
          <button
            type="button"
            className="admin-button"
            onClick={generateChapterAI}
          >
            ✨ Generar Capítulo con IA
          </button>   
          <button
            type="button"
            className="admin-button"
            onClick={() => setChapters([...chapters, { title: "", content: "" }])}
          >
            + Agregar Capítulo
          </button>
         <button
          type="button"
          className="admin-button"
          onClick={() => setChapters(chapters.slice(0, -1))}
          >
          ➖ Quitar Capítulo
          </button>

          <button type="submit" className="admin-button">
            {selectedId ? "Actualizar novela" : "Guardar novela"}
          </button>
          {selectedId && (
            <button
              type="button"
              className="admin-button delete"
              onClick={handleDelete}
            >
              🗑 Eliminar novela
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

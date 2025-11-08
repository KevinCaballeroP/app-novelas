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

  useEffect(() => {
    fetch("/api/novels")
      .then((res) => res.json())
      .then((data) => setNovels(data));
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

  // 🟢 Cargar datos de novela seleccionada
  const handleSelectChange = (id) => {
    setSelectedId(id);
    const novela = novels.find((n) => n._id === id);
    if (novela) {
      setTitle(novela.title || "");
      setDescription(novela.description || "");
      setAuthor(novela.author || "");
      setCover(novela.coverImage || "");
      setChapters(
        novela.chapters?.length ? novela.chapters : [{ title: "", content: "" }]
      );
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = {
      title,
      description,
      author,
      coverImage: cover,
      chapters,
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
      const updated = await fetch("/api/novels").then((r) => r.json());
      setNovels(updated);
    } else {
      const error = await res.json();
      alert("Error: " + error.error);
    }
  };

  // 🔴 Eliminar novela
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
      const updated = await fetch("/api/novels").then((r) => r.json());
      setNovels(updated);
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

  return (
    <div className="admin-container">
      <h1 className="admin-title">Panel de Administración</h1>

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
        <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Autor" />

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
            onClick={() => setChapters([...chapters, { title: "", content: "" }])}
          >
            + Agregar Capítulo
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

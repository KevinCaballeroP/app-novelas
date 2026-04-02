"use client";

import { useState, useEffect, useMemo } from "react";
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
  const [mangaChapters, setMangaChapters] = useState([]);
  const [selectedChapterIndex, setSelectedChapterIndex] = useState(0);
  const [chapterTitle, setChapterTitle] = useState("");
  const [mangaPrompt, setMangaPrompt] = useState("");
  const [videoFormat, setVideoFormat] = useState("tiktok");
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState("");
  const [generatingVoice, setGeneratingVoice] = useState(false);
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState("");

  const currentChapter = useMemo(() => {
    return mangaChapters[selectedChapterIndex] || null;
  }, [mangaChapters, selectedChapterIndex]);

  const currentPages = currentChapter?.pages || [];

  // -------------------------------------------------
  // LOAD DATA
  // -------------------------------------------------
  const loadData = async () => {
    const currentUser = sessionStorage.getItem("adminUser");

    const resNovels = await fetch("/api/novels");
    const resMangas = await fetch("/api/mangas");

    const novelsData = await resNovels.json();
    const mangasData = await resMangas.json();

    setNovels(novelsData.filter((n) => !n.author || n.author === currentUser));
    setMangas(mangasData.filter((m) => !m.author || m.author === currentUser));
  };

  useEffect(() => {
    loadData();
  }, []);

  // -------------------------------------------------
  // UPLOAD IMAGE
  // -------------------------------------------------
  const handleFileChange = (e) => setFile(e.target.files[0]);

  const uploadImage = async () => {
    if (!file) return;
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      setCover(data.url);
    } catch (error) {
      console.error(error);
      alert("Error subiendo imagen");
    } finally {
      setUploading(false);
    }
  };

  // -------------------------------------------------
  // HELPERS MANGA
  // -------------------------------------------------
const normalizeLegacyPagesToChapter = (item) => {
  if (item?.chapters?.length) {
    return item.chapters.map((chapter, idx) => ({
      chapterNumber: chapter.chapterNumber || idx + 1,
      title: chapter.title || `Capítulo ${idx + 1}`,
      prompt: chapter.prompt || "",
      pages: (chapter.pages || []).map((page, pageIndex) => ({
        pageNumber: page.pageNumber || page.page || pageIndex + 1,
      panels: (page.panels || []).map((panel, panelIndex) => ({
  type: panel.type || "narration",
  dialogue: panel.dialogue || "",
  imagePrompt: panel.imagePrompt || "",
  imageUrl: panel.imageUrl || panel.image || "",
  order: panel.order || panelIndex + 1,
})),
      })),
    }));
  }

  if (item?.pages?.length) {
    return [
      {
        chapterNumber: 1,
        title: "Capítulo 1",
        prompt: "",
        pages: item.pages.map((page, pageIndex) => ({
          pageNumber: page.pageNumber || page.page || pageIndex + 1,
          panels: (page.panels || []).map((panel, panelIndex) => ({
  type: panel.type || "narration",
  dialogue: panel.dialogue || "",
  imagePrompt: panel.imagePrompt || "",
  imageUrl: panel.imageUrl || panel.image || "",
  order: panel.order || panelIndex + 1,
}))
        })),
      },
    ];
  }

  return [];
};

  const createNewChapter = () => {
    const nextNumber = mangaChapters.length + 1;

    const newChapter = {
      chapterNumber: nextNumber,
      title: chapterTitle.trim() || `Capítulo ${nextNumber}`,
      prompt: mangaPrompt || "",
      pages: [],
    };

    setMangaChapters((prev) => [...prev, newChapter]);
    setSelectedChapterIndex(mangaChapters.length);
    setGeneratedAudioUrl("");
    setGeneratedVideoUrl("");
  };

  // -------------------------------------------------
  // SELECT ITEM
  // -------------------------------------------------
  const handleSelect = (type, id) => {
    setSelectedId(id);
    setTab(type);

    const list = type === "novels" ? novels : mangas;
    const item = list.find((x) => x._id === id);

    setTitle(item?.title || "");
    setDescription(item?.description || "");
    setCover(item?.cover || item?.coverUrl || "");

    if (type === "novels") {
      setChapters(
        item?.chapters?.length ? item.chapters : [{ title: "", content: "" }]
      );
      setGenres(item?.genres || []);
      setGenresText((item?.genres || []).join(", "));

      setMangaChapters([]);
      setSelectedChapterIndex(0);
      setChapterTitle("");
      setMangaPrompt("");
    }

    if (type === "mangas") {
      setChapters([]);
      setGenres([]);
      setGenresText("");

      const loadedChapters = normalizeLegacyPagesToChapter(item);

      setMangaChapters(loadedChapters);
      setSelectedChapterIndex(0);
      setChapterTitle(loadedChapters[0]?.title || "Capítulo 1");
      setMangaPrompt(loadedChapters[0]?.prompt || "");
    }

    setGeneratedAudioUrl("");
    setGeneratedVideoUrl("");
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

    setMangaChapters([]);
    setSelectedChapterIndex(0);
    setChapterTitle("");
    setMangaPrompt("");

    setGeneratedAudioUrl("");
    setGeneratedVideoUrl("");
  };

  // -------------------------------------------------
  // SAVE NOVEL
  // -------------------------------------------------
  const saveNovel = async (e) => {
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
 const saveManga = async (e) => {
  e.preventDefault();

  const currentUser = sessionStorage.getItem("adminUser");

  const normalizedChapters = mangaChapters.map((chapter, chapterIndex) => ({
    chapterNumber: chapter.chapterNumber || chapterIndex + 1,
    title: chapter.title || `Capítulo ${chapterIndex + 1}`,
    prompt: chapter.prompt || "",
    pages: (chapter.pages || []).map((page, pageIndex) => ({
      pageNumber: page.pageNumber || pageIndex + 1,
      panels: (page.panels || []).map((panel, panelIndex) => ({
  type: panel.type || "narration",
  dialogue: panel.dialogue || "",
  imagePrompt: panel.imagePrompt || "",
  imageUrl: panel.imageUrl || "",
  order: panel.order || panelIndex + 1,
})),
    })),
  }));

  const payload = {
    title,
    coverUrl: cover,
    author: currentUser,
    chapters: normalizedChapters,
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

  let chaptersCopy = [...mangaChapters];
  let chapterIndex = selectedChapterIndex;

  if (!chaptersCopy.length) {
    const firstChapter = {
      chapterNumber: 1,
      title: chapterTitle.trim() || "Capítulo 1",
      prompt: mangaPrompt,
      pages: [],
    };

    chaptersCopy = [firstChapter];
    chapterIndex = 0;

    setMangaChapters(chaptersCopy);
    setSelectedChapterIndex(0);
    setChapterTitle(firstChapter.title);
  }

  const current = chaptersCopy[chapterIndex];

  try {
    const res = await fetch("/api/ai/generate-manga", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        prompt: mangaPrompt,
        previousPages: current.pages || [],
      }),
    });

    const data = await res.json();

    if (data.pages) {
      const offset = (current.pages || []).length;

      const newPages = data.pages.map((p, i) => ({
        pageNumber: offset + i + 1,
        panels: (p.panels || []).map((panel, panelIndex) => ({
  type: panel.type || "narration", // 🔥 CLAVE
  dialogue: panel.dialogue || "",
  imagePrompt: panel.imagePrompt || "",
  imageUrl: panel.imageUrl || panel.image || "",
  order: panel.order || panelIndex + 1,
}))
      }));

      chaptersCopy[chapterIndex] = {
        ...current,
        title: current.title || `Capítulo ${chapterIndex + 1}`,
        prompt: mangaPrompt,
        pages: [...(current.pages || []), ...newPages],
      };

      setMangaChapters(chaptersCopy);
      setGeneratedAudioUrl("");
      setGeneratedVideoUrl("");
    } else {
      alert("Error generando manga");
    }
  } catch (error) {
    console.error(error);
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

    const lines = data.chapter.split("\n").filter((l) => l.trim() !== "");

    const newChapter = {
      title: lines[0].replace("Título:", "").trim(),
      content: lines.slice(1).join("\n"),
    };

    setChapters([...chapters, newChapter]);
  };

  // -------------------------------------------------
  // GENERATE VIDEO
  // -------------------------------------------------
  const generateVideo = async () => {
    if (!title.trim()) return alert("El manga necesita título");
    if (!currentPages.length) {
      return alert("Primero genera o carga páginas del capítulo seleccionado");
    }

    setGeneratingVideo(true);
    setGeneratedVideoUrl("");

    try {
      const res = await fetch("/api/ai/generate-video", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          format: videoFormat,
          pages: currentPages,
          audioUrl: generatedAudioUrl || "",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error generando video");
      }

      setGeneratedVideoUrl(data.videoUrl);
      alert("Video generado correctamente");
    } catch (error) {
      console.error(error);
      alert(error.message || "No se pudo generar el video");
    } finally {
      setGeneratingVideo(false);
    }
  };

  // -------------------------------------------------
  // GENERATE VOICE
  // -------------------------------------------------
  const generateVoice = async () => {
    if (!title.trim()) return alert("El manga necesita título");
    if (!currentPages.length) {
      return alert("Primero genera o carga páginas del capítulo seleccionado");
    }

    setGeneratingVoice(true);
    setGeneratedAudioUrl("");

    try {
      const res = await fetch("/api/ai/generate-voice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          pages: currentPages,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error generando voz");
      }

      setGeneratedAudioUrl(data.audioUrl || "");
      alert("Voz generada correctamente");
    } catch (error) {
      console.error(error);
      alert(error.message || "No se pudo generar la voz");
    } finally {
      setGeneratingVoice(false);
    }
  };

  // -------------------------------------------------
  // DOWNLOAD VIDEO
  // -------------------------------------------------
  const downloadVideo = async () => {
    if (!generatedVideoUrl) return alert("Primero genera el video");

    try {
      const response = await fetch(generatedVideoUrl);
      const blob = await response.blob();

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      const safeTitle = (title || "manga_video")
        .replace(/[^\w\-]+/g, "_")
        .toLowerCase();

      const safeChapter = (currentChapter?.title || "capitulo")
        .replace(/[^\w\-]+/g, "_")
        .toLowerCase();

      a.download = `${safeTitle}_${safeChapter}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert("No se pudo descargar el video");
    }
  };

  const copyVideoLink = async () => {
    if (!generatedVideoUrl) return alert("Primero genera el video");

    try {
      await navigator.clipboard.writeText(generatedVideoUrl);
      alert("Enlace del video copiado");
    } catch (error) {
      console.error(error);
      alert("No se pudo copiar el enlace");
    }
  };

  // -------------------------------------------------
  // UPDATE CHAPTER TITLE/PROMPT IN STATE
  // -------------------------------------------------
  useEffect(() => {
    if (!mangaChapters.length) return;

    setMangaChapters((prev) => {
      const updated = [...prev];
      if (!updated[selectedChapterIndex]) return prev;

      updated[selectedChapterIndex] = {
        ...updated[selectedChapterIndex],
        title:
          chapterTitle.trim() ||
          updated[selectedChapterIndex].title ||
          `Capítulo ${selectedChapterIndex + 1}`,
        prompt: mangaPrompt,
      };

      return updated;
    });
  }, [chapterTitle, mangaPrompt]);

  return (
    <div className="admin-container">
      <h1 className="admin-title">Panel de Administración</h1>

      <button
        className="admin-button"
        onClick={() => (window.location.href = "/")}
      >
        ⬅ Inicio
      </button>

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

      {tab === "novels" && (
        <div>
          <h2>Gestión de Novelas</h2>

          <select
            value={selectedId}
            onChange={(e) => handleSelect("novels", e.target.value)}
            className="admin-select short-select"
          >
            <option value="">Nueva novela</option>
            {novels.map((n) => (
              <option key={n._id} value={n._id}>
                {n.title}
              </option>
            ))}
          </select>

          <form onSubmit={saveNovel} className="admin-form">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título"
            />

            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descripción"
            />

            <div className="genres-section">
              <label>Categorías:</label>

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
                placeholder="Escribe una categoría"
              />

              <div className="genres-tags">
                {genres.map((g, i) => (
                  <span key={i} className="genre-tag">
                    {g}
                    <button
                      type="button"
                      className="remove-tag"
                      onClick={() =>
                        setGenres(genres.filter((_, idx) => idx !== i))
                      }
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <input type="file" onChange={handleFileChange} />

            <button type="button" onClick={uploadImage}>
              {uploading ? "Subiendo..." : "Subir portada"}
            </button>

            {cover && <img src={cover} alt="Portada" className="cover-preview" />}

            <h3>Capítulos</h3>
            {chapters.map((ch, idx) => (
              <div key={idx} className="chapter-card">
                <input
                  value={ch.title}
                  onChange={(e) => {
                    const updated = [...chapters];
                    updated[idx].title = e.target.value;
                    setChapters(updated);
                  }}
                  placeholder="Título del capítulo"
                />

                <textarea
                  value={ch.content}
                  onChange={(e) => {
                    const updated = [...chapters];
                    updated[idx].content = e.target.value;
                    setChapters(updated);
                  }}
                  placeholder="Contenido"
                />
              </div>
            ))}

            <div className="admin-buttons">
              <button
                className="admin-button"
                type="button"
                onClick={() =>
                  setChapters([...chapters, { title: "", content: "" }])
                }
              >
                + Capítulo
              </button>

              <button
                className="admin-button"
                type="button"
                onClick={() => setChapters(chapters.slice(0, -1))}
              >
                - Quitar
              </button>

              <button
                className="admin-button"
                type="button"
                onClick={generateChapterAI}
              >
                ✨ Generar Capítulo IA
              </button>

              <button className="admin-button" type="submit">
                {selectedId ? "Actualizar" : "Guardar"}
              </button>

              {selectedId && (
                <button
                  className="admin-button delete"
                  type="button"
                  onClick={deleteItem}
                >
                  🗑 Eliminar
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {tab === "mangas" && (
        <div>
          <h2>Gestión de Mangas</h2>

          <select
            value={selectedId}
            onChange={(e) => handleSelect("mangas", e.target.value)}
            className="admin-select short-select"
          >
            <option value="">Nuevo manga</option>
            {mangas.map((m) => (
              <option key={m._id} value={m._id}>
                {m.title}
              </option>
            ))}
          </select>

          <form onSubmit={saveManga} className="admin-form">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título del manga"
            />

            <input
              value={chapterTitle}
              onChange={(e) => setChapterTitle(e.target.value)}
              placeholder="Título del capítulo"
            />

            <input type="file" onChange={handleFileChange} />

            <textarea
              value={mangaPrompt}
              onChange={(e) => setMangaPrompt(e.target.value)}
              placeholder="Describe qué pasa en este capítulo, personajes, emociones, escenario..."
            />

            <button className="admin-button" type="button" onClick={uploadImage}>
              {uploading ? "Subiendo..." : "Subir portada"}
            </button>

            {cover && <img src={cover} alt="Portada manga" className="cover-preview" />}

            <div
              style={{
                display: "flex",
                gap: "10px",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <button
                className="admin-button"
                type="button"
                onClick={createNewChapter}
              >
                📚 Nuevo Capítulo
              </button>

              {mangaChapters.length > 0 && (
                <select
                  value={selectedChapterIndex}
                  onChange={(e) => {
                    const idx = Number(e.target.value);
                    setSelectedChapterIndex(idx);
                    setChapterTitle(mangaChapters[idx]?.title || "");
                    setMangaPrompt(mangaChapters[idx]?.prompt || "");
                    setGeneratedAudioUrl("");
                    setGeneratedVideoUrl("");
                  }}
                  className="admin-select short-select"
                >
                  {mangaChapters.map((ch, idx) => (
                    <option key={idx} value={idx}>
                      {ch.title || `Capítulo ${idx + 1}`}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <button className="admin-button" type="button" onClick={generateManga}>
              🖤 Generar Manga IA
            </button>

            <button
              className="admin-button"
              type="button"
              onClick={() => {
  if (!mangaChapters.length) {
    const firstChapter = {
      chapterNumber: 1,
      title: chapterTitle.trim() || "Capítulo 1",
      prompt: mangaPrompt,
      pages: [],
    };

    const updated = [
      {
        ...firstChapter,
        pages: [
          {
            pageNumber: 1,
            panels: [
              {
                type: "narration",
                imageUrl: "",
                dialogue: "",
                imagePrompt: "",
                order: 1,
              },
            ],
          },
        ],
      },
    ];

    setMangaChapters(updated);
    setSelectedChapterIndex(0);
    setChapterTitle(updated[0].title);
    return;
  }

  const updated = [...mangaChapters];
  const selected = updated[selectedChapterIndex];
  const pages = selected.pages || [];

  selected.pages = [
    ...pages,
    {
      pageNumber: pages.length + 1,
      panels: [
        {
          type: "narration",
          imageUrl: "",
          dialogue: "",
          imagePrompt: "",
          order: 1,
        },
      ],
    },
  ];

  setMangaChapters(updated);
}}
            >
              ➕ Agregar Página
            </button>

            <button
              className="admin-button"
              type="button"
              onClick={() => {
                if (!mangaChapters.length) return;

                const updated = [...mangaChapters];
                const selected = updated[selectedChapterIndex];
                selected.pages = (selected.pages || []).slice(0, -1);
                setMangaChapters(updated);
              }}
            >
              - Quitar
            </button>

            <h3>{currentChapter ? currentChapter.title : "Páginas del Manga"}</h3>

            {!currentPages.length && <p>No hay páginas en este capítulo.</p>}

            {currentPages.map((page, pageIndex) => (
  <div key={`${selectedChapterIndex}-${page.pageNumber}-${pageIndex}`} className="manga-page">
    <h4>Página {page.pageNumber}</h4>

    {page.panels.map((panel, panelIndex) => (
      <div key={`${page.pageNumber}-${panel.order}-${panelIndex}`} className="manga-panel">
        {panel.imageUrl && (
          <img
            src={panel.imageUrl}
            alt={`Panel ${panelIndex + 1}`}
            className="manga-image"
          />
        )}
        <div style={{ marginBottom: "6px", fontSize: "12px", opacity: 0.8 }}>
  {panel.type === "speech" && "💬 Diálogo"}
  {panel.type === "thought" && "🧠 Pensamiento"}
  {panel.type === "narration" && "📖 Narración"}
</div>

        <textarea
          value={panel.dialogue || ""}
          onChange={(e) => {
            const updated = [...mangaChapters];
            updated[selectedChapterIndex].pages[pageIndex].panels[panelIndex].dialogue = e.target.value;
            setMangaChapters(updated);
          }}
          placeholder="Diálogo"
        />
      </div>
    ))}
  </div>
))}

            <div
              style={{
                display: "flex",
                gap: "10px",
                alignItems: "center",
                flexWrap: "wrap",
                marginTop: "16px",
              }}
            >
              <select
                value={videoFormat}
                onChange={(e) => setVideoFormat(e.target.value)}
                className="admin-select short-select"
              >
                <option value="tiktok">TikTok / Shorts (9:16)</option>
                <option value="youtube">YouTube horizontal (16:9)</option>
              </select>

              <button
                className="admin-button"
                type="button"
                onClick={generateVideo}
                disabled={generatingVideo}
              >
                {generatingVideo ? "🎬 Generando video..." : "🎬 Generar Video"}
              </button>
            </div>

            {generatedVideoUrl && (
              <div style={{ marginTop: "16px" }}>
                <video
                  src={generatedVideoUrl}
                  controls
                  style={{
                    width: "100%",
                    maxWidth: "420px",
                    borderRadius: "12px",
                  }}
                />
                <div style={{ marginTop: "8px" }}>
                  <a href={generatedVideoUrl} target="_blank" rel="noreferrer">
                    Ver video generado
                  </a>
                </div>
              </div>
            )}

            <div
              style={{
                display: "flex",
                gap: "10px",
                alignItems: "center",
                flexWrap: "wrap",
                marginTop: "16px",
              }}
            >
              <button
                className="admin-button"
                type="button"
                onClick={generateVoice}
                disabled={generatingVoice}
              >
                {generatingVoice ? "🎙 Generando voz..." : "🎙 Generar Voz"}
              </button>

              <button
                className="admin-button"
                type="button"
                onClick={downloadVideo}
                disabled={!generatedVideoUrl}
              >
                ⬇ Descargar Video
              </button>

              <button
                className="admin-button"
                type="button"
                onClick={copyVideoLink}
                disabled={!generatedVideoUrl}
              >
                📋 Copiar Enlace
              </button>
            </div>

            {generatedAudioUrl && (
              <div style={{ marginTop: "16px" }}>
                <audio
                  src={generatedAudioUrl}
                  controls
                  style={{ width: "100%", maxWidth: "420px" }}
                />
              </div>
            )}

            <div className="admin-buttons">
              <button className="admin-button" type="submit">
                {selectedId ? "Actualizar" : "Guardar"}
              </button>

              {selectedId && (
                <button
                  className="admin-button delete"
                  type="button"
                  onClick={deleteItem}
                >
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
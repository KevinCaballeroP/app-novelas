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
  const [contentProfile, setContentProfile] = useState("tiktok");

  // STORYBOARD / IMAGEN GENERATION STATE
  const [generatingStoryboard, setGeneratingStoryboard] = useState(false);
  const [generatingPanelImages, setGeneratingPanelImages] = useState({}); // key: "pageIdx-panelIdx"
  const [uploadingPanelImages, setUploadingPanelImages] = useState({}); // key: "pageIdx-panelIdx"
  const [uploadingPanelVideos, setUploadingPanelVideos] = useState({}); // key: "pageIdx-panelIdx"
  const [generatingMissingImages, setGeneratingMissingImages] = useState(false);
  const [missingProgress, setMissingProgress] = useState("");

  // Expanded finalPrompt panels: key "pageIdx-panelIdx" -> boolean
  const [expandedFinalPrompts, setExpandedFinalPrompts] = useState({});

  const [generatingVideo, setGeneratingVideo] = useState(false);

  const [selectedFormats, setSelectedFormats] = useState([
    "tiktok",
    "shorts",
    "youtube",
  ]);

  const [generatedVideos, setGeneratedVideos] = useState({
    tiktok: "",
    shorts: "",
    youtube: "",
  });

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
            characters: Array.isArray(panel.characters) ? panel.characters : [],
            sceneFocus: panel.sceneFocus || "",
            panelKind: panel.panelKind || "",
            viewAngle: panel.viewAngle || "front",
            animation: panel.animation || null,
            generatedFrames: Array.isArray(panel.generatedFrames) ? panel.generatedFrames : [],
            directorIntent: panel.directorIntent || "",
            emotionalBeat: panel.emotionalBeat || "",
            visualPriority: panel.visualPriority || "medium",
            worldMode: panel.worldMode || "auto",
            veoCandidate: !!panel.veoCandidate,
            veoPrompt: panel.veoPrompt || "",
            manualVideoUrl: panel.manualVideoUrl || panel.flowVideoUrl || "",
            finalPrompt: panel.finalPrompt || "",
            renderMeta: panel.renderMeta || null,
            approved: !!panel.approved,
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
              characters: Array.isArray(panel.characters) ? panel.characters : [],
              sceneFocus: panel.sceneFocus || "",
              panelKind: panel.panelKind || "",
              viewAngle: panel.viewAngle || "front",
              animation: panel.animation || null,
              generatedFrames: Array.isArray(panel.generatedFrames) ? panel.generatedFrames : [],
              directorIntent: panel.directorIntent || "",
              emotionalBeat: panel.emotionalBeat || "",
              visualPriority: panel.visualPriority || "medium",
              worldMode: panel.worldMode || "auto",
              veoCandidate: !!panel.veoCandidate,
              veoPrompt: panel.veoPrompt || "",
              manualVideoUrl: panel.manualVideoUrl || panel.flowVideoUrl || "",
              finalPrompt: panel.finalPrompt || "",
              renderMeta: panel.renderMeta || null,
              approved: !!panel.approved,
            })),
          })),
        },
      ];
    }

    return [];
  };

  const normalizePanel = (panel, panelIndex) => ({
    type: panel.type || "narration",
    dialogue: panel.dialogue || "",
    imagePrompt: panel.imagePrompt || "",
    imageUrl: panel.imageUrl || "",
    order: panel.order || panelIndex + 1,
    characters: Array.isArray(panel.characters) ? panel.characters : [],
    sceneFocus: panel.sceneFocus || "",
    panelKind: panel.panelKind || "",
    viewAngle: panel.viewAngle || "front",
    animation: panel.animation || null,
    generatedFrames: Array.isArray(panel.generatedFrames) ? panel.generatedFrames : [],
    directorIntent: panel.directorIntent || "",
    emotionalBeat: panel.emotionalBeat || "",
    visualPriority: panel.visualPriority || "medium",
    worldMode: panel.worldMode || "auto",
    veoCandidate: !!panel.veoCandidate,
    veoPrompt: panel.veoPrompt || "",
    manualVideoUrl: panel.manualVideoUrl || "",
    audioUrl: panel.audioUrl || "",
    finalPrompt: panel.finalPrompt || "",
    renderMeta: panel.renderMeta || null,
    approved: !!panel.approved,
  });

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

    setGeneratedVideos({ tiktok: "", shorts: "", youtube: "" });
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
      setContentProfile("tiktok");
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
      setContentProfile("tiktok");
    }

    setGeneratedVideos({ tiktok: "", shorts: "", youtube: "" });
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
    setContentProfile("tiktok");

    setGeneratedVideos({ tiktok: "", shorts: "", youtube: "" });
    setGeneratingPanelImages({});
    setExpandedFinalPrompts({});
    setMissingProgress("");
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
        panels: (page.panels || []).map((panel, panelIndex) =>
          normalizePanel(panel, panelIndex)
        ),
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
  // ✅ PASO 1: GENERAR STORYBOARD (sin imágenes)
  // -------------------------------------------------
  const generateStoryboard = async () => {
    if (!title.trim()) return alert("Pon un título al manga");
    if (!mangaPrompt.trim()) return alert("Describe el capítulo");

    // Confirmar si ya hay páginas
    if (currentPages.length > 0) {
      const ok = confirm(
        "Esto reemplazará el storyboard actual de este capítulo. ¿Continuar?"
      );
      if (!ok) return;
    }

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

    setGeneratingStoryboard(true);

    try {
      const current = chaptersCopy[chapterIndex];

      const res = await fetch("/api/manga/storyboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          prompt: mangaPrompt,
          previousPages: [], // siempre vacío: reemplazamos
          contentProfile,
          chapterNumber: current.chapterNumber || chapterIndex + 1,
        }),
      });

      const data = await res.json();

      if (!data.pages) {
        alert(data.error || "Error generando storyboard");
        return;
      }

      const newPages = data.pages.map((p, i) => ({
        pageNumber: i + 1,
        panels: (p.panels || []).map((panel, panelIndex) =>
          normalizePanel(panel, panelIndex)
        ),
      }));

      chaptersCopy[chapterIndex] = {
        ...current,
        title: current.title || `Capítulo ${chapterIndex + 1}`,
        prompt: mangaPrompt,
        pages: newPages, // reemplaza completamente
      };

      setMangaChapters([...chaptersCopy]);
      setGeneratedVideos({ tiktok: "", shorts: "", youtube: "" });
      setGeneratingPanelImages({});
      setExpandedFinalPrompts({});
    } catch (error) {
      console.error(error);
      alert("Error generando storyboard");
    } finally {
      setGeneratingStoryboard(false);
    }
  };

  // -------------------------------------------------
  // ✅ PASO 2: GENERAR IMAGEN POR PANEL
  // -------------------------------------------------
  const generatePanelImage = async (pageIndex, panelIndex) => {
    const panelKey = `${pageIndex}-${panelIndex}`;
    setGeneratingPanelImages((prev) => ({ ...prev, [panelKey]: true }));

    try {
      const page = currentPages[pageIndex];
      const panel = page?.panels?.[panelIndex];

      if (!panel) {
        alert("Panel no encontrado");
        return;
      }

      const chapterNumber =
        currentChapter?.chapterNumber || selectedChapterIndex + 1;

      const res = await fetch("/api/manga/generate-panel-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          chapterNumber,
          pageIndex,
          panelIndex,
          panel,
          contentProfile,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        alert(data.error || "Error generando imagen del panel");
        return;
      }

      // Actualizar solo ese panel en el estado
      setMangaChapters((prev) => {
        const updated = [...prev];
        const chapter = { ...updated[selectedChapterIndex] };
        const pages = [...(chapter.pages || [])];
        const pg = { ...pages[pageIndex] };
        const panels = [...(pg.panels || [])];

        panels[panelIndex] = {
          ...panels[panelIndex],
          imageUrl: data.imageUrl,
          generatedFrames: data.generatedFrames || [],
          finalPrompt: data.finalPrompt || "",
          renderMeta: data.renderMeta || null,
        };

        pg.panels = panels;
        pages[pageIndex] = pg;
        chapter.pages = pages;
        updated[selectedChapterIndex] = chapter;
        return updated;
      });
    } catch (error) {
      console.error(error);
      alert("Error generando imagen del panel");
    } finally {
      setGeneratingPanelImages((prev) => {
        const copy = { ...prev };
        delete copy[panelKey];
        return copy;
      });
    }
  };

  // -------------------------------------------------
  // ✅ SUBIR IMAGEN MANUAL POR PANEL
  // -------------------------------------------------
  const uploadManualPanelImage = async (pageIndex, panelIndex, uploadedFile) => {
    if (!uploadedFile) return;

    const panelKey = `${pageIndex}-${panelIndex}`;
    setUploadingPanelImages((prev) => ({ ...prev, [panelKey]: true }));

    try {
      const formData = new FormData();
      formData.append("file", uploadedFile);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.url) {
        throw new Error(data.error || "No se pudo subir la imagen");
      }

      setMangaChapters((prev) => {
        const updated = [...prev];
        const chapter = { ...updated[selectedChapterIndex] };
        const pages = [...(chapter.pages || [])];
        const pg = { ...pages[pageIndex] };
        const panels = [...(pg.panels || [])];

        panels[panelIndex] = {
          ...panels[panelIndex],
          imageUrl: data.url,
          generatedFrames: [],
          renderMeta: null,
        };

        pg.panels = panels;
        pages[pageIndex] = pg;
        chapter.pages = pages;
        updated[selectedChapterIndex] = chapter;
        return updated;
      });
    } catch (error) {
      console.error(error);
      alert(error.message || "Error subiendo imagen manual del panel");
    } finally {
      setUploadingPanelImages((prev) => {
        const copy = { ...prev };
        delete copy[panelKey];
        return copy;
      });
    }
  };

  // -------------------------------------------------
  // ✅ SUBIR VIDEO MANUAL POR PANEL
  // -------------------------------------------------
  const uploadManualPanelVideo = async (pageIndex, panelIndex, uploadedFile) => {
    if (!uploadedFile) return;

    const panelKey = `${pageIndex}-${panelIndex}`;
    setUploadingPanelVideos((prev) => ({ ...prev, [panelKey]: true }));

    try {
      const formData = new FormData();
      formData.append("file", uploadedFile);

      const res = await fetch("/api/upload-video", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.url) {
        throw new Error(data.error || "No se pudo subir el video");
      }

      setMangaChapters((prev) => {
        const updated = [...prev];
        const chapter = { ...updated[selectedChapterIndex] };
        const pages = [...(chapter.pages || [])];
        const pg = { ...pages[pageIndex] };
        const panels = [...(pg.panels || [])];

        panels[panelIndex] = {
          ...panels[panelIndex],
          manualVideoUrl: data.url,
        };

        pg.panels = panels;
        pages[pageIndex] = pg;
        chapter.pages = pages;
        updated[selectedChapterIndex] = chapter;
        return updated;
      });
    } catch (error) {
      console.error(error);
      alert(error.message || "Error subiendo video manual del panel");
    } finally {
      setUploadingPanelVideos((prev) => {
        const copy = { ...prev };
        delete copy[panelKey];
        return copy;
      });
    }
  };

  // -------------------------------------------------
  // ✅ GESTIÓN DE PÁGINAS DEL STORYBOARD
  // -------------------------------------------------
  const createEmptyPanel = () => ({
    type: "narration",
    imageUrl: "",
    dialogue: "",
    imagePrompt: "",
    order: 1,
    characters: [],
    sceneFocus: "",
    panelKind: "",
    viewAngle: "front",
    animation: null,
    generatedFrames: [],
    directorIntent: "",
    emotionalBeat: "",
    visualPriority: "medium",
    worldMode: "auto",
    veoCandidate: false,
    veoPrompt: "",
    manualVideoUrl: "",
    finalPrompt: "",
    renderMeta: null,
    approved: false,
  });

  const createEmptyPage = () => ({
    pageNumber: 1,
    panels: [createEmptyPanel()],
  });

  const renumberPages = (pages = []) =>
    pages.map((page, pageIndex) => ({
      ...page,
      pageNumber: pageIndex + 1,
      panels: (page.panels || []).map((panel, panelIndex) => ({
        ...panel,
        order: panelIndex + 1,
      })),
    }));

  const updateCurrentChapterPages = (updater) => {
    setMangaChapters((prev) => {
      const updated = [...prev];
      const chapter = { ...updated[selectedChapterIndex] };
      const newPages = renumberPages(updater(chapter.pages || []));
      chapter.pages = newPages;
      updated[selectedChapterIndex] = chapter;
      return updated;
    });
  };

  const insertPageAt = (pageIndex) => {
    updateCurrentChapterPages((pages) => {
      const copy = [...pages];
      copy.splice(pageIndex, 0, createEmptyPage());
      return copy;
    });
  };

  const insertPageAfter = (pageIndex) => {
    updateCurrentChapterPages((pages) => {
      const copy = [...pages];
      copy.splice(pageIndex + 1, 0, createEmptyPage());
      return copy;
    });
  };

  const deletePageAt = (pageIndex) => {
    if (!confirm(`¿Eliminar la página ${pageIndex + 1}? Esta acción no se puede deshacer.`)) return;
    updateCurrentChapterPages((pages) =>
      pages.filter((_, index) => index !== pageIndex)
    );
  };

  const movePage = (pageIndex, direction) => {
    updateCurrentChapterPages((pages) => {
      const targetIndex = pageIndex + direction;
      if (targetIndex < 0 || targetIndex >= pages.length) return pages;
      const copy = [...pages];
      [copy[pageIndex], copy[targetIndex]] = [copy[targetIndex], copy[pageIndex]];
      return copy;
    });
  };

  // -------------------------------------------------
  // ✅ GENERAR IMÁGENES FALTANTES (paneles sin imageUrl)
  // -------------------------------------------------
  const generateMissingImages = async () => {
    if (!title.trim()) return alert("El manga necesita título");

    const pages = currentPages;
    const missing = [];

    for (let pi = 0; pi < pages.length; pi++) {
      for (let pni = 0; pni < (pages[pi].panels || []).length; pni++) {
        if (!pages[pi].panels[pni].imageUrl) {
          missing.push({ pageIndex: pi, panelIndex: pni });
        }
      }
    }

    if (!missing.length) {
      alert("Todos los paneles ya tienen imagen");
      return;
    }

    setGeneratingMissingImages(true);
    setMissingProgress(`0 / ${missing.length}`);

    for (let i = 0; i < missing.length; i++) {
      const { pageIndex, panelIndex } = missing[i];
      setMissingProgress(`${i + 1} / ${missing.length} — Página ${pageIndex + 1}, Panel ${panelIndex + 1}`);
      await generatePanelImage(pageIndex, panelIndex);
    }

    setMissingProgress("");
    setGeneratingMissingImages(false);
    alert("Imágenes faltantes generadas");
  };

  // -------------------------------------------------
  // GENERATE CHAPTER AI (novels)
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
  // TOGGLE FORMAT
  // -------------------------------------------------
  const toggleFormat = (format) => {
    setSelectedFormats((prev) => {
      if (prev.includes(format)) {
        const updated = prev.filter((f) => f !== format);
        return updated.length ? updated : [format];
      }
      return [...prev, format];
    });
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
    setGeneratedVideos({ tiktok: "", shorts: "", youtube: "" });

    try {
      const res = await fetch("/api/ai/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          formats: selectedFormats,
          pages: currentPages,
          usePanelVoices: true,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error generando video");
      }

      const mapped = { tiktok: "", shorts: "", youtube: "" };

      for (const item of data.videos || []) {
        if (item?.format && item?.videoUrl) {
          mapped[item.format] = item.videoUrl;
        }
      }

      setGeneratedVideos(mapped);
      alert("Videos generados correctamente");
    } catch (error) {
      console.error(error);
      alert(error.message || "No se pudo generar el video");
    } finally {
      setGeneratingVideo(false);
    }
  };

  // -------------------------------------------------
  // DOWNLOAD VIDEO
  // -------------------------------------------------
  const downloadVideo = async (format) => {
    const videoUrl = generatedVideos[format];
    if (!videoUrl) return alert(`Primero genera el video ${format}`);

    try {
      const response = await fetch(videoUrl);
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

      a.download = `${safeTitle}_${safeChapter}_${format}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert(`No se pudo descargar el video ${format}`);
    }
  };

  const copyVideoLink = async (format) => {
    const videoUrl = generatedVideos[format];
    if (!videoUrl) return alert(`Primero genera el video ${format}`);

    try {
      await navigator.clipboard.writeText(videoUrl);
      alert(`Enlace del video ${format} copiado`);
    } catch (error) {
      console.error(error);
      alert(`No se pudo copiar el enlace de ${format}`);
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
  }, [chapterTitle, mangaPrompt, selectedChapterIndex, mangaChapters.length]);

  useEffect(() => {
    setGeneratedVideos({ tiktok: "", shorts: "", youtube: "" });
  }, [contentProfile]);

  // -------------------------------------------------
  // HELPER: update a single panel field
  // -------------------------------------------------
  const updatePanelField = (pageIndex, panelIndex, field, value) => {
    setMangaChapters((prev) => {
      const updated = [...prev];
      const chapter = { ...updated[selectedChapterIndex] };
      const pages = [...(chapter.pages || [])];
      const pg = { ...pages[pageIndex] };
      const panels = [...(pg.panels || [])];
      panels[panelIndex] = { ...panels[panelIndex], [field]: value };
      pg.panels = panels;
      pages[pageIndex] = pg;
      chapter.pages = pages;
      updated[selectedChapterIndex] = chapter;
      return updated;
    });
  };

  const toggleFinalPrompt = (pageIndex, panelIndex) => {
    const key = `${pageIndex}-${panelIndex}`;
    setExpandedFinalPrompts((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // -------------------------------------------------
  // RENDER
  // -------------------------------------------------
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

            <div
              style={{
                display: "flex",
                gap: "12px",
                alignItems: "center",
                flexWrap: "wrap",
                marginTop: "10px",
                marginBottom: "10px",
              }}
            >
              <label style={{ fontWeight: 600 }}>Estilo de manga:</label>

              <label style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <input
                  type="radio"
                  name="contentProfile"
                  value="tiktok"
                  checked={contentProfile === "tiktok"}
                  onChange={() => setContentProfile("tiktok")}
                />
                TikTok / Shorts
              </label>

              <label style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <input
                  type="radio"
                  name="contentProfile"
                  value="youtube"
                  checked={contentProfile === "youtube"}
                  onChange={() => setContentProfile("youtube")}
                />
                YouTube Horizontal
              </label>
            </div>

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
                    setGeneratedVideos({ tiktok: "", shorts: "", youtube: "" });
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

            {/* ============================================================
                PASO 1: GENERAR STORYBOARD
                ============================================================ */}
            <div style={{ marginTop: "16px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                className="admin-button"
                type="button"
                onClick={generateStoryboard}
                disabled={generatingStoryboard}
                style={{ background: "linear-gradient(135deg, #4f00bc, #7c3aed)" }}
              >
                {generatingStoryboard
                  ? "⏳ Generando storyboard..."
                  : "🧠 Generar Storyboard"}
              </button>

              <button
                className="admin-button"
                type="button"
                onClick={() => updateCurrentChapterPages((pages) => [...pages, createEmptyPage()])}
              >
                ➕ Agregar Página al final
              </button>

              <button
                className="admin-button"
                type="button"
                onClick={() => {
                  if (!mangaChapters.length) return;
                  updateCurrentChapterPages((pages) =>
                    pages.length > 1 ? pages.slice(0, -1) : pages
                  );
                }}
              >
                − Quitar última
              </button>
            </div>

            {/* ============================================================
                PASO 2: GENERAR IMÁGENES FALTANTES (general)
                ============================================================ */}
            {currentPages.length > 0 && (
              <div style={{ marginTop: "12px", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                <button
                  className="admin-button"
                  type="button"
                  onClick={generateMissingImages}
                  disabled={generatingMissingImages}
                  style={{ background: "linear-gradient(135deg, #0d7c00, #22c55e)" }}
                >
                  {generatingMissingImages
                    ? `⏳ Generando... ${missingProgress}`
                    : "🎨 Generar imágenes faltantes"}
                </button>

                {missingProgress && (
                  <span style={{ color: "#22c55e", fontSize: "13px" }}>
                    {missingProgress}
                  </span>
                )}
              </div>
            )}

            <h3>{currentChapter ? currentChapter.title : "Páginas del Manga"}</h3>

            {!currentPages.length && <p>No hay páginas en este capítulo. Genera el storyboard primero.</p>}

            {/* ============================================================
                PANELES EDITABLES
                ============================================================ */}
            {currentPages.map((page, pageIndex) => (
              <div
                key={`${selectedChapterIndex}-${page.pageNumber}-${pageIndex}`}
                className="manga-page"
                style={{
                  border: "1px solid rgba(0,183,255,0.2)",
                  borderRadius: "12px",
                  padding: "16px",
                  marginBottom: "24px",
                  background: "rgba(0,10,30,0.5)",
                }}
              >
                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "12px" }}>
                  <h4 style={{ margin: 0 }}>Página {page.pageNumber}</h4>

                  <button
                    type="button"
                    className="admin-button"
                    style={{ fontSize: "12px", padding: "4px 10px" }}
                    onClick={() => insertPageAt(pageIndex)}
                  >
                    ➕ Arriba
                  </button>

                  <button
                    type="button"
                    className="admin-button"
                    style={{ fontSize: "12px", padding: "4px 10px" }}
                    onClick={() => insertPageAfter(pageIndex)}
                  >
                    ➕ Abajo
                  </button>

                  <button
                    type="button"
                    className="admin-button"
                    style={{ fontSize: "12px", padding: "4px 10px" }}
                    onClick={() => movePage(pageIndex, -1)}
                    disabled={pageIndex === 0}
                  >
                    ⬆
                  </button>

                  <button
                    type="button"
                    className="admin-button"
                    style={{ fontSize: "12px", padding: "4px 10px" }}
                    onClick={() => movePage(pageIndex, 1)}
                    disabled={pageIndex === currentPages.length - 1}
                  >
                    ⬇
                  </button>

                  <button
                    type="button"
                    className="admin-button"
                    style={{
                      fontSize: "12px",
                      padding: "4px 10px",
                      background: "linear-gradient(135deg, #7f1d1d, #ef4444)",
                    }}
                    onClick={() => deletePageAt(pageIndex)}
                  >
                    🗑 Eliminar página
                  </button>
                </div>

                {page.panels.map((panel, panelIndex) => {
                  const panelKey = `${pageIndex}-${panelIndex}`;
                  const isGenerating = !!generatingPanelImages[panelKey];
                  const isUploading = !!uploadingPanelImages[panelKey];
                  const isUploadingVideo = !!uploadingPanelVideos[panelKey];
                  const isFinalPromptExpanded = !!expandedFinalPrompts[panelKey];

                  return (
                    <div
                      key={`${page.pageNumber}-${panel.order}-${panelIndex}`}
                      className="manga-panel"
                      style={{
                        border: panel.approved
                          ? "1px solid #22c55e"
                          : "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "10px",
                        padding: "14px",
                        marginBottom: "18px",
                        background: "rgba(255,255,255,0.04)",
                      }}
                    >
                      {/* Imagen generada */}
                      {panel.imageUrl && (
                        <img
                          src={panel.imageUrl}
                          alt={`Panel ${panelIndex + 1}`}
                          className="manga-image"
                          style={{
                            width: "100%",
                            maxWidth: "380px",
                            borderRadius: "8px",
                            marginBottom: "10px",
                            display: "block",
                          }}
                        />
                      )}

                      {/* Cabecera del panel */}
                      <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "8px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "12px", opacity: 0.7 }}>
                          Panel {panelIndex + 1}
                          {panel.type === "speech" && " 💬"}
                          {panel.type === "thought" && " 🧠"}
                          {panel.type === "narration" && " 📖"}
                          {panel.panelKind && ` · ${panel.panelKind}`}
                          {panel.sceneFocus && ` · ${panel.sceneFocus}`}
                        </span>

                        {/* Approved checkbox */}
                        <label style={{ fontSize: "12px", display: "flex", gap: "4px", alignItems: "center", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={!!panel.approved}
                            onChange={(e) =>
                              updatePanelField(pageIndex, panelIndex, "approved", e.target.checked)
                            }
                          />
                          ✅ Aprobado
                        </label>
                      </div>

                      {/* Diálogo */}
                      <label style={{ fontSize: "12px", color: "#00b7ff", display: "block", marginBottom: "4px" }}>
                        Diálogo
                      </label>
                      <textarea
                        value={panel.dialogue || ""}
                        onChange={(e) =>
                          updatePanelField(pageIndex, panelIndex, "dialogue", e.target.value)
                        }
                        placeholder="Diálogo"
                        style={{ width: "100%", minHeight: "60px", marginBottom: "10px", resize: "vertical" }}
                      />

                      {/* Image Prompt (editable principal) */}
                      <label style={{ fontSize: "12px", color: "#f59e0b", display: "block", marginBottom: "4px" }}>
                        🎨 Image Prompt (editable)
                      </label>
                      <textarea
                        value={panel.imagePrompt || ""}
                        onChange={(e) =>
                          updatePanelField(pageIndex, panelIndex, "imagePrompt", e.target.value)
                        }
                        placeholder="Describe la escena visualmente..."
                        style={{
                          width: "100%",
                          minHeight: "80px",
                          marginBottom: "10px",
                          resize: "vertical",
                          border: "1px solid rgba(245,158,11,0.4)",
                        }}
                      />

                      {/* Characters */}
                      <label style={{ fontSize: "12px", color: "#a78bfa", display: "block", marginBottom: "4px" }}>
                        Personajes (separados por coma)
                      </label>
                      <input
                        type="text"
                        value={(panel.characters || []).join(", ")}
                        onChange={(e) =>
                          updatePanelField(
                            pageIndex,
                            panelIndex,
                            "characters",
                            e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                          )
                        }
                        placeholder="Kelvin, Karol..."
                        style={{ width: "100%", marginBottom: "10px" }}
                      />

                      {/* Scene Focus */}
                      <label style={{ fontSize: "12px", color: "#a78bfa", display: "block", marginBottom: "4px" }}>
                        Scene Focus
                      </label>
                      <select
                        value={panel.sceneFocus || ""}
                        onChange={(e) =>
                          updatePanelField(pageIndex, panelIndex, "sceneFocus", e.target.value)
                        }
                        style={{
                          width: "100%",
                          marginBottom: "10px",
                          padding: "8px",
                          background: "rgba(0,0,0,0.4)",
                          color: "#fff",
                          borderRadius: "8px",
                          border: "1px solid rgba(167,139,250,0.3)",
                        }}
                      >
                        <option value="">— automático —</option>
                        <option value="single_character">single_character</option>
                        <option value="two_characters">two_characters</option>
                        <option value="character_in_environment">character_in_environment</option>
                        <option value="environment">environment</option>
                        <option value="object_focus">object_focus</option>
                        <option value="group_scene">group_scene</option>
                        <option value="creature_focus">creature_focus</option>
                        <option value="world_explanation">world_explanation</option>
                      </select>

                      {/* World Mode */}
                      <label style={{ fontSize: "12px", color: "#34d399", display: "block", marginBottom: "4px" }}>
                        🌍 World Mode
                        {panel.worldMode && panel.worldMode !== "auto" && (
                          <span style={{
                            marginLeft: "8px",
                            fontSize: "10px",
                            padding: "2px 8px",
                            borderRadius: "10px",
                            background:
                              panel.worldMode === "modern_world" ? "rgba(59,130,246,0.3)" :
                              panel.worldMode === "tower_emergence" ? "rgba(168,85,247,0.3)" :
                              panel.worldMode === "cultivation_world" ? "rgba(234,179,8,0.3)" :
                              panel.worldMode === "inside_tower" ? "rgba(239,68,68,0.3)" :
                              panel.worldMode === "combat" ? "rgba(249,115,22,0.3)" :
                              "rgba(255,255,255,0.1)",
                            color: "#fff",
                          }}>
                            {panel.worldMode}
                          </span>
                        )}
                      </label>
                      <select
                        value={panel.worldMode || "auto"}
                        onChange={(e) =>
                          updatePanelField(pageIndex, panelIndex, "worldMode", e.target.value)
                        }
                        style={{
                          width: "100%",
                          marginBottom: "10px",
                          padding: "8px",
                          background: "rgba(0,0,0,0.4)",
                          color: "#fff",
                          borderRadius: "8px",
                          border: "1px solid rgba(52,211,153,0.3)",
                        }}
                      >
                        <option value="auto">— inferir automáticamente —</option>
                        <option value="modern_world">🏙 modern_world (antes de las torres)</option>
                        <option value="tower_emergence">🗼 tower_emergence (aparición de torres)</option>
                        <option value="cultivation_world">⚡ cultivation_world (mundo xianxia)</option>
                        <option value="inside_tower">🏚 inside_tower (interior, mazmorras)</option>
                        <option value="combat">⚔️ combat (pelea, habilidades, aura)</option>
                      </select>

                      {(panel.veoCandidate || panel.veoPrompt) && (
                        <div style={{ marginTop: "8px", padding: "10px", border: "1px solid #444", borderRadius: "8px" }}>
                          <strong>🎥 Escena Veo/Flow</strong>
                          <textarea
                            value={panel.veoPrompt || ""}
                            onChange={(e) =>
                              updatePanelField(pageIndex, panelIndex, "veoPrompt", e.target.value)
                            }
                            style={{ marginTop: "8px", width: "100%", minHeight: "60px", resize: "vertical" }}
                            placeholder="Descripción para animación Veo/Flow..."
                          />
                        </div>
                      )}

                      {/* Manual Video URL — texto */}
                      <label style={{ fontSize: "12px", color: "#f472b6", display: "block", marginBottom: "4px", marginTop: "10px" }}>
                        URL de video manual (Flow/Veo/Runway)
                      </label>
                      <input
                        value={panel.manualVideoUrl || ""}
                        onChange={(e) =>
                          updatePanelField(pageIndex, panelIndex, "manualVideoUrl", e.target.value)
                        }
                        placeholder="Pega aquí la URL del video o sube uno con el botón de abajo"
                        style={{ width: "100%", marginBottom: "4px" }}
                      />
                      {/* Preview link si ya tiene video */}
                      {panel.manualVideoUrl && (
                        <a
                          href={panel.manualVideoUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: "11px", color: "#60a5fa", display: "block", marginBottom: "10px" }}
                        >
                          🎥 Ver video guardado
                        </a>
                      )}

                      {/* Botones de imagen */}
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px" }}>
                        <button
                          className="admin-button"
                          type="button"
                          onClick={() => generatePanelImage(pageIndex, panelIndex)}
                          disabled={isGenerating || isUploading}
                          style={{
                            background: panel.imageUrl
                              ? "linear-gradient(135deg, #0d7c00, #22c55e)"
                              : "linear-gradient(135deg, #007bff, #00b7ff)",
                            fontSize: "13px",
                            padding: "8px 14px",
                          }}
                        >
                          {isGenerating
                            ? "⏳ Generando..."
                            : panel.imageUrl
                            ? "🔁 Regenerar Imagen"
                            : "🎨 Generar Imagen"}
                        </button>

                        {/* Subida manual de imagen */}
                        <label
                          className="admin-button"
                          style={{
                            cursor: isUploading || isGenerating ? "not-allowed" : "pointer",
                            background: "linear-gradient(135deg, #7c3aed, #a855f7)",
                            fontSize: "13px",
                            padding: "8px 14px",
                            opacity: isUploading || isGenerating ? 0.6 : 1,
                            display: "inline-flex",
                            alignItems: "center",
                          }}
                        >
                          {isUploading ? "⏳ Subiendo..." : "📤 Subir imagen manual"}
                          <input
                            type="file"
                            accept="image/*"
                            hidden
                            disabled={isUploading || isGenerating}
                            onChange={(e) => {
                              const selectedFile = e.target.files?.[0];
                              if (selectedFile) {
                                uploadManualPanelImage(pageIndex, panelIndex, selectedFile);
                              }
                              e.target.value = "";
                            }}
                          />
                        </label>

                        {/* Subida manual de VIDEO */}
                        <label
                          className="admin-button"
                          style={{
                            cursor: isUploadingVideo || isGenerating ? "not-allowed" : "pointer",
                            background: "linear-gradient(135deg, #b45309, #f59e0b)",
                            fontSize: "13px",
                            padding: "8px 14px",
                            opacity: isUploadingVideo || isGenerating ? 0.6 : 1,
                            display: "inline-flex",
                            alignItems: "center",
                          }}
                        >
                          {isUploadingVideo ? "⏳ Subiendo video..." : "🎥 Subir video manual"}
                          <input
                            type="file"
                            accept="video/mp4,video/webm,video/quicktime"
                            hidden
                            disabled={isUploadingVideo || isGenerating}
                            onChange={(e) => {
                              const selectedFile = e.target.files?.[0];
                              if (selectedFile) {
                                uploadManualPanelVideo(pageIndex, panelIndex, selectedFile);
                              }
                              e.target.value = "";
                            }}
                          />
                        </label>
                      </div>

                      {/* finalPrompt colapsable (readonly, solo debug) */}
                      {panel.finalPrompt && (
                        <div style={{ marginTop: "12px" }}>
                          <button
                            type="button"
                            onClick={() => toggleFinalPrompt(pageIndex, panelIndex)}
                            style={{
                              background: "none",
                              border: "1px solid rgba(255,255,255,0.2)",
                              color: "#aaa",
                              fontSize: "11px",
                              padding: "4px 10px",
                              borderRadius: "6px",
                              cursor: "pointer",
                            }}
                          >
                            {isFinalPromptExpanded ? "▲ Ocultar finalPrompt" : "▼ Ver finalPrompt (debug)"}
                          </button>

                          {isFinalPromptExpanded && (
                            <textarea
                              readOnly
                              value={panel.finalPrompt}
                              style={{
                                width: "100%",
                                minHeight: "120px",
                                marginTop: "6px",
                                fontSize: "11px",
                                color: "#888",
                                background: "rgba(0,0,0,0.3)",
                                border: "1px solid rgba(255,255,255,0.1)",
                                borderRadius: "6px",
                                resize: "vertical",
                              }}
                            />
                          )}
                        </div>
                      )}

                      {/* renderMeta */}
                      {panel.renderMeta && (
                        <div style={{ fontSize: "10px", color: "#555", marginTop: "6px" }}>
                          sceneFocus: {panel.renderMeta.sceneFocus} · viewAngle: {panel.renderMeta.viewAngle} · motion: {panel.renderMeta.motionUsed}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            {/* ============================================================
                PASO 3: GENERAR VIDEO
                ============================================================ */}
            <div
              style={{
                display: "flex",
                gap: "10px",
                alignItems: "center",
                flexWrap: "wrap",
                marginTop: "16px",
              }}
            >
              <label style={{ fontWeight: 600 }}>Formatos de video:</label>

              <label style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={selectedFormats.includes("tiktok")}
                  onChange={() => toggleFormat("tiktok")}
                />
                TikTok
              </label>

              <label style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={selectedFormats.includes("shorts")}
                  onChange={() => toggleFormat("shorts")}
                />
                Shorts
              </label>

              <label style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={selectedFormats.includes("youtube")}
                  onChange={() => toggleFormat("youtube")}
                />
                YouTube
              </label>

              <button
                className="admin-button"
                type="button"
                onClick={generateVideo}
                disabled={generatingVideo}
              >
                {generatingVideo
                  ? "🎬 Generando videos..."
                  : "🎬 Generar Videos Automáticos"}
              </button>
            </div>

            {(generatedVideos.tiktok ||
              generatedVideos.shorts ||
              generatedVideos.youtube) && (
              <div style={{ marginTop: "20px", display: "grid", gap: "20px" }}>
                {generatedVideos.tiktok && (
                  <div>
                    <h4>📱 TikTok</h4>
                    <video
                      src={generatedVideos.tiktok}
                      controls
                      style={{
                        width: "100%",
                        maxWidth: "420px",
                        borderRadius: "12px",
                      }}
                    />
                    <div style={{ marginTop: "8px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <a href={generatedVideos.tiktok} target="_blank" rel="noreferrer">
                        Ver video
                      </a>
                      <button
                        className="admin-button"
                        type="button"
                        onClick={() => downloadVideo("tiktok")}
                      >
                        ⬇ Descargar
                      </button>
                      <button
                        className="admin-button"
                        type="button"
                        onClick={() => copyVideoLink("tiktok")}
                      >
                        📋 Copiar enlace
                      </button>
                    </div>
                  </div>
                )}

                {generatedVideos.shorts && (
                  <div>
                    <h4>🎞️ YouTube Shorts</h4>
                    <video
                      src={generatedVideos.shorts}
                      controls
                      style={{
                        width: "100%",
                        maxWidth: "420px",
                        borderRadius: "12px",
                      }}
                    />
                    <div style={{ marginTop: "8px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <a href={generatedVideos.shorts} target="_blank" rel="noreferrer">
                        Ver video
                      </a>
                      <button
                        className="admin-button"
                        type="button"
                        onClick={() => downloadVideo("shorts")}
                      >
                        ⬇ Descargar
                      </button>
                      <button
                        className="admin-button"
                        type="button"
                        onClick={() => copyVideoLink("shorts")}
                      >
                        📋 Copiar enlace
                      </button>
                    </div>
                  </div>
                )}

                {generatedVideos.youtube && (
                  <div>
                    <h4>🖥️ YouTube Horizontal</h4>
                    <video
                      src={generatedVideos.youtube}
                      controls
                      style={{
                        width: "100%",
                        maxWidth: "720px",
                        borderRadius: "12px",
                      }}
                    />
                    <div style={{ marginTop: "8px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <a href={generatedVideos.youtube} target="_blank" rel="noreferrer">
                        Ver video
                      </a>
                      <button
                        className="admin-button"
                        type="button"
                        onClick={() => downloadVideo("youtube")}
                      >
                        ⬇ Descargar
                      </button>
                      <button
                        className="admin-button"
                        type="button"
                        onClick={() => copyVideoLink("youtube")}
                      >
                        📋 Copiar enlace
                      </button>
                    </div>
                  </div>
                )}
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
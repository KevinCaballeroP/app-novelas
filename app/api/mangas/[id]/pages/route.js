import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/mongodb";
import Manga from "@/models/Manga";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_SECRET,
});

export async function POST(req, context) {
  try {
    await connectToDB();

    const { id: mangaId } = await context.params;
    const body = await req.json();
    const chapterNumber = Number(body.chapterNumber || 1);

    const uploadedPanels = [];

    for (const panel of body.panels || []) {
      let imageUrl = panel.imageUrl || "";

      if (panel.imageB64) {
        const uploaded = await cloudinary.uploader.upload(
          `data:image/png;base64,${panel.imageB64}`,
          {
            folder: "manga_panels",
            transformation: [{ quality: "auto" }],
          }
        );
        imageUrl = uploaded.secure_url;
      }

      uploadedPanels.push({
        type: panel.type || "narration",
        dialogue: panel.dialogue || "",
        imagePrompt: panel.imagePrompt || "",
        imageUrl,
        imageB64: "",
        order: panel.order,
      });
    }

    const manga = await Manga.findById(mangaId);

    if (!manga) {
      return NextResponse.json({ error: "Manga no encontrado" }, { status: 404 });
    }

    if (!Array.isArray(manga.chapters)) {
      manga.chapters = [];
    }

    let chapter = manga.chapters.find((c) => c.chapterNumber === chapterNumber);

    if (!chapter) {
      manga.chapters.push({
        chapterNumber,
        title: `Capítulo ${chapterNumber}`,
        prompt: "",
        pages: [],
      });
      chapter = manga.chapters.find((c) => c.chapterNumber === chapterNumber);
    }

    chapter.pages.push({
      pageNumber: body.pageNumber,
      panels: uploadedPanels,
      layout: body.layout || "standard",
    });

    await manga.save();

    return NextResponse.json({ ok: true, manga });
  } catch (error) {
    console.error("POST /api/mangas/[id]/pages error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/mongodb";
import Manga from "@/models/Manga";

export async function GET(req, context) {
  try {
    await connectToDB();

    const { id } = await context.params;
    const manga = await Manga.findById(id);

    if (!manga) {
      return NextResponse.json({ error: "Manga no encontrado" }, { status: 404 });
    }

    return NextResponse.json(manga);
  } catch (error) {
    console.error("GET /api/mangas/[id] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req, context) {
  try {
    await connectToDB();

    const { id } = await context.params;
    const body = await req.json();

    const cleanPanels = (panels = []) =>
      panels.map((panel) => ({
        ...panel,

        // No guardar base64 pesado en Mongo
        generatedFrames: [],

        // Guardar solo datos ligeros de debug
        renderMeta: panel.renderMeta
          ? {
              steps: panel.renderMeta.steps,
              guidance: panel.renderMeta.guidance,
              lora_scale: panel.renderMeta.lora_scale,
              worldMode: panel.renderMeta.worldMode,
              sceneFocus: panel.renderMeta.sceneFocus,
            }
          : null,
      }));

    const cleanPages = (pages = []) =>
      pages.map((page) => ({
        ...page,
        panels: cleanPanels(page.panels || []),
      }));

    const cleanChapters = (chapters = []) =>
      chapters.map((chapter) => ({
        ...chapter,
        pages: cleanPages(chapter.pages || []),
      }));

    const manga = await Manga.findByIdAndUpdate(
      id,
      {
        $set: {
          title: body.title,
          description: body.description || "",
          author: body.author,
          coverUrl: body.coverUrl || "",
          genres: body.genres || [],
          chapters: cleanChapters(body.chapters || []),
          pages: cleanPages(body.pages || []),
          published: body.published ?? false,
          visibility: body.visibility || "draft",
          aiGenerated: body.aiGenerated ?? true,
          sourceChapters: body.sourceChapters || [],
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!manga) {
      return NextResponse.json({ error: "Manga no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, manga });
  } catch (error) {
    console.error("PUT /api/mangas/[id] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req, context) {
  try {
    await connectToDB();

    const { id } = await context.params;
    const manga = await Manga.findByIdAndDelete(id);

    if (!manga) {
      return NextResponse.json({ error: "Manga no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, message: "Manga eliminado" });
  } catch (error) {
    console.error("DELETE /api/mangas/[id] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
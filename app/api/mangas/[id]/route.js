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

    console.log("BODY PUT MANGA:", JSON.stringify(body, null, 2));

    const manga = await Manga.findByIdAndUpdate(
      id,
      {
        $set: {
          title: body.title,
          description: body.description || "",
          author: body.author,
          coverUrl: body.coverUrl || "",
          genres: body.genres || [],
          chapters: body.chapters || [],
          pages: body.pages || [],
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

    console.log("MANGA GUARDADO:", JSON.stringify(manga, null, 2));

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
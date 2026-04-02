import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/mongodb";
import Manga from "@/models/Manga";

export async function GET() {
  try {
    await connectToDB();

    const mangas = await Manga.find().sort({ createdAt: -1 });
    return NextResponse.json(mangas);
  } catch (error) {
    console.error("GET /api/mangas error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    await connectToDB();
    const body = await req.json();

    const manga = await Manga.create({
      title: body.title,
      description: body.description || "",
      author: body.author,
      coverUrl: body.coverUrl || "",
      genres: body.genres || [],
      chapters: body.chapters || [],
      pages: body.pages || [], // compatibilidad vieja
      published: body.published ?? false,
      visibility: body.visibility || "draft",
      aiGenerated: body.aiGenerated ?? true,
      sourceChapters: body.sourceChapters || [],
    });

    return NextResponse.json({ ok: true, manga }, { status: 201 });
  } catch (error) {
    console.error("POST /api/mangas error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/mongodb";
import Manga from "@/models/Manga";

export async function GET(req, { params }) {
  await connectToDB();
  const manga = await Manga.findById(params.id);

  if (!manga) {
    return NextResponse.json({ error: "Manga no encontrado" }, { status: 404 });
  }

  return NextResponse.json(manga);
}

// ✅ EDITAR MANGA
export async function PUT(req, { params }) {
  await connectToDB();
  const data = await req.json();

  const manga = await Manga.findByIdAndUpdate(params.id, data, {
    new: true,
  });

  if (!manga) {
    return NextResponse.json({ error: "Manga no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, manga });
}

// ✅ ELIMINAR MANGA
export async function DELETE(req, { params }) {
  await connectToDB();

  const manga = await Manga.findByIdAndDelete(params.id);

  if (!manga) {
    return NextResponse.json({ error: "Manga no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, message: "Manga eliminado" });
}

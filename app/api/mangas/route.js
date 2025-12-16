import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/mongodb";
import Manga from "@/models/Manga";

export async function GET() {
  await connectToDB();
  const mangas = await Manga.find().sort({ createdAt: -1 });
  return NextResponse.json(mangas);
}

export async function POST(req) {
  await connectToDB();
  const body = await req.json();

  const manga = await Manga.create(body);

  return NextResponse.json({ ok: true, manga });
}

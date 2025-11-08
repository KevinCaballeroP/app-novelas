import { connectToDB } from "@/lib/mongodb";
import { Novel } from "@/models/Novel";
import { NextResponse } from "next/server";

export async function GET() {
  await connectToDB();
  const novels = await Novel.find();
  return NextResponse.json(novels);
}

export async function POST(req) {
  try {
    await connectToDB();
    const body = await req.json();
    const nueva = await Novel.create(body);
    return NextResponse.json(nueva);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

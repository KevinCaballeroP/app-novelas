import { connectToDB } from "@/lib/mongodb";
import { Novel } from "@/models/Novel";
import { NextResponse } from "next/server";

// Obtener una novela por ID
export async function GET(req, ctx) {
  try {
    await connectToDB();
    const { id } = await ctx.params;

    if (!id) {
      return NextResponse.json({ error: "ID no proporcionado" }, { status: 400 });
    }

    const novel = await Novel.findById(id);
    if (!novel) {
      return NextResponse.json({ error: "Novela no encontrada" }, { status: 404 });
    }

    return NextResponse.json(novel);
  } catch (error) {
    console.error("❌ Error GET /api/novel/[id]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Actualizar novela
export async function PUT(req, ctx) {
  try {
    await connectToDB();
    const { id } = await ctx.params;
    const body = await req.json();

    const updated = await Novel.findByIdAndUpdate(id, body, { new: true });
    if (!updated) {
      return NextResponse.json({ error: "Novela no encontrada" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("❌ Error PUT /api/novel/[id]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Eliminar novela
export async function DELETE(req, ctx) {
  try {
    await connectToDB();
    const { id } = await ctx.params;

    const deleted = await Novel.findByIdAndDelete(id);
    if (!deleted) {
      return NextResponse.json({ error: "Novela no encontrada" }, { status: 404 });
    }

    return NextResponse.json({ message: "Novela eliminada correctamente" });
  } catch (error) {
    console.error("❌ Error DELETE /api/novel/[id]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

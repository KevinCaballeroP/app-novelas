import { v2 as cloudinary } from "cloudinary";
import { NextResponse } from "next/server";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(request) {
  try {
    const data = await request.formData();
    const file = data.get("file");

    if (!file) {
      return NextResponse.json(
        { error: "No se recibió ningún archivo" },
        { status: 400 }
      );
    }

    // Convierte el archivo a base64 para enviarlo a Cloudinary
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString("base64");
    const mimeType = file.type;
    const fileUri = `data:${mimeType};base64,${base64}`;

    // 📤 Subir video a Cloudinary
    const uploadResponse = await cloudinary.uploader.upload(fileUri, {
      resource_type: "video",
      folder: "mangas/videos",
    });

    console.log("✅ Video subido a Cloudinary:", uploadResponse.secure_url);

    return NextResponse.json({ success: true, url: uploadResponse.secure_url });
  } catch (error) {
    console.error("❌ Error en subida de video:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

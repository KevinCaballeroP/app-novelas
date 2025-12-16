import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/mongodb";
import Manga from "@/models/Manga";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_SECRET,
});

export async function POST(req, { params }) {
  await connectToDB();
  const mangaId = params.id;
  const body = await req.json();

  // body: { pageNumber, panels: [{ dialogue, imageB64, imagePrompt, order }] }

  const uploadedPanels = [];

  for (const panel of body.panels) {
    let imageUrl = "";

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
      dialogue: panel.dialogue,
      imagePrompt: panel.imagePrompt,
      imageUrl,
      order: panel.order,
    });
  }

  const update = await Manga.findByIdAndUpdate(
    mangaId,
    {
      $push: {
        pages: {
          pageNumber: body.pageNumber,
          panels: uploadedPanels,
        },
      },
    },
    { new: true }
  );

  return NextResponse.json({ ok: true, manga: update });
}

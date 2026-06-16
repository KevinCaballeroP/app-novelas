import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/mongodb";
import { generateSinglePanelImage } from "@/app/api/ai/generate-manga/route";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    await connectToDB();

    const {
      title,
      chapterNumber = 1,
      pageIndex = 0,
      panelIndex = 0,
      panel,
      contentProfile = "tiktok",
    } = await req.json();

    if (!title?.trim()) {
      return NextResponse.json({ error: "Título requerido" }, { status: 400 });
    }
    if (!panel || !panel.imagePrompt) {
      return NextResponse.json(
        { error: "Panel con imagePrompt requerido" },
        { status: 400 }
      );
    }

    const pageNumber = (pageIndex ?? 0) + 1;
    const panelNumber = (panelIndex ?? 0) + 1;

    const result = await generateSinglePanelImage({
      panel,
      title,
      chapterNumber,
      pageNumber,
      panelIndex: panelNumber,
      contentProfile,
    });

    return NextResponse.json({
      imageUrl: result.imageUrl,
      generatedFrames: result.generatedFrames,
      finalPrompt: result.finalPrompt,
      renderMeta: result.renderMeta,
    });
  } catch (err) {
    console.error("❌ /api/manga/generate-panel-image error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

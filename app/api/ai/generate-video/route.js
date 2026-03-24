import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import path from "path";
import os from "os";
import { spawnSync } from "child_process";

export const runtime = "nodejs";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function getFfmpegPath() {
  return process.env.FFMPEG_PATH || "ffmpeg";
}

async function downloadFile(url, outputPath) {
  if (!url) {
    throw new Error("El archivo está vacío");
  }

  // Soporte para imágenes/audio en base64
  if (url.startsWith("data:")) {
    const base64Data = url.split(",")[1];
    fs.writeFileSync(outputPath, Buffer.from(base64Data, "base64"));
    return;
  }

  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const res = await fetch(url, {
        signal: controller.signal,
        cache: "no-store",
      });

      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} al descargar archivo`);
      }

      const arrayBuffer = await res.arrayBuffer();
      fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
      return;
    } catch (error) {
      lastError = error;
      console.error(`❌ Intento ${attempt} falló descargando archivo:`, url, error.message);
    }
  }

  throw new Error(
    `No se pudo descargar archivo después de 3 intentos: ${url}. ${lastError?.message || ""}`
  );
}

function cleanText(text = "") {
  return String(text)
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapePathForFFmpeg(filePath) {
  return filePath.replace(/\\/g, "/").replace(/:/g, "\\:");
}

export async function POST(req) {
  try {
    const { title, pages = [], format = "tiktok", audioUrl = "" } = await req.json();

    if (!pages.length) {
      return NextResponse.json(
        { error: "No hay páginas para generar video" },
        { status: 400 }
      );
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "manga-video-"));
    const ffmpegPath = getFfmpegPath();

    const isTikTok = format === "tiktok";
    const width = isTikTok ? 1080 : 1920;
    const height = isTikTok ? 1920 : 1080;

    const clipPaths = [];
    let globalIndex = 0;

    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const page = pages[pageIndex];
      const panels = Array.isArray(page.panels) ? page.panels : [];

      for (let panelIndex = 0; panelIndex < panels.length; panelIndex++) {
        const panel = panels[panelIndex];
        const imageUrl = panel.image || panel.imageUrl || "";

        if (!imageUrl) {
          console.warn(`⚠️ Panel sin imagen en página ${pageIndex + 1}, panel ${panelIndex + 1}`);
          continue;
        }

        globalIndex++;

        const imagePath = path.join(tempDir, `img_${globalIndex}.png`);
        const clipPath = path.join(tempDir, `clip_${globalIndex}.mp4`);
        const textPath = path.join(tempDir, `caption_${globalIndex}.txt`);

        console.log("🖼 Descargando imagen:", imageUrl);
        await downloadFile(imageUrl, imagePath);

        const caption = cleanText(panel.dialogue || "");
        fs.writeFileSync(textPath, caption, "utf8");

        const duration = caption.length > 90 ? 5 : 3;
        const escapedTextPath = escapePathForFFmpeg(textPath);

        const vfParts = [
          `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
          `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
          `zoompan=z='min(zoom+0.0008,1.08)':d=${duration * 30}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=30`,
        ];

        if (caption) {
          vfParts.push(
            `drawtext=textfile='${escapedTextPath}':fontcolor=white:fontsize=42:x=(w-text_w)/2:y=h-220:box=1:boxcolor=black@0.55:boxborderw=20`
          );
        }

        const vf = vfParts.join(",");

        const result = spawnSync(
          ffmpegPath,
          [
            "-y",
            "-loop", "1",
            "-i", imagePath,
            "-vf", vf,
            "-t", String(duration),
            "-r", "30",
            "-pix_fmt", "yuv420p",
            clipPath,
          ],
          {
            encoding: "utf8",
            shell: false,
          }
        );

        if (result.error) {
          console.error("❌ Error lanzando ffmpeg:", result.error);
          throw new Error(
            `No se pudo ejecutar ffmpeg. Revisa FFMPEG_PATH o el PATH del sistema. ${result.error.message}`
          );
        }

        if (result.status !== 0) {
          console.error("❌ ffmpeg stderr:", result.stderr);
          console.error("❌ ffmpeg stdout:", result.stdout);
          throw new Error(
            `ffmpeg falló al crear clip ${globalIndex}: ${result.stderr || "sin stderr"}`
          );
        }

        clipPaths.push(clipPath);
      }
    }

    if (!clipPaths.length) {
      return NextResponse.json(
        { error: "No se encontraron imágenes válidas para el video" },
        { status: 400 }
      );
    }

    const listFile = path.join(tempDir, "concat.txt");
    fs.writeFileSync(
      listFile,
      clipPaths.map((clip) => `file '${clip.replace(/\\/g, "/")}'`).join("\n"),
      "utf8"
    );

    const finalVideoPath = path.join(tempDir, "final_video.mp4");

    const concatResult = spawnSync(
      ffmpegPath,
      [
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", listFile,
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        finalVideoPath,
      ],
      {
        encoding: "utf8",
        shell: false,
      }
    );

    if (concatResult.error) {
      console.error("❌ Error lanzando ffmpeg concat:", concatResult.error);
      throw new Error(
        `No se pudo ejecutar ffmpeg al unir clips: ${concatResult.error.message}`
      );
    }

    if (concatResult.status !== 0) {
      console.error("❌ concat stderr:", concatResult.stderr);
      console.error("❌ concat stdout:", concatResult.stdout);
      throw new Error(
        `ffmpeg falló al unir clips: ${concatResult.stderr || "sin stderr"}`
      );
    }

    const videoWithAudioPath = path.join(tempDir, "final_with_audio.mp4");

    if (audioUrl) {
      const audioPath = path.join(tempDir, "voice.mp3");

      console.log("🎵 Descargando audio:", audioUrl);
      await downloadFile(audioUrl, audioPath);

      const mergeResult = spawnSync(
        ffmpegPath,
        [
          "-y",
          "-i", finalVideoPath,
          "-i", audioPath,
          "-c:v", "copy",
          "-c:a", "aac",
          "-shortest",
          videoWithAudioPath,
        ],
        {
          encoding: "utf8",
          shell: false,
        }
      );

      if (mergeResult.error) {
        console.error("❌ Error lanzando ffmpeg merge:", mergeResult.error);
        throw new Error(
          `No se pudo ejecutar ffmpeg al mezclar audio: ${mergeResult.error.message}`
        );
      }

      if (mergeResult.status !== 0) {
        console.error("❌ merge stderr:", mergeResult.stderr);
        console.error("❌ merge stdout:", mergeResult.stdout);
        throw new Error(
          `Error mezclando audio: ${mergeResult.stderr || "sin stderr"}`
        );
      }
    }

    const outputToUpload = audioUrl ? videoWithAudioPath : finalVideoPath;

    const uploadRes = await cloudinary.uploader.upload(outputToUpload, {
      resource_type: "video",
      folder: "manga_videos",
      public_id: `${title.replace(/\s+/g, "_").toLowerCase()}_${Date.now()}`,
    });

    return NextResponse.json({
      ok: true,
      videoUrl: uploadRes.secure_url,
    });
  } catch (err) {
    console.error("ERROR GENERATE VIDEO:", err);

    return NextResponse.json(
      { error: err.message || "Error generando video" },
      { status: 500 }
    );
  }
}
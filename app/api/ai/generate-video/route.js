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

function getFfprobePath(ffmpegPath) {
  if (ffmpegPath.toLowerCase().endsWith("ffmpeg.exe")) {
    return ffmpegPath.replace(/ffmpeg\.exe$/i, "ffprobe.exe");
  }
  return process.env.FFPROBE_PATH || "ffprobe";
}

async function downloadFile(url, outputPath) {
  if (!url) {
    throw new Error("El archivo está vacío");
  }

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

function normalizeCaptionForFile(text = "") {
  return String(text)
    .replace(/\r/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’´`]/g, "'")
    .replace(/\\/g, "")
    .replace(/%/g, " por ciento ")
    .replace(/\s+/g, " ")
    .trim();
}

function getAudioDuration(ffmpegPath, audioPath) {
  const ffprobePath = getFfprobePath(ffmpegPath);

  const result = spawnSync(
    ffprobePath,
    [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      audioPath,
    ],
    {
      encoding: "utf8",
      shell: false,
    }
  );

  if (result.error) {
    throw new Error(`No se pudo ejecutar ffprobe: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`No se pudo obtener duración del audio: ${result.stderr || "sin stderr"}`);
  }

  return parseFloat(result.stdout.trim());
}

function inferPanelMood(caption = "", imagePrompt = "") {
  const text = `${caption} ${imagePrompt}`.toLowerCase();

  if (
    text.includes("golpe") ||
    text.includes("ataque") ||
    text.includes("explosión") ||
    text.includes("impacto") ||
    text.includes("pelea") ||
    text.includes("corte") ||
    text.includes("gritó") ||
    text.includes("corrió") ||
    text.includes("saltó") ||
    text.includes("sangre") ||
    text.includes("acción") ||
    text.includes("action")
  ) {
    return "action";
  }

  if (
    text.includes("pensó") ||
    text.includes("susurró") ||
    text.includes("silencio") ||
    text.includes("triste") ||
    text.includes("dolor") ||
    text.includes("recuerdo") ||
    text.includes("miró") ||
    text.includes("emocional") ||
    text.includes("close-up")
  ) {
    return "emotional";
  }

  if (
    text.includes("torre") ||
    text.includes("ciudad") ||
    text.includes("paisaje") ||
    text.includes("mundo") ||
    text.includes("cielo") ||
    text.includes("montaña") ||
    text.includes("environment") ||
    text.includes("landscape")
  ) {
    return "environment";
  }

  return "dialogue";
}

function getFormatProfile(format) {
  if (format === "youtube") {
    return {
      width: 1920,
      height: 1080,
      fps: 30,
      panelPause: 0.16,
      minPanelDuration: 1.8,
      zoomBase: "slow",
      subtitleFontSize: 42,
      subtitleBottomMargin: 70,
      fadeInMax: 0.22,
      fadeOutDur: 0.18,
      titleSuffix: "youtube",
      wordsPerLine: 7,
    };
  }

  if (format === "shorts") {
    return {
      width: 1080,
      height: 1920,
      fps: 30,
      panelPause: 0.12,
      minPanelDuration: 1.2,
      zoomBase: "fast",
      subtitleFontSize: 48,
      subtitleBottomMargin: 120,
      fadeInMax: 0.18,
      fadeOutDur: 0.14,
      titleSuffix: "shorts",
      wordsPerLine: 4,
    };
  }

  return {
    width: 1080,
    height: 1920,
    fps: 30,
    panelPause: 0.12,
    minPanelDuration: 1.2,
    zoomBase: "fast",
    subtitleFontSize: 48,
    subtitleBottomMargin: 120,
    fadeInMax: 0.18,
    fadeOutDur: 0.14,
    titleSuffix: "tiktok",
    wordsPerLine: 4,
  };
}

function buildAnimationFilter({
  width,
  height,
  duration,
  fps,
  style = "auto",
  caption = "",
  imagePrompt = "",
  panelIndex = 0,
  format = "tiktok",
}) {
  const totalFrames = Math.max(Math.round(duration * fps), 1);
  const mood = style === "auto" ? inferPanelMood(caption, imagePrompt) : style;
  const profile = getFormatProfile(format);

  const parts =
    format === "youtube"
      ? [
          `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
          `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
        ]
      : [
          `scale=${width}:${height}:force_original_aspect_ratio=increase`,
          `crop=${width}:${height}`,
        ];

  const isWide = width > height;
  const isSlowBase = profile.zoomBase === "slow";

  let zoomExpr = isSlowBase
    ? "min(zoom+0.00035,1.04)"
    : "min(zoom+0.0008,1.08)";
  let xExpr = "iw/2-(iw/zoom/2)";
  let yExpr = "ih/2-(ih/zoom/2)";
  let addShake = false;
  let addFlash = false;

  if (mood === "environment") {
    zoomExpr = isSlowBase
      ? "min(zoom+0.00022,1.025)"
      : "min(zoom+0.00045,1.05)";
    xExpr = isWide
      ? `iw/2-(iw/zoom/2)+sin(on/40)*14`
      : `iw/2-(iw/zoom/2)+sin(on/28)*18`;
    yExpr = isWide
      ? `ih/2-(ih/zoom/2)+cos(on/46)*8`
      : `ih/2-(ih/zoom/2)+cos(on/36)*10`;
  } else if (mood === "dialogue") {
    zoomExpr = isSlowBase
      ? "min(zoom+0.00032,1.04)"
      : "min(zoom+0.00075,1.08)";
    xExpr =
      panelIndex % 2 === 0
        ? `iw/2-(iw/zoom/2)+on*${isSlowBase ? "0.08" : "0.15"}`
        : `iw/2-(iw/zoom/2)-on*${isSlowBase ? "0.08" : "0.15"}`;
    yExpr = "ih/2-(ih/zoom/2)";
  } else if (mood === "emotional") {
    zoomExpr = isSlowBase
      ? "min(zoom+0.00045,1.06)"
      : "min(zoom+0.00115,1.14)";
    xExpr = "iw/2-(iw/zoom/2)";
    yExpr = isWide ? "ih/2-(ih/zoom/2)-4" : "ih/2-(ih/zoom/2)-6";
  } else if (mood === "action") {
    zoomExpr = isSlowBase
      ? "min(zoom+0.0006,1.08)"
      : "min(zoom+0.0015,1.16)";
    xExpr = isWide
      ? `iw/2-(iw/zoom/2)+sin(on/4.1)*7`
      : `iw/2-(iw/zoom/2)+sin(on/2.6)*10`;
    yExpr = isWide
      ? `ih/2-(ih/zoom/2)+sin(on/4.6)*4`
      : `ih/2-(ih/zoom/2)+sin(on/3.1)*6`;
    addShake = !isSlowBase;
    addFlash = true;
  }

  parts.push(
    `zoompan=z='${zoomExpr}':d=${totalFrames}:x='${xExpr}':y='${yExpr}':s=${width}x${height}:fps=${fps}`
  );

  if (addShake) {
    parts.push(`eq=brightness='if(lt(mod(t,0.12),0.06),0.015,0)'`);
  }

  if (addFlash) {
    parts.push(
      `drawbox=x=0:y=0:w=iw:h=ih:color=white@0.0:t=fill:enable='between(t,${Math.max(
        duration - 0.22,
        0
      )},${Math.max(duration - 0.12, 0)})'`
    );
  }

  const fadeIn = Math.min(profile.fadeInMax, duration * 0.16);
  const fadeOutStart = Math.max(duration - profile.fadeOutDur, 0);

  parts.push(`fade=t=in:st=0:d=${fadeIn}`);
  parts.push(`fade=t=out:st=${fadeOutStart}:d=${profile.fadeOutDur}`);

  return { vfParts: parts, mood };
}

function splitCaptionIntoLines(text = "", wordsPerLine = 4, maxLines = 3) {
  const words = cleanText(text).split(" ").filter(Boolean);
  if (!words.length) return [];

  const lines = [];
  for (let i = 0; i < words.length; i += wordsPerLine) {
    lines.push(words.slice(i, i + wordsPerLine).join(" "));
    if (lines.length >= maxLines) {
      const remaining = words.slice(i + wordsPerLine);
      if (remaining.length) {
        lines[lines.length - 1] += ` ${remaining.join(" ")}`;
      }
      break;
    }
  }

  return lines;
}

function buildTextFilter(textPath, mood, format = "tiktok") {
  const profile = getFormatProfile(format);
  const escapedTextPath = escapePathForFFmpeg(textPath);

  let fontsize = profile.subtitleFontSize;
  let boxColor = "black@0.55";
  let boxBorder = format === "youtube" ? 18 : 24;

  if (mood === "emotional") {
    fontsize += 2;
    boxColor = "black@0.45";
  } else if (mood === "action") {
    fontsize += 2;
    boxColor = "black@0.60";
  }

  return [
    `drawtext=textfile='${escapedTextPath}'`,
    `fontcolor=white`,
    `fontsize=${fontsize}`,
    `line_spacing=10`,
    `x=(w-text_w)/2`,
    `y=h-text_h-${profile.subtitleBottomMargin}`,
    `box=1`,
    `boxcolor=${boxColor}`,
    `boxborderw=${boxBorder}`,
    `fix_bounds=true`
  ].join(":");
}

async function generateVoiceForPanel(text) {
  const voiceRes = await fetch("http://localhost:8000/generate-voice", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!voiceRes.ok) {
    throw new Error("Error generando voz por panel en FastAPI");
  }

  const data = await voiceRes.json();

  if (!data.audio_url) {
    throw new Error("FastAPI no devolvió audio_url para panel");
  }

  return data.audio_url;
}

function concatMediaFiles(ffmpegPath, inputPaths, outputPath, mode = "video") {
  const listFile = path.join(path.dirname(outputPath), `concat_${mode}_${Date.now()}.txt`);

  fs.writeFileSync(
    listFile,
    inputPaths.map((file) => `file '${file.replace(/\\/g, "/")}'`).join("\n"),
    "utf8"
  );

  const args =
    mode === "audio"
      ? [
          "-y",
          "-f", "concat",
          "-safe", "0",
          "-i", listFile,
          "-ar", "24000",
          "-ac", "1",
          "-c:a", "mp3",
          outputPath,
        ]
      : [
          "-y",
          "-f", "concat",
          "-safe", "0",
          "-i", listFile,
          "-c", "copy",
          outputPath,
        ];

  const result = spawnSync(ffmpegPath, args, {
    encoding: "utf8",
    shell: false,
  });

  if (result.error) {
    throw new Error(`No se pudo ejecutar ffmpeg para unir ${mode}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`ffmpeg falló uniendo ${mode}: ${result.stderr || "sin stderr"}`);
  }
}

function createSilenceAudio(ffmpegPath, outputPath, duration = 0.12) {
  const result = spawnSync(
    ffmpegPath,
    [
      "-y",
      "-f", "lavfi",
      "-i", "anullsrc=r=24000:cl=mono",
      "-t", String(duration),
      "-q:a", "9",
      "-acodec", "mp3",
      outputPath,
    ],
    {
      encoding: "utf8",
      shell: false,
    }
  );

  if (result.error) {
    throw new Error(`No se pudo crear silencio: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`ffmpeg falló creando silencio: ${result.stderr || "sin stderr"}`);
  }
}

function reencodeClipForConcat(ffmpegPath, inputPath, outputPath, fps) {
  const result = spawnSync(
    ffmpegPath,
    [
      "-y",
      "-i", inputPath,
      "-r", String(fps),
      "-c:v", "libx264",
      "-preset", "medium",
      "-pix_fmt", "yuv420p",
      "-an",
      outputPath,
    ],
    {
      encoding: "utf8",
      shell: false,
    }
  );

  if (result.error) {
    throw new Error(`No se pudo re-encodear clip: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`Error re-encodeando clip: ${result.stderr || "sin stderr"}`);
  }
}

function normalizeFormats(formats) {
  const valid = new Set(["tiktok", "shorts", "youtube"]);
  const arr = Array.isArray(formats) ? formats : [formats].filter(Boolean);

  const normalized = arr
    .map((f) => String(f || "").toLowerCase().trim())
    .filter((f) => valid.has(f));

  return normalized.length ? [...new Set(normalized)] : ["tiktok"];
}

function buildHookText(title, originalCaption, panelIndex) {
  const caption = cleanText(originalCaption);

  if (panelIndex !== 1) return caption;

  if (!caption) {
    return `Nadie estaba listo para lo que ocurriría en ${title}.`;
  }

  if (caption.length <= 65) return caption;

  const shorter = caption.split(/[.!?]/).find(Boolean)?.trim();
  if (shorter && shorter.length >= 8) {
    return shorter;
  }

  return caption.slice(0, 65).trim() + "...";
}

async function buildSharedPanelAssets(tempDir, ffmpegPath, panelData, usePanelVoices) {
  const sharedPanels = [];

  for (let i = 0; i < panelData.length; i++) {
    const panel = panelData[i];
    const { index, imageUrl, caption } = panel;

    const imagePath = path.join(tempDir, `shared_img_${index}.png`);
    await downloadFile(imageUrl, imagePath);

    let voicePath = "";
    let realAudioDuration = 0;

    if (usePanelVoices && caption) {
      const panelAudioUrl = await generateVoiceForPanel(caption);
      voicePath = path.join(tempDir, `shared_voice_${index}.mp3`);

      console.log("🎤 Descargando voz panel:", index, panelAudioUrl);
      await downloadFile(panelAudioUrl, voicePath);

      realAudioDuration = getAudioDuration(ffmpegPath, voicePath);
    }

    sharedPanels.push({
      ...panel,
      imagePath,
      voicePath,
      realAudioDuration,
    });
  }

  return sharedPanels;
}

async function generateSingleFormatVideo({
  tempDir,
  ffmpegPath,
  title,
  sharedPanels,
  format,
  animationStyle = "auto",
  usePanelVoices = true,
}) {
  const profile = getFormatProfile(format);
  const { width, height, fps, panelPause, minPanelDuration } = profile;

  const formatDir = path.join(tempDir, format);
  fs.mkdirSync(formatDir, { recursive: true });

  const normalizedClipPaths = [];
  const audioSegmentPaths = [];

  for (let i = 0; i < sharedPanels.length; i++) {
    const panel = sharedPanels[i];
    const index = panel.index;

    const rawClipPath = path.join(formatDir, `clip_raw_${index}.mp4`);
    const finalClipPath = path.join(formatDir, `clip_final_${index}.mp4`);
    const textPath = path.join(formatDir, `caption_${index}.txt`);
    const captionForVideo = buildHookText(title, panel.caption, index);

    let duration = format === "youtube" ? 2.4 : 1.8;

    if (usePanelVoices && panel.voicePath) {
      duration = panel.realAudioDuration + panelPause;

      if (duration < minPanelDuration) {
        duration = minPanelDuration;
      }

      audioSegmentPaths.push(panel.voicePath);

      if (panelPause > 0) {
        const pauseAudioPath = path.join(formatDir, `pause_${index}.mp3`);
        createSilenceAudio(ffmpegPath, pauseAudioPath, panelPause);
        audioSegmentPaths.push(pauseAudioPath);
      }
    } else {
      const fallbackChars = Math.max(captionForVideo.length, 12);
      const estimated = fallbackChars / (format === "youtube" ? 13 : 16);
      duration = Math.max(estimated, minPanelDuration);
    }

    const { vfParts, mood } = buildAnimationFilter({
      width,
      height,
      duration,
      fps,
      style: animationStyle,
      caption: captionForVideo,
      imagePrompt: panel.imagePrompt,
      panelIndex: index,
      format,
    });

    if (captionForVideo) {
      const maxLines = format === "youtube" ? 2 : 3;
      const lines = splitCaptionIntoLines(
        normalizeCaptionForFile(captionForVideo),
        profile.wordsPerLine,
        maxLines
      );

      fs.writeFileSync(textPath, lines.join("\n"), "utf8");

      const textFilter = buildTextFilter(textPath, mood, format);
      if (textFilter) vfParts.push(textFilter);
    }

    const vf = vfParts.join(",");

    const result = spawnSync(
      ffmpegPath,
      [
        "-y",
        "-loop", "1",
        "-i", panel.imagePath,
        "-vf", vf,
        "-t", String(duration),
        "-r", String(fps),
        "-pix_fmt", "yuv420p",
        "-c:v", "libx264",
        "-preset", "medium",
        "-an",
        rawClipPath,
      ],
      {
        encoding: "utf8",
        shell: false,
      }
    );

    if (result.error) {
      throw new Error(
        `No se pudo ejecutar ffmpeg para ${format} en panel ${index}: ${result.error.message}`
      );
    }

    if (result.status !== 0) {
      throw new Error(
        `ffmpeg falló creando clip ${index} (${format}): ${result.stderr || "sin stderr"}`
      );
    }

    reencodeClipForConcat(ffmpegPath, rawClipPath, finalClipPath, fps);
    normalizedClipPaths.push(finalClipPath);
  }

  if (!normalizedClipPaths.length) {
    throw new Error(`No se pudieron crear clips para formato ${format}`);
  }

  const finalVideoPath = path.join(formatDir, `final_${format}.mp4`);
  concatMediaFiles(ffmpegPath, normalizedClipPaths, finalVideoPath, "video");

  let outputToUpload = finalVideoPath;
  let finalAudioPath = "";
  const finalVideoWithAudioPath = path.join(formatDir, `final_${format}_with_audio.mp4`);

  if (audioSegmentPaths.length > 0) {
    finalAudioPath = path.join(formatDir, `final_${format}_voice.mp3`);
    concatMediaFiles(ffmpegPath, audioSegmentPaths, finalAudioPath, "audio");

    const mergeResult = spawnSync(
      ffmpegPath,
      [
        "-y",
        "-i", finalVideoPath,
        "-i", finalAudioPath,
        "-c:v", "copy",
        "-c:a", "aac",
        "-ar", "24000",
        "-ac", "1",
        "-af", "aresample=async=1:first_pts=0",
        "-shortest",
        finalVideoWithAudioPath,
      ],
      {
        encoding: "utf8",
        shell: false,
      }
    );

    if (mergeResult.error) {
      throw new Error(
        `No se pudo mezclar audio final (${format}): ${mergeResult.error.message}`
      );
    }

    if (mergeResult.status !== 0) {
      throw new Error(
        `Error mezclando audio final (${format}): ${mergeResult.stderr || "sin stderr"}`
      );
    }

    outputToUpload = finalVideoWithAudioPath;
  }

  const safeTitle = String(title || "manga")
    .replace(/[^\w\s-]+/g, "")
    .replace(/\s+/g, "_")
    .toLowerCase();

  const uploadRes = await cloudinary.uploader.upload(outputToUpload, {
    resource_type: "video",
    folder: "manga_videos",
    public_id: `${safeTitle}_${profile.titleSuffix}_${Date.now()}`,
  });

  return {
    format,
    width,
    height,
    panelPause,
    videoUrl: uploadRes.secure_url,
    usedPanelVoices: audioSegmentPaths.length > 0,
    panelCount: sharedPanels.length,
    audioSegmentCount: audioSegmentPaths.length,
  };
}

export async function POST(req) {
  try {
    const {
      title,
      pages = [],
      formats = ["tiktok"],
      animationStyle = "auto",
      usePanelVoices = true,
    } = await req.json();

    if (!pages.length) {
      return NextResponse.json(
        { error: "No hay páginas para generar video" },
        { status: 400 }
      );
    }

    const targetFormats = normalizeFormats(formats);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "manga-video-"));
    const ffmpegPath = getFfmpegPath();

    const panelData = [];
    let globalIndex = 0;

    for (const page of pages) {
      const panels = Array.isArray(page.panels) ? page.panels : [];

      for (const panel of panels) {
        const imageUrl = panel.image || panel.imageUrl || "";
        if (!imageUrl) continue;

        globalIndex++;

        panelData.push({
          index: globalIndex,
          imageUrl,
          caption: cleanText(panel.dialogue || ""),
          imagePrompt: cleanText(panel.imagePrompt || ""),
        });
      }
    }

    if (!panelData.length) {
      return NextResponse.json(
        { error: "No hay paneles con imagen para generar video" },
        { status: 400 }
      );
    }

    const sharedPanels = await buildSharedPanelAssets(
      tempDir,
      ffmpegPath,
      panelData,
      usePanelVoices
    );

    const generatedVideos = [];

    for (const format of targetFormats) {
      console.log("🎬 Generando formato:", format);

      const result = await generateSingleFormatVideo({
        tempDir,
        ffmpegPath,
        title,
        sharedPanels,
        format,
        animationStyle,
        usePanelVoices,
      });

      generatedVideos.push(result);
    }

    return NextResponse.json({
      ok: true,
      title,
      panelCount: panelData.length,
      formatsGenerated: targetFormats,
      videos: generatedVideos,
    });
  } catch (err) {
    console.error("ERROR GENERATE VIDEO:", err);

    return NextResponse.json(
      { error: err.message || "Error generando video" },
      { status: 500 }
    );
  }
}
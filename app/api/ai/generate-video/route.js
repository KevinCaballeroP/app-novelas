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

      fs.writeFileSync(
        outputPath,
        Buffer.from(arrayBuffer)
      );

      return;
    } catch (error) {
      lastError = error;

      console.error(
        `❌ Intento ${attempt} falló descargando archivo:`,
        url,
        error.message
      );
    }
  }

  throw new Error(
    `No se pudo descargar archivo después de 3 intentos: ${url}. ${
      lastError?.message || ""
    }`
  );
}

function cleanText(text = "") {
  return String(text)
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapePathForFFmpeg(filePath) {
  return filePath
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:");
}

function normalizeCaptionForFile(text = "") {
  return String(text)
    .replace(/\r/g, "")
    .replace(/[""]/g, '"')
    .replace(/[''´`]/g, "'")
    .replace(/\\/g, "")
    .replace(/%/g, " por ciento ")
    .replace(/—/g, "-")
    .replace(/–/g, "-")
    .replace(/…/g, "...")
    .replace(
      /[^\x00-\x7FáéíóúÁÉÍÓÚñÑüÜ¿¡.,;:!?'"()\- ]/g,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

function getAudioDuration(ffmpegPath, audioPath) {
  const ffprobePath = getFfprobePath(ffmpegPath);

  const result = spawnSync(
    ffprobePath,
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      audioPath,
    ],
    {
      encoding: "utf8",
      shell: false,
    }
  );

  if (result.error) {
    throw new Error(
      `No se pudo ejecutar ffprobe: ${result.error.message}`
    );
  }

  if (result.status !== 0) {
    throw new Error(
      `No se pudo obtener duración del audio: ${
        result.stderr || "sin stderr"
      }`
    );
  }

  return parseFloat(result.stdout.trim());
}

function getVideoDuration(ffmpegPath, videoPath) {
  const ffprobePath = getFfprobePath(ffmpegPath);

  const result = spawnSync(
    ffprobePath,
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      videoPath,
    ],
    {
      encoding: "utf8",
      shell: false,
    }
  );

  if (result.error) {
    throw new Error(
      `No se pudo ejecutar ffprobe (video): ${result.error.message}`
    );
  }

  if (result.status !== 0) {
    throw new Error(
      `No se pudo obtener duración del video: ${
        result.stderr || "sin stderr"
      }`
    );
  }

  const parsed = parseFloat(result.stdout.trim());

  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Comprime el video final cuando supera el límite seguro
 * de Cloudinary.
 *
 * Mantiene:
 * - resolución original
 * - FPS
 * - H.264
 * - audio AAC
 *
 * Solamente reduce el peso mediante CRF/bitrate.
 */
function compressVideoForUpload(
  ffmpegPath,
  inputPath,
  outputPath
) {
  console.log("🗜️ Comprimiendo video para Cloudinary...");

  const result = spawnSync(
    ffmpegPath,
    [
      "-y",

      "-i",
      inputPath,

      "-c:v",
      "libx264",

      "-preset",
      "medium",

      "-crf",
      "24",

      "-maxrate",
      "6M",

      "-bufsize",
      "12M",

      "-pix_fmt",
      "yuv420p",

      "-c:a",
      "aac",

      "-b:a",
      "128k",

      "-movflags",
      "+faststart",

      outputPath,
    ],
    {
      encoding: "utf8",
      shell: false,
    }
  );

  if (result.error) {
    throw new Error(
      `No se pudo comprimir el video: ${result.error.message}`
    );
  }

  if (result.status !== 0) {
    throw new Error(
      `FFmpeg falló comprimiendo video: ${
        result.stderr || "sin stderr"
      }`
    );
  }

  console.log("✅ Compresión terminada");
}

function inferPanelMood(
  caption = "",
  imagePrompt = ""
) {
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

function resolvePanelMood(
  panel = {},
  fallback = "auto"
) {
  const motion = String(
    panel?.animation?.motion || ""
  ).toLowerCase();

  if (
    motion === "action" ||
    motion === "burst"
  ) {
    return "action";
  }

  if (motion === "environment_drift") {
    return "environment";
  }

  if (motion === "tension") {
    return "emotional";
  }

  if (motion === "dialogue") {
    return "dialogue";
  }

  return fallback;
}

function applyCameraPreset(
  baseMood,
  camera = "auto"
) {
  const c = String(camera || "auto").toLowerCase();

  if (c === "impact_zoom") return "action";
  if (c === "fast_zoom") return "action";
  if (c === "vertical_pan") return "environment";
  if (c === "side_pan") return "dialogue";
  if (c === "orbit_feel") return "emotional";
  if (c === "slow_push") return "dialogue";

  return baseMood;
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
  isVideoSource = false,
}) {
  const totalFrames = Math.max(
    Math.round(duration * fps),
    1
  );

  const mood =
    style === "auto"
      ? inferPanelMood(
          caption,
          imagePrompt
        )
      : style;

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
  const isSlowBase =
    profile.zoomBase === "slow";

  let zoomExpr = isSlowBase
    ? "min(zoom+0.00020,1.025)"
    : "min(zoom+0.00040,1.05)";

  let xExpr =
    "iw/2-(iw/zoom/2)";

  let yExpr =
    "ih/2-(ih/zoom/2)";

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
        ? `iw/2-(iw/zoom/2)+on*${
            isSlowBase
              ? "0.04"
              : "0.08"
          }`
        : `iw/2-(iw/zoom/2)-on*${
            isSlowBase
              ? "0.04"
              : "0.08"
          }`;

    yExpr =
      "ih/2-(ih/zoom/2)";
  } else if (mood === "emotional") {
    zoomExpr = isSlowBase
      ? "min(zoom+0.00028,1.04)"
      : "min(zoom+0.00055,1.08)";

    xExpr =
      "iw/2-(iw/zoom/2)";

    yExpr = isWide
      ? "ih/2-(ih/zoom/2)-4"
      : "ih/2-(ih/zoom/2)-6";
  } else if (mood === "action") {
    zoomExpr = isSlowBase
      ? "min(zoom+0.00045,1.06)"
      : "min(zoom+0.00090,1.10)";

    xExpr = isWide
      ? `iw/2-(iw/zoom/2)+sin(on/6.0)*4`
      : `iw/2-(iw/zoom/2)+sin(on/4.2)*6`;

    yExpr = isWide
      ? `ih/2-(ih/zoom/2)+sin(on/6.8)*2`
      : `ih/2-(ih/zoom/2)+sin(on/5.0)*3`;

    addShake =
      !isSlowBase &&
      duration > 1.2;

    addFlash =
      duration > 1.0;
  }

  if (!isVideoSource) {
    parts.push(
      `zoompan=z='${zoomExpr}':d=${totalFrames}:x='${xExpr}':y='${yExpr}':s=${width}x${height}:fps=${fps}`
    );
  }

  if (addShake) {
    parts.push(
      `eq=brightness='if(lt(mod(t,0.18),0.05),0.008,0)'`
    );
  }

  if (addFlash) {
    parts.push(
      `drawbox=x=0:y=0:w=iw:h=ih:color=white@0.0:t=fill:enable='between(t,${Math.max(
        duration - 0.22,
        0
      )},${Math.max(
        duration - 0.12,
        0
      )})'`
    );
  }

  const fadeIn = Math.min(
    profile.fadeInMax,
    duration * 0.16
  );

  const fadeOutStart = Math.max(
    duration -
      profile.fadeOutDur,
    0
  );

  parts.push(
    `fade=t=in:st=0:d=${fadeIn}`
  );

  parts.push(
    `fade=t=out:st=${fadeOutStart}:d=${profile.fadeOutDur}`
  );

  return {
    vfParts: parts,
    mood,
  };
}

function splitCaptionIntoLines(
  text = "",
  wordsPerLine = 4,
  maxLines = 3
) {
  const words = cleanText(text)
    .split(" ")
    .filter(Boolean);

  if (!words.length) {
    return [];
  }

  const lines = [];

  for (
    let i = 0;
    i < words.length;
    i += wordsPerLine
  ) {
    lines.push(
      words
        .slice(
          i,
          i + wordsPerLine
        )
        .join(" ")
    );

    if (lines.length >= maxLines) {
      break;
    }
  }

  return lines;
}

function getSubtitleFontPath() {
  return (
    process.env.SUBTITLE_FONT_PATH ||
    "C:/Windows/Fonts/arial.ttf"
  );
}

function buildTextFilter(
  textPath,
  mood,
  format = "tiktok"
) {
  const profile =
    getFormatProfile(format);

  const escapedTextPath =
    escapePathForFFmpeg(textPath);

  const fontPath =
    escapePathForFFmpeg(
      getSubtitleFontPath()
    );

  console.log(
    "SUBTITLE FONT:",
    getSubtitleFontPath()
  );

  let fontsize =
    profile.subtitleFontSize;

  let boxColor =
    "black@0.55";

  let boxBorder =
    format === "youtube"
      ? 18
      : 24;

  if (mood === "emotional") {
    fontsize += 2;
    boxColor =
      "black@0.45";
  } else if (
    mood === "action"
  ) {
    fontsize += 2;
    boxColor =
      "black@0.60";
  }

  return [
    `drawtext=fontfile='${fontPath}':textfile='${escapedTextPath}'`,
    `fontcolor=white`,
    `fontsize=${fontsize}`,
    `line_spacing=10`,
    `x=(w-text_w)/2`,
    `y=h-text_h-${profile.subtitleBottomMargin}`,
    `box=1`,
    `boxcolor=${boxColor}`,
    `boxborderw=${boxBorder}`,
    `fix_bounds=true`,
  ].join(":");
}

async function generateVoiceForPanel(
  text
) {
  const voiceRes = await fetch(
    "http://localhost:8000/generate-voice",
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      body: JSON.stringify({
        text,
      }),
    }
  );

  if (!voiceRes.ok) {
    throw new Error(
      "Error generando voz por panel en FastAPI"
    );
  }

  const data =
    await voiceRes.json();

  if (!data.audio_url) {
    throw new Error(
      "FastAPI no devolvió audio_url para panel"
    );
  }

  return data.audio_url;
}

function concatMediaFiles(
  ffmpegPath,
  inputPaths,
  outputPath,
  mode = "video"
) {
  const listFile = path.join(
    path.dirname(outputPath),
    `concat_${mode}_${Date.now()}.txt`
  );

  fs.writeFileSync(
    listFile,

    inputPaths
      .map(
        (file) =>
          `file '${file.replace(
            /\\/g,
            "/"
          )}'`
      )
      .join("\n"),

    "utf8"
  );

  const args =
    mode === "audio"
      ? [
          "-y",

          "-f",
          "concat",

          "-safe",
          "0",

          "-i",
          listFile,

          "-ar",
          "24000",

          "-ac",
          "1",

          "-c:a",
          "mp3",

          outputPath,
        ]
      : [
          "-y",

          "-f",
          "concat",

          "-safe",
          "0",

          "-i",
          listFile,

          "-c",
          "copy",

          outputPath,
        ];

  const result = spawnSync(
    ffmpegPath,
    args,
    {
      encoding: "utf8",
      shell: false,
    }
  );

  if (result.error) {
    throw new Error(
      `No se pudo ejecutar ffmpeg para unir ${mode}: ${result.error.message}`
    );
  }

  if (result.status !== 0) {
    throw new Error(
      `ffmpeg falló uniendo ${mode}: ${
        result.stderr || "sin stderr"
      }`
    );
  }
}

function createSilenceAudio(
  ffmpegPath,
  outputPath,
  duration = 0.12
) {
  const result = spawnSync(
    ffmpegPath,
    [
      "-y",

      "-f",
      "lavfi",

      "-i",
      "anullsrc=r=24000:cl=mono",

      "-t",
      String(duration),

      "-q:a",
      "9",

      "-acodec",
      "mp3",

      outputPath,
    ],
    {
      encoding: "utf8",
      shell: false,
    }
  );

  if (result.error) {
    throw new Error(
      `No se pudo crear silencio: ${result.error.message}`
    );
  }

  if (result.status !== 0) {
    throw new Error(
      `ffmpeg falló creando silencio: ${
        result.stderr || "sin stderr"
      }`
    );
  }
}

function reencodeClipForConcat(
  ffmpegPath,
  inputPath,
  outputPath,
  fps
) {
  const result = spawnSync(
    ffmpegPath,
    [
      "-y",

      "-i",
      inputPath,

      "-r",
      String(fps),

      "-c:v",
      "libx264",

      "-preset",
      "medium",

      "-pix_fmt",
      "yuv420p",

      "-an",

      outputPath,
    ],
    {
      encoding: "utf8",
      shell: false,
    }
  );

  if (result.error) {
    throw new Error(
      `No se pudo re-encodear clip: ${result.error.message}`
    );
  }

  if (result.status !== 0) {
    throw new Error(
      `Error re-encodeando clip: ${
        result.stderr ||
        "sin stderr"
      }`
    );
  }
}


function createPingPongManualVideo(
  ffmpegPath,
  inputPath,
  outputPath,
  targetDuration,
  fps
) {
  const workDir = path.dirname(outputPath);

  const forwardPath = path.join(
    workDir,
    `pingpong_forward_${Date.now()}.mp4`
  );

  const reversePath = path.join(
    workDir,
    `pingpong_reverse_${Date.now()}.mp4`
  );

  const combinedPath = path.join(
    workDir,
    `pingpong_combined_${Date.now()}.mp4`
  );

  // Normalizamos primero el clip original para que forward y reverse
  // tengan exactamente el mismo codec/FPS/pixel format.
  let result = spawnSync(
    ffmpegPath,
    [
      "-y",
      "-i",
      inputPath,
      "-r",
      String(fps),
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-pix_fmt",
      "yuv420p",
      forwardPath,
    ],
    {
      encoding: "utf8",
      shell: false,
    }
  );

  if (result.error) {
    throw new Error(
      `No se pudo normalizar el clip para ping-pong: ${result.error.message}`
    );
  }

  if (result.status !== 0) {
    throw new Error(
      `FFmpeg falló normalizando clip para ping-pong: ${
        result.stderr || "sin stderr"
      }`
    );
  }

  // Creamos una copia completa en reversa.
  result = spawnSync(
    ffmpegPath,
    [
      "-y",
      "-i",
      forwardPath,
      "-vf",
      "reverse",
      "-an",
      "-r",
      String(fps),
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-pix_fmt",
      "yuv420p",
      reversePath,
    ],
    {
      encoding: "utf8",
      shell: false,
    }
  );

  if (result.error) {
    throw new Error(
      `No se pudo crear reversa del clip: ${result.error.message}`
    );
  }

  if (result.status !== 0) {
    throw new Error(
      `FFmpeg falló creando reversa del clip: ${
        result.stderr || "sin stderr"
      }`
    );
  }

  const forwardDuration =
    getVideoDuration(
      ffmpegPath,
      forwardPath
    );

  if (forwardDuration <= 0) {
    throw new Error(
      "No se pudo determinar la duración del clip ping-pong"
    );
  }

  // Alternamos adelante / reversa tantas veces como sea necesario.
  const segmentPaths = [];
  let accumulated = 0;
  let useForward = true;

  while (
    accumulated <
      targetDuration + 0.25
  ) {
    segmentPaths.push(
      useForward
        ? forwardPath
        : reversePath
    );

    accumulated +=
      forwardDuration;

    useForward =
      !useForward;
  }

  concatMediaFiles(
    ffmpegPath,
    segmentPaths,
    combinedPath,
    "video"
  );

  // Recortamos con precisión al tiempo que necesitamos.
  result = spawnSync(
    ffmpegPath,
    [
      "-y",
      "-i",
      combinedPath,
      "-t",
      String(targetDuration),
      "-an",
      "-r",
      String(fps),
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-pix_fmt",
      "yuv420p",
      outputPath,
    ],
    {
      encoding: "utf8",
      shell: false,
    }
  );

  if (result.error) {
    throw new Error(
      `No se pudo recortar el clip ping-pong: ${result.error.message}`
    );
  }

  if (result.status !== 0) {
    throw new Error(
      `FFmpeg falló recortando clip ping-pong: ${
        result.stderr || "sin stderr"
      }`
    );
  }

  console.log(
    `🔁 Ping-pong creado: ${targetDuration.toFixed(
      3
    )}s`
  );
}

function normalizeFormats(formats) {
  const valid =
    new Set([
      "tiktok",
      "shorts",
      "youtube",
    ]);

  const arr =
    Array.isArray(formats)
      ? formats
      : [formats].filter(Boolean);

  const normalized = arr
    .map((f) =>
      String(f || "")
        .toLowerCase()
        .trim()
    )
    .filter((f) =>
      valid.has(f)
    );

  return normalized.length
    ? [...new Set(normalized)]
    : ["tiktok"];
}

function buildHookText(
  title,
  originalCaption,
  panelIndex
) {
  const caption =
    cleanText(originalCaption);

  if (panelIndex !== 1) {
    return caption;
  }

  if (!caption) {
    return `Nadie estaba listo para lo que ocurriría en ${title}.`;
  }

  if (caption.length <= 65) {
    return caption;
  }

  const shorter = caption
    .split(/[.!?]/)
    .find(Boolean)
    ?.trim();

  if (
    shorter &&
    shorter.length >= 8
  ) {
    return shorter;
  }

  return `${caption
    .slice(0, 65)
    .trim()}...`;
}

function createVideoFromFrameSequence(
  ffmpegPath,
  framePaths,
  outputPath,
  fps = 16
) {
  const listFile = path.join(
    path.dirname(outputPath),
    `frames_${Date.now()}.txt`
  );

  fs.writeFileSync(
    listFile,

    framePaths
      .map(
        (file) =>
          `file '${file.replace(
            /\\/g,
            "/"
          )}'`
      )
      .join("\n"),

    "utf8"
  );

  const result = spawnSync(
    ffmpegPath,
    [
      "-y",

      "-r",
      String(fps),

      "-f",
      "concat",

      "-safe",
      "0",

      "-i",
      listFile,

      "-vf",
      `fps=${fps},format=yuv420p`,

      "-c:v",
      "libx264",

      "-preset",
      "medium",

      "-pix_fmt",
      "yuv420p",

      outputPath,
    ],
    {
      encoding: "utf8",
      shell: false,
    }
  );

  if (result.error) {
    throw new Error(
      `No se pudo crear video desde frames: ${result.error.message}`
    );
  }

  if (result.status !== 0) {
    throw new Error(
      `ffmpeg falló creando clip desde frames: ${
        result.stderr ||
        "sin stderr"
      }`
    );
  }
}

async function buildSharedPanelAssets(
  tempDir,
  ffmpegPath,
  panelData,
  usePanelVoices
) {
  const sharedPanels = [];

  for (
    let i = 0;
    i < panelData.length;
    i++
  ) {
    const panel =
      panelData[i];

    const {
      index,
      imageUrl,
      caption,
    } = panel;

    const imagePath =
      path.join(
        tempDir,
        `shared_img_${index}.png`
      );

    await downloadFile(
      imageUrl,
      imagePath
    );

    let manualVideoPath = "";

    if (
      panel.manualVideoUrl
    ) {
      manualVideoPath =
        path.join(
          tempDir,
          `shared_manual_video_${index}.mp4`
        );

      await downloadFile(
        panel.manualVideoUrl,
        manualVideoPath
      );
    }

    let voicePath = "";
    let realAudioDuration = 0;

    if (
      usePanelVoices &&
      caption
    ) {
      const panelAudioUrl =
        await generateVoiceForPanel(
          caption
        );

      voicePath =
        path.join(
          tempDir,
          `shared_voice_${index}.mp3`
        );

      console.log(
        "🎤 Descargando voz panel:",
        index,
        panelAudioUrl
      );

      await downloadFile(
        panelAudioUrl,
        voicePath
      );

      realAudioDuration =
        getAudioDuration(
          ffmpegPath,
          voicePath
        );
    }

    sharedPanels.push({
      ...panel,

      imagePath,
      manualVideoPath,
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
  const profile =
    getFormatProfile(format);

  const {
    width,
    height,
    fps,
    panelPause,
    minPanelDuration,
  } = profile;

  const VOICE_START_DELAY =
    0.55;

  const AFTER_MANUAL_VIDEO_PAUSE =
    0.35;

  const formatDir =
    path.join(
      tempDir,
      format
    );

  fs.mkdirSync(
    formatDir,
    {
      recursive: true,
    }
  );

  const normalizedClipPaths =
    [];

  const audioSegmentPaths =
    [];

  const ambientAudioSegmentPaths =
    [];

  let hasRealAmbientAudio =
    false;

  for (
    let i = 0;
    i < sharedPanels.length;
    i++
  ) {
    const panel =
      sharedPanels[i];

    const index =
      panel.index;

    const rawClipPath =
      path.join(
        formatDir,
        `clip_raw_${index}.mp4`
      );

    const finalClipPath =
      path.join(
        formatDir,
        `clip_final_${index}.mp4`
      );

    const textPath =
      path.join(
        formatDir,
        `caption_${index}.txt`
      );

    const captionForVideo =
      buildHookText(
        title,
        panel.caption,
        index
      );

    let duration =
      format === "youtube"
        ? 2.4
        : 1.8;

    const isManualVideo =
      !!panel.manualVideoPath;

    let manualVideoDuration =
      0;

    if (isManualVideo) {
      manualVideoDuration =
        getVideoDuration(
          ffmpegPath,
          panel.manualVideoPath
        );
    }

    const currentVoiceDelay =
      isManualVideo
        ? 0
        : VOICE_START_DELAY;

    console.log(
      `🎬 Panel ${index} — MANUAL VIDEO: ${isManualVideo}`
    );

    console.log(
      `🎬 Panel ${index} — VIDEO DURATION: ${manualVideoDuration}s`
    );

    console.log(
      `🎬 Panel ${index} — VOICE DELAY: ${currentVoiceDelay}s`
    );

    if (
      usePanelVoices &&
      panel.voicePath
    ) {
      duration =
        currentVoiceDelay +
        panel.realAudioDuration +
        panelPause;

      if (
        duration <
        minPanelDuration
      ) {
        duration =
          minPanelDuration;
      }

      if (
        currentVoiceDelay > 0
      ) {
        const preVoiceSilencePath =
          path.join(
            formatDir,
            `pre_voice_${index}.mp3`
          );

        createSilenceAudio(
          ffmpegPath,
          preVoiceSilencePath,
          currentVoiceDelay
        );

        audioSegmentPaths.push(
          preVoiceSilencePath
        );
      }

      audioSegmentPaths.push(
        panel.voicePath
      );

      if (panelPause > 0) {
        const pauseAudioPath =
          path.join(
            formatDir,
            `pause_${index}.mp3`
          );

        createSilenceAudio(
          ffmpegPath,
          pauseAudioPath,
          panelPause
        );

        audioSegmentPaths.push(
          pauseAudioPath
        );
      }
    } else {
      const fallbackChars =
        Math.max(
          captionForVideo.length,
          12
        );

      const estimated =
        fallbackChars /
        (format === "youtube"
          ? 13
          : 16);

      duration =
        Math.max(
          estimated,
          minPanelDuration
        );
    }

    const panelDuration =
      usePanelVoices &&
      panel.voicePath
        ? duration
        : Number(
            panel.animation
              ?.duration
          ) > 0
        ? Number(
            panel.animation
              .duration
          )
        : duration;

    const baseMood =
      resolvePanelMood(
        panel,

        animationStyle ===
          "auto"
          ? inferPanelMood(
              captionForVideo,
              panel.imagePrompt
            )
          : animationStyle
      );

    const finalMood =
      applyCameraPreset(
        baseMood,
        panel.animation
          ?.camera || "auto"
      );

    let sourceVisualPath =
      panel.manualVideoPath ||
      panel.imagePath;

    const motion =
      String(
        panel.animation
          ?.motion || ""
      ).toLowerCase();

    const camera =
      String(
        panel.animation
          ?.camera || ""
      ).toLowerCase();

    const isImportantMotion =
      motion === "action" ||
      motion === "burst" ||
      motion === "reveal" ||
      camera ===
        "impact_zoom" ||
      camera ===
        "fast_zoom";

    if (
      sourceVisualPath ===
        panel.imagePath &&
      Array.isArray(
        panel.generatedFrames
      ) &&
      panel.generatedFrames
        .length > 1 &&
      isImportantMotion
    ) {
      const frameDir =
        path.join(
          formatDir,
          `panel_${index}_frames`
        );

      fs.mkdirSync(
        frameDir,
        {
          recursive: true,
        }
      );

      const framePaths = [];

      for (
        let f = 0;
        f <
        panel.generatedFrames
          .length;
        f++
      ) {
        const framePath =
          path.join(
            frameDir,
            `frame_${String(
              f
            ).padStart(
              2,
              "0"
            )}.png`
          );

        fs.writeFileSync(
          framePath,

          Buffer.from(
            panel.generatedFrames[
              f
            ],
            "base64"
          )
        );

        framePaths.push(
          framePath
        );
      }

      const seqClipPath =
        path.join(
          frameDir,
          `sequence_${index}.mp4`
        );

      createVideoFromFrameSequence(
        ffmpegPath,
        framePaths,
        seqClipPath,
        16
      );

      sourceVisualPath =
        seqClipPath;
    }

    let resolvedPanelDuration =
      panelDuration;

    // Estrategia para videos manuales (Flow/Veo/Runway):
    // - Nunca reiniciar bruscamente desde el segundo 0.
    // - Si la voz supera el video por <= 3 s, ralentizar suavemente.
    // - Si la voz supera el video por > 3 s, usar movimiento ping-pong:
    //   adelante -> reversa -> adelante, hasta completar la narración.
    // - Siempre conservar la pequeña pausa final configurada.
    let manualVisualMode = "normal";
    let manualSlowFactor = 1;
    let manualFreezeDuration = 0;
    let manualPingPongTargetDuration = 0;

    if (
      isManualVideo &&
      manualVideoDuration > 0
    ) {
      const audioTotal =
        currentVoiceDelay +
        panel.realAudioDuration +
        panelPause;

      const baseVisualDuration =
        Math.max(
          manualVideoDuration,
          audioTotal
        );

      resolvedPanelDuration =
        baseVisualDuration +
        AFTER_MANUAL_VIDEO_PAUSE;

      const narrationOverflow =
        Math.max(
          audioTotal -
            manualVideoDuration,
          0
        );

      if (
        narrationOverflow > 0 &&
        narrationOverflow <= 3
      ) {
        manualVisualMode =
          "slow";

        manualSlowFactor =
          audioTotal /
          manualVideoDuration;

        // La pausa final se conserva congelando el último frame.
        manualFreezeDuration =
          AFTER_MANUAL_VIDEO_PAUSE;
      } else if (
        narrationOverflow > 3
      ) {
        manualVisualMode =
          "pingpong";

        // El clip ping-pong cubrirá toda la duración del audio.
        manualPingPongTargetDuration =
          audioTotal;

        // Solo congelamos la pequeña pausa final.
        manualFreezeDuration =
          AFTER_MANUAL_VIDEO_PAUSE;
      } else {
        // La voz cabe dentro del video:
        // reproducimos Flow una sola vez y congelamos solo la pausa final.
        manualVisualMode =
          "normal";

        manualFreezeDuration =
          AFTER_MANUAL_VIDEO_PAUSE;
      }

      console.log(
        `🎥 Panel ${index} — VISUAL MODE: ${manualVisualMode}`
      );

      if (
        manualVisualMode ===
        "slow"
      ) {
        console.log(
          `🎥 Panel ${index} — SLOW FACTOR: ${manualSlowFactor.toFixed(
            4
          )}x duration`
        );
      }

      console.log(
        `🎥 Panel ${index} — FINAL HOLD: ${manualFreezeDuration.toFixed(
          3
        )}s`
      );

      console.log(
        `🎥 Panel ${index} — AUDIO TOTAL: ${audioTotal.toFixed(
          3
        )}s`
      );

      console.log(
        `🎥 Panel ${index} — BASE VISUAL: ${baseVisualDuration.toFixed(
          3
        )}s`
      );

      const missingSilence =
        baseVisualDuration -
        audioTotal;

      console.log(
        `🎥 Panel ${index} — MISSING SILENCE: ${missingSilence.toFixed(
          3
        )}s`
      );

      if (
        missingSilence >
        0.05
      ) {
        const fillSilencePath =
          path.join(
            formatDir,
            `fill_manual_${index}.mp3`
          );

        createSilenceAudio(
          ffmpegPath,
          fillSilencePath,
          missingSilence
        );

        audioSegmentPaths.push(
          fillSilencePath
        );
      }

      const afterManualPausePath =
        path.join(
          formatDir,
          `after_manual_${index}.mp3`
        );

      createSilenceAudio(
        ffmpegPath,
        afterManualPausePath,
        AFTER_MANUAL_VIDEO_PAUSE
      );

      audioSegmentPaths.push(
        afterManualPausePath
      );

      console.log(
        `🎥 Panel ${index} — RESOLVED PANEL DURATION: ${resolvedPanelDuration.toFixed(
          3
        )}s`
      );

      const audioMode =
        panel.manualAudioMode ||
        "mute";

      console.log(
        `🎥 Panel ${index} — MANUAL AUDIO MODE: ${audioMode}`
      );

      if (
        audioMode ===
          "background" ||
        audioMode === "full"
      ) {
        const ambientVolume =
          audioMode ===
          "background"
            ? 0.2
            : 1.0;

        const ambientPath =
          path.join(
            formatDir,
            `ambient_${index}.mp3`
          );

        const ambientResult =
          spawnSync(
            ffmpegPath,
            [
              "-y",

              "-stream_loop",
              "-1",

              "-i",
              panel.manualVideoPath,

              "-t",
              String(
                resolvedPanelDuration
              ),

              "-vn",

              "-af",
              `volume=${ambientVolume}`,

              "-ar",
              "24000",

              "-ac",
              "1",

              ambientPath,
            ],
            {
              encoding: "utf8",
              shell: false,
            }
          );

        if (
          ambientResult.status ===
          0
        ) {
          ambientAudioSegmentPaths.push(
            ambientPath
          );

          hasRealAmbientAudio =
            true;

          console.log(
            `🎥 Panel ${index} — AMBIENT AUDIO: ${ambientPath} (vol ${ambientVolume})`
          );
        } else {
          const silPath =
            path.join(
              formatDir,
              `ambient_sil_${index}.mp3`
            );

          createSilenceAudio(
            ffmpegPath,
            silPath,
            resolvedPanelDuration
          );

          ambientAudioSegmentPaths.push(
            silPath
          );

          console.warn(
            `⚠️ Panel ${index} — ambient extraction failed, using silence`
          );
        }
      } else {
        const silPath =
          path.join(
            formatDir,
            `ambient_sil_${index}.mp3`
          );

        createSilenceAudio(
          ffmpegPath,
          silPath,
          resolvedPanelDuration
        );

        ambientAudioSegmentPaths.push(
          silPath
        );
      }
    } else {
      resolvedPanelDuration =
        panelDuration;

      const silPath =
        path.join(
          formatDir,
          `ambient_sil_${index}.mp3`
        );

      createSilenceAudio(
        ffmpegPath,
        silPath,
        resolvedPanelDuration
      );

      ambientAudioSegmentPaths.push(
        silPath
      );
    }

    if (
      isManualVideo &&
      manualVideoDuration > 0 &&
      manualVisualMode ===
        "pingpong" &&
      manualPingPongTargetDuration >
        0
    ) {
      const pingPongPath =
        path.join(
          formatDir,
          `manual_pingpong_${index}.mp4`
        );

      createPingPongManualVideo(
        ffmpegPath,
        panel.manualVideoPath,
        pingPongPath,
        manualPingPongTargetDuration,
        fps
      );

      sourceVisualPath =
        pingPongPath;

      console.log(
        `🔁 Panel ${index} — PING-PONG TARGET: ${manualPingPongTargetDuration.toFixed(
          3
        )}s`
      );
    }

    const isVideoSource =
      sourceVisualPath
        .toLowerCase()
        .endsWith(".mp4");

    const {
      vfParts,
      mood,
    } = buildAnimationFilter({
      width,
      height,
      duration:
        resolvedPanelDuration,
      fps,
      style: finalMood,
      caption:
        captionForVideo,
      imagePrompt:
        panel.imagePrompt,
      panelIndex:
        panel.panelIndex ??
        index,
      format,
      isVideoSource,
    });

    // Extensión visual para clips manuales.
    // - slow: estira ligeramente el tiempo con setpts.
    // - pingpong: el archivo ya llega extendido; solo añadimos la pausa final.
    // - normal: solo añadimos la pausa final.
    // Se inserta al inicio para que el fade final ocurra
    // sobre la duración extendida y no sobre el clip original.
    if (
      isManualVideo &&
      manualVideoDuration > 0
    ) {
      const extensionFilters =
        [];

      if (
        manualVisualMode ===
        "slow" &&
        manualSlowFactor > 1
      ) {
        extensionFilters.push(
          `setpts=${manualSlowFactor.toFixed(
            6
          )}*PTS`
        );
      }

      if (
        manualFreezeDuration >
        0.001
      ) {
        extensionFilters.push(
          `tpad=stop_mode=clone:stop_duration=${manualFreezeDuration.toFixed(
            3
          )}`
        );
      }

      if (
        extensionFilters.length
      ) {
        vfParts.unshift(
          ...extensionFilters
        );
      }
    }

    if (captionForVideo) {
      const maxLines =
        format === "youtube"
          ? 2
          : 3;

      const lines =
        splitCaptionIntoLines(
          normalizeCaptionForFile(
            captionForVideo
          ),

          profile.wordsPerLine,

          maxLines
        );

      fs.writeFileSync(
        textPath,
        lines.join("\n"),
        "utf8"
      );

      const textFilter =
        buildTextFilter(
          textPath,
          mood,
          format
        );

      if (textFilter) {
        vfParts.push(
          textFilter
        );
      }
    }

    const vf =
      vfParts.join(",");

    let ffmpegArgs;

    if (
      isManualVideo &&
      manualVideoDuration > 0
    ) {
      // IMPORTANTE:
      // No usamos -stream_loop para clips manuales.
      // El video se reproduce una sola vez y el filtro
      // setpts/tpad se encarga de cubrir toda la narración.
      ffmpegArgs = [
        "-y",

        "-i",
        sourceVisualPath,

        "-t",
        String(
          resolvedPanelDuration
        ),

        "-vf",
        vf,

        "-r",
        String(fps),

        "-pix_fmt",
        "yuv420p",

        "-c:v",
        "libx264",

        "-preset",
        "medium",

        "-an",

        rawClipPath,
      ];
    } else if (
      isVideoSource
    ) {
      ffmpegArgs = [
        "-y",

        "-stream_loop",
        "-1",

        "-i",
        sourceVisualPath,

        "-t",
        String(
          resolvedPanelDuration
        ),

        "-vf",
        vf,

        "-r",
        String(fps),

        "-pix_fmt",
        "yuv420p",

        "-c:v",
        "libx264",

        "-preset",
        "medium",

        "-an",

        rawClipPath,
      ];
    } else {
      ffmpegArgs = [
        "-y",

        "-loop",
        "1",

        "-i",
        sourceVisualPath,

        "-vf",
        vf,

        "-t",
        String(
          resolvedPanelDuration
        ),

        "-r",
        String(fps),

        "-pix_fmt",
        "yuv420p",

        "-c:v",
        "libx264",

        "-preset",
        "medium",

        "-an",

        rawClipPath,
      ];
    }

    const result =
      spawnSync(
        ffmpegPath,
        ffmpegArgs,
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

    if (
      result.status !== 0
    ) {
      throw new Error(
        `ffmpeg falló creando clip ${index} (${format}): ${
          result.stderr ||
          "sin stderr"
        }`
      );
    }

    reencodeClipForConcat(
      ffmpegPath,
      rawClipPath,
      finalClipPath,
      fps
    );

    normalizedClipPaths.push(
      finalClipPath
    );
  }

  if (
    !normalizedClipPaths.length
  ) {
    throw new Error(
      `No se pudieron crear clips para formato ${format}`
    );
  }

  const finalVideoPath =
    path.join(
      formatDir,
      `final_${format}.mp4`
    );

  concatMediaFiles(
    ffmpegPath,
    normalizedClipPaths,
    finalVideoPath,
    "video"
  );

  let outputToUpload =
    finalVideoPath;

  let finalAudioPath = "";

  const finalVideoWithAudioPath =
    path.join(
      formatDir,
      `final_${format}_with_audio.mp4`
    );

  if (
    audioSegmentPaths.length >
    0
  ) {
    finalAudioPath =
      path.join(
        formatDir,
        `final_${format}_voice.mp3`
      );

    concatMediaFiles(
      ffmpegPath,
      audioSegmentPaths,
      finalAudioPath,
      "audio"
    );

    if (
      hasRealAmbientAudio &&
      ambientAudioSegmentPaths.length >
        0
    ) {
      const finalAmbientPath =
        path.join(
          formatDir,
          `final_${format}_ambient.mp3`
        );

      concatMediaFiles(
        ffmpegPath,
        ambientAudioSegmentPaths,
        finalAmbientPath,
        "audio"
      );

      const mergeResult =
        spawnSync(
          ffmpegPath,
          [
            "-y",

            "-i",
            finalVideoPath,

            "-i",
            finalAudioPath,

            "-i",
            finalAmbientPath,

            "-filter_complex",
            "[1:a][2:a]amix=inputs=2:duration=first:dropout_transition=0[aout]",

            "-map",
            "0:v",

            "-map",
            "[aout]",

            "-c:v",
            "copy",

            "-c:a",
            "aac",

            "-ar",
            "24000",

            "-ac",
            "1",

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
          `No se pudo mezclar audio+ambient (${format}): ${mergeResult.error.message}`
        );
      }

      if (
        mergeResult.status !== 0
      ) {
        throw new Error(
          `Error amix audio+ambient (${format}): ${
            mergeResult.stderr ||
            "sin stderr"
          }`
        );
      }
    } else {
      const mergeResult =
        spawnSync(
          ffmpegPath,
          [
            "-y",

            "-i",
            finalVideoPath,

            "-i",
            finalAudioPath,

            "-c:v",
            "copy",

            "-c:a",
            "aac",

            "-ar",
            "24000",

            "-ac",
            "1",

            "-af",
            "aresample=async=1:first_pts=0",

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

      if (
        mergeResult.status !== 0
      ) {
        throw new Error(
          `Error mezclando audio final (${format}): ${
            mergeResult.stderr ||
            "sin stderr"
          }`
        );
      }
    }

    outputToUpload =
      finalVideoWithAudioPath;
  }

  const safeTitle = String(
    title || "manga"
  )
    .replace(
      /[^\w\s-]+/g,
      ""
    )
    .replace(
      /\s+/g,
      "_"
    )
    .toLowerCase();

  // ==========================================================
  // CONTROL DE TAMAÑO CLOUDINARY
  // ==========================================================

  let uploadFilePath =
    outputToUpload;

  let finalStats =
    fs.statSync(
      uploadFilePath
    );

  let finalSizeMB =
    finalStats.size /
    1024 /
    1024;

  const finalDuration =
    getVideoDuration(
      ffmpegPath,
      uploadFilePath
    );

  console.log(
    "══════════════════════════════════════"
  );

  console.log(
    "🎬 VIDEO FINAL:",
    uploadFilePath
  );

  console.log(
    "📦 TAMAÑO ORIGINAL:",
    finalSizeMB.toFixed(2),
    "MB"
  );

  console.log(
    "⏱️ DURACIÓN FINAL:",
    finalDuration.toFixed(2),
    "s"
  );

  console.log(
    "══════════════════════════════════════"
  );

  // Tu cuenta tiene máximo 100 MB.
  // Dejamos 5 MB de margen.
  const CLOUDINARY_SAFE_LIMIT_MB =
    95;

  if (
    finalSizeMB >
    CLOUDINARY_SAFE_LIMIT_MB
  ) {
    console.log(
      `⚠️ Video de ${finalSizeMB.toFixed(
        2
      )} MB supera el límite seguro de ${CLOUDINARY_SAFE_LIMIT_MB} MB`
    );

    const compressedPath =
      path.join(
        formatDir,
        `final_${format}_compressed.mp4`
      );

    compressVideoForUpload(
      ffmpegPath,
      uploadFilePath,
      compressedPath
    );

    uploadFilePath =
      compressedPath;

    finalStats =
      fs.statSync(
        uploadFilePath
      );

    finalSizeMB =
      finalStats.size /
      1024 /
      1024;

    console.log(
      "──────────────────────────────────────"
    );

    console.log(
      "🗜️ TAMAÑO COMPRIMIDO:",
      finalSizeMB.toFixed(2),
      "MB"
    );

    console.log(
      "──────────────────────────────────────"
    );
  }

  // Protección extra.
  if (finalSizeMB >= 100) {
    throw new Error(
      `El video sigue siendo demasiado grande después de comprimir: ${finalSizeMB.toFixed(
        2
      )} MB`
    );
  }

  // ==========================================================
  // CLOUDINARY UPLOAD
  // ==========================================================

  console.log(
    `☁️ Subiendo video (${finalSizeMB.toFixed(
      2
    )} MB) a Cloudinary...`
  );

  let uploadRes;

  try {
    uploadRes =
      await cloudinary.uploader.upload(
        uploadFilePath,
        {
          resource_type:
            "video",

          folder:
            "manga_videos",

          public_id:
            `${safeTitle}_${profile.titleSuffix}_${Date.now()}`,
        }
      );

    console.log(
      "✅ VIDEO SUBIDO:",
      uploadRes.secure_url
    );
  } catch (uploadError) {
    console.error(
      "════════ CLOUDINARY ERROR ════════"
    );

    console.error(
      "📦 Archivo:",
      uploadFilePath
    );

    console.error(
      "📦 Tamaño:",
      finalSizeMB.toFixed(2),
      "MB"
    );

    console.error(
      "⏱️ Duración:",
      finalDuration.toFixed(2),
      "s"
    );

    console.error(
      "❌ Message:",
      uploadError?.message
    );

    console.error(
      "❌ HTTP:",
      uploadError?.http_code
    );

    console.error(
      "❌ Name:",
      uploadError?.name
    );

    console.error(
      "══════════════════════════════════"
    );

    throw uploadError;
  }

  return {
    format,
    width,
    height,
    panelPause,

    videoUrl:
      uploadRes.secure_url,

    usedPanelVoices:
      audioSegmentPaths.length >
      0,

    panelCount:
      sharedPanels.length,

    audioSegmentCount:
      audioSegmentPaths.length,

    // Información útil para depurar
    uploadedSizeMB:
      Number(
        finalSizeMB.toFixed(2)
      ),

    durationSeconds:
      Number(
        finalDuration.toFixed(
          2
        )
      ),
  };
}

export async function POST(
  req
) {
  try {
    const {
      title,

      pages = [],

      formats = [
        "tiktok",
      ],

      animationStyle =
        "auto",

      usePanelVoices =
        true,
    } = await req.json();

    if (!pages.length) {
      return NextResponse.json(
        {
          error:
            "No hay páginas para generar video",
        },
        {
          status: 400,
        }
      );
    }

    const targetFormats =
      normalizeFormats(
        formats
      );

    const tempDir =
      fs.mkdtempSync(
        path.join(
          os.tmpdir(),
          "manga-video-"
        )
      );

    const ffmpegPath =
      getFfmpegPath();

    const panelData = [];

    let globalIndex = 0;

    for (const page of pages) {
      const panels =
        Array.isArray(
          page.panels
        )
          ? page.panels
          : [];

      for (
        const [
          i,
          panel,
        ] of panels.entries()
      ) {
        const imageUrl =
          panel.image ||
          panel.imageUrl ||
          "";

        if (!imageUrl) {
          continue;
        }

        globalIndex++;

        panelData.push({
          index:
            globalIndex,

          globalIndex,

          page:
            page.page,

          panelIndex:
            i,

          imageUrl,

          caption:
            cleanText(
              panel.dialogue ||
                ""
            ),

          imagePrompt:
            cleanText(
              panel.imagePrompt ||
                ""
            ),

          generatedFrames:
            Array.isArray(
              panel.generatedFrames
            )
              ? panel.generatedFrames
              : [],

          animation:
            panel.animation ||
            null,

          manualVideoUrl:
            panel.manualVideoUrl ||
            panel.flowVideoUrl ||
            "",

          manualAudioMode:
            panel.manualAudioMode ||
            "mute",
        });
      }
    }

    if (
      !panelData.length
    ) {
      return NextResponse.json(
        {
          error:
            "No hay paneles con imagen para generar video",
        },
        {
          status: 400,
        }
      );
    }

    const sharedPanels =
      await buildSharedPanelAssets(
        tempDir,
        ffmpegPath,
        panelData,
        usePanelVoices
      );

    const generatedVideos =
      [];

    for (
      const format of
      targetFormats
    ) {
      console.log(
        "🎬 Generando formato:",
        format
      );

      const result =
        await generateSingleFormatVideo(
          {
            tempDir,
            ffmpegPath,
            title,
            sharedPanels,
            format,
            animationStyle,
            usePanelVoices,
          }
        );

      generatedVideos.push(
        result
      );
    }

    return NextResponse.json({
      ok: true,

      title,

      panelCount:
        panelData.length,

      formatsGenerated:
        targetFormats,

      videos:
        generatedVideos,
    });
  } catch (err) {
    console.error(
      "ERROR GENERATE VIDEO:",
      err
    );

    return NextResponse.json(
      {
        error:
          err.message ||
          "Error generando video",
      },
      {
        status: 500,
      }
    );
  }
}
import { createServer } from "node:http";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { extname, join, normalize } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 3333);
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const ttsBaseUrl = process.env.TTS_BASE_URL || "http://127.0.0.1:5050/v1";
const model = process.env.OLLAMA_MODEL || "qwen2.5-voice-fast:0.5b";
const dockerBin = process.env.DOCKER_BIN || "/Applications/Docker.app/Contents/Resources/bin/docker";
const whisperContainer = process.env.WHISPER_CONTAINER || "open-webui-voice";
const execFileAsync = promisify(execFile);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

async function readBuffer(req, maxBytes = 12 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      throw new Error("録音が長すぎます。短く話してください。");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function audioExtension(contentType) {
  if (contentType.includes("mpeg") || contentType.includes("mp3")) return "mp3";
  if (contentType.includes("wav")) return "wav";
  if (contentType.includes("ogg")) return "ogg";
  return "webm";
}

async function handleChat(req, res) {
  const { messages } = await readJson(req);
  const cleanMessages = Array.isArray(messages)
    ? messages
        .filter((message) => message && typeof message.content === "string")
        .map((message) => ({
          role: message.role === "assistant" ? "assistant" : "user",
          content: message.content.slice(0, 1000),
        }))
    : [];

  if (!cleanMessages.length) {
    sendJson(res, 400, { error: "メッセージが空です。" });
    return;
  }

  const latestUserText = cleanMessages.at(-1)?.content.replace(/[!！?？。.\s]/g, "") || "";
  if (["こんにちは", "こんにちわ", "こんばんは", "おはよう", "やあ"].includes(latestUserText)) {
    sendJson(res, 200, { reply: latestUserText === "おはよう" ? "おはようございます。" : "こんにちは。" });
    return;
  }

  const response = await fetch(`${ollamaBaseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "あなたは日本語の短い音声対話アシスタントです。返答は24文字以内を目安に、原則一文だけで答えます。挨拶には挨拶だけ返します。",
        },
        ...cleanMessages.slice(-8),
      ],
      stream: false,
      options: {
        temperature: 0.2,
        top_p: 0.75,
        num_predict: 32,
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    sendJson(res, 502, { error: "Ollamaから返答を取得できません。", detail });
    return;
  }

  const data = await response.json();
  sendJson(res, 200, { reply: data.message?.content?.trim() || "すみません、返答できませんでした。" });
}

async function handleTranscribe(req, res) {
  const contentType = req.headers["content-type"] || "audio/webm";
  const extension = audioExtension(contentType);
  const audio = await readBuffer(req);
  if (!audio.length) {
    sendJson(res, 400, { error: "録音データが空です。" });
    return;
  }

  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const localDir = join(tmpdir(), "simple-voice-chat");
  const localPath = join(localDir, `${id}.${extension}`);
  const containerPath = `/tmp/simple-voice-chat-${id}.${extension}`;

  await mkdir(localDir, { recursive: true });
  await writeFile(localPath, audio);

  try {
    await execFileAsync(dockerBin, ["cp", localPath, `${whisperContainer}:${containerPath}`], {
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });

    const script = [
      "import json, sys",
      "from faster_whisper import WhisperModel",
      `path=${JSON.stringify(containerPath)}`,
      "model=WhisperModel('base', device='cpu', compute_type='int8')",
      "segments, info = model.transcribe(path, language='ja', vad_filter=True)",
      "text=''.join(segment.text for segment in segments).strip()",
      "print(json.dumps({'text': text}, ensure_ascii=False))",
    ].join("\n");

    const { stdout } = await execFileAsync(dockerBin, ["exec", whisperContainer, "python", "-c", script], {
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    });
    const line = stdout.trim().split("\n").at(-1) || "{}";
    const data = JSON.parse(line);
    sendJson(res, 200, { text: data.text || "" });
  } catch (error) {
    sendJson(res, 502, {
      error: "Whisper文字起こしに失敗しました。",
      detail: error.stderr || error.message,
    });
  } finally {
    await rm(localPath, { force: true });
    execFile(dockerBin, ["exec", whisperContainer, "rm", "-f", containerPath], () => {});
  }
}

async function handleSpeech(req, res) {
  const { text, voice } = await readJson(req);
  if (!text || typeof text !== "string") {
    sendJson(res, 400, { error: "読み上げるテキストが空です。" });
    return;
  }

  const response = await fetch(`${ttsBaseUrl}/audio/speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer not-needed",
    },
    body: JSON.stringify({
      model: "tts-1",
      voice: voice || "ja-JP-NanamiNeural",
      input: text.slice(0, 1000),
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    sendJson(res, 502, { error: "TTSから音声を取得できません。", detail });
    return;
  }

  const audio = Buffer.from(await response.arrayBuffer());
  res.writeHead(200, {
    "Content-Type": response.headers.get("content-type") || "audio/mpeg",
    "Cache-Control": "no-store",
  });
  res.end(audio);
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(__dirname, safePath);

  if (!filePath.startsWith(__dirname)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  try {
    const file = await readFile(filePath);
    res.writeHead(200, { "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream" });
    res.end(file);
  } catch {
    sendJson(res, 404, { error: "Not found" });
  }
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/api/health") {
      sendJson(res, 200, { ok: true, model, ollamaBaseUrl, ttsBaseUrl });
      return;
    }

    if (req.method === "POST" && req.url === "/api/chat") {
      await handleChat(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/transcribe") {
      await handleTranscribe(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/speech") {
      await handleSpeech(req, res);
      return;
    }

    if (req.method === "GET") {
      await serveStatic(req, res);
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Internal server error" });
  }
});

server.listen(port, host, () => {
  console.log(`Simple voice chat: http://${host}:${port}`);
  console.log(`Ollama model: ${model}`);
});

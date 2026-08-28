const messagesEl = document.querySelector("#messages");
const statusEl = document.querySelector("#status");
const micButton = document.querySelector("#micButton");
const textInput = document.querySelector("#textInput");
const composer = document.querySelector("#composer");

const messages = [];
let mediaRecorder = null;
let recordingStream = null;
let audioChunks = [];
let recordingTimer = null;
let busy = false;

function setStatus(text, className = "") {
  statusEl.textContent = text;
  statusEl.className = `status ${className}`.trim();
}

function addMessage(role, text) {
  const item = document.createElement("article");
  item.className = `message ${role}`;
  const bubble = document.createElement("span");
  bubble.textContent = text;
  item.append(bubble);
  messagesEl.append(item);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setBusy(nextBusy) {
  busy = nextBusy;
  textInput.disabled = nextBusy;
  composer.querySelector(".send-button").disabled = nextBusy;
  micButton.disabled = nextBusy && !micButton.classList.contains("recording");
}

async function speak(text) {
  const response = await fetch("/api/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error("音声の生成に失敗しました。");
  }

  const audioUrl = URL.createObjectURL(await response.blob());
  const audio = new Audio(audioUrl);
  audio.onended = () => URL.revokeObjectURL(audioUrl);
  await audio.play();
}

async function sendMessage(text) {
  const cleanText = text.trim();
  if (!cleanText || busy) return;

  setBusy(true);
  setStatus("考え中", "thinking");
  addMessage("user", cleanText);
  messages.push({ role: "user", content: cleanText });
  textInput.value = "";

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "返答の取得に失敗しました。");
    }

    const data = await response.json();
    const reply = data.reply || "すみません、返答できませんでした。";
    messages.push({ role: "assistant", content: reply });
    addMessage("assistant", reply);
    setStatus("読み上げ中", "thinking");
    await speak(reply);
    setStatus("待機中");
  } catch (error) {
    addMessage("assistant", error.message);
    setStatus("エラー");
  } finally {
    setBusy(false);
    textInput.focus();
  }
}

async function transcribeAudio(blob) {
  const response = await fetch("/api/transcribe", {
    method: "POST",
    headers: { "Content-Type": blob.type || "audio/webm" },
    body: blob,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "文字起こしに失敗しました。");
  }

  const data = await response.json();
  return data.text || "";
}

function stopRecordingStream() {
  recordingStream?.getTracks().forEach((track) => track.stop());
  recordingStream = null;
}

function clearRecordingTimer() {
  if (recordingTimer) {
    clearTimeout(recordingTimer);
    recordingTimer = null;
  }
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    micButton.disabled = true;
    micButton.title = "このブラウザは音声入力に対応していません";
    addMessage("assistant", "このブラウザでは録音が使えません。Chromeで開くか、文字入力を使ってください。");
    return;
  }

  recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "audio/webm";
  mediaRecorder = new MediaRecorder(recordingStream, { mimeType });
  audioChunks = [];

  mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) audioChunks.push(event.data);
  });

  mediaRecorder.addEventListener("stop", async () => {
    const blob = new Blob(audioChunks, { type: mimeType });
    audioChunks = [];
    clearRecordingTimer();
    stopRecordingStream();
    micButton.classList.remove("recording");

    try {
      setBusy(true);
      setStatus("文字起こし中", "thinking");
      const text = await transcribeAudio(blob);
      if (!text.trim()) {
        addMessage("assistant", "音声を聞き取れませんでした。もう一度お願いします。");
        setStatus("待機中");
        return;
      }
      setBusy(false);
      await sendMessage(text);
    } catch (error) {
      addMessage("assistant", error.message);
      setStatus("エラー");
    } finally {
      setBusy(false);
      textInput.focus();
    }
  });

  mediaRecorder.start();
  recordingTimer = setTimeout(() => stopRecording(), 8000);
  micButton.classList.add("recording");
  setStatus("録音中", "listening");
}

function stopRecording() {
  if (mediaRecorder?.state === "recording") {
    clearRecordingTimer();
    mediaRecorder.stop();
    setStatus("処理中", "thinking");
  }
}

function setupAudioRecording() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    micButton.disabled = true;
    micButton.title = "このブラウザは音声入力に対応していません";
    addMessage("assistant", "このブラウザでは録音が使えません。Chromeで開くか、文字入力を使ってください。");
    return;
  }

  micButton.title = "押して録音、もう一度押して送信";
}

micButton.addEventListener("click", async () => {
  if (busy && !micButton.classList.contains("recording")) return;
  if (micButton.classList.contains("recording")) {
    stopRecording();
    return;
  }

  try {
    await startRecording();
  } catch (error) {
    addMessage("assistant", `マイクを開始できませんでした: ${error.message}`);
    setStatus("エラー");
    micButton.classList.remove("recording");
    clearRecordingTimer();
    stopRecordingStream();
    setBusy(false);
  }
});

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(textInput.value);
});

setupAudioRecording();

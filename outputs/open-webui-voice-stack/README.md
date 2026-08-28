# Open WebUI 音声入力 + 音声出力ローカル構成

この構成は、Open WebUIで「話す → 文字起こし → LLMへ送る → 返答を読み上げる」を試すためのDocker Composeです。

## 構成

```text
マイク音声
  ↓
Open WebUI built-in Whisper
  ↓
テキスト
  ↓
Ollama 任意
  ↓
返答テキスト
  ↓
openai-edge-tts
  ↓
音声読み上げ
```

## 役割

| 部品 | 役割 |
| --- | --- |
| Open WebUI | チャット画面、音声入力ボタン、音声出力設定 |
| built-in Whisper | 音声入力を文字にする |
| openai-edge-tts | 文字を音声にして読み上げる |
| Ollama | 任意のローカルLLM |

## 起動

このフォルダで実行します。

```bash
docker compose up -d
```

Docker Desktopを入れた直後で `docker` にPATHが通っていない場合は、次でも起動できます。

```bash
DOCKER_HOST=unix://$HOME/.docker/run/docker.sock /Applications/Docker.app/Contents/Resources/bin/docker compose up -d
```

起動後、ブラウザで開きます。

```text
http://localhost:3000
```

## LLMモデルを入れる場合

音声入力と音声出力だけならSTT/TTSの設定で足りますが、会話させるにはLLMが必要です。

まず元になる軽量モデルを取得します。

```bash
docker compose exec ollama ollama pull qwen2.5:0.5b
```

次に、音声会話向けに短く返答するモデルを作成します。

```bash
docker compose exec -T ollama ollama create qwen2.5-voice-fast:0.5b -f - < Modelfile.qwen2.5-voice-fast
```

確認します。

```bash
docker compose exec ollama ollama list
```

一覧に `qwen2.5-voice-fast:0.5b` があればOKです。

## Open WebUI側の確認ポイント

管理画面またはユーザー設定のAudioで確認します。

```text
Speech-to-Text:
  Local Whisper / Default
  Language: Japanese / ja

Text-to-Speech:
  Engine: OpenAI-compatible
  Base URL: http://openai-edge-tts:5050/v1
  API Key: not-needed
  Model: tts-1
  Voice: ja-JP-NanamiNeural
```

ユーザー設定で以下も有効にすると、音声会話っぽく使いやすくなります。

```text
Auto-playback: On
Conversation Mode: On
```

## 注意

- 初回起動時はDockerイメージとWhisperモデルの取得に時間がかかります。
- 初回起動時はOpen WebUIが埋め込みモデルを取得するため、UI応答まで少し待つことがあります。
- ブラウザがマイク許可を求めたら許可してください。
- `openai-edge-tts` はMicrosoft Edge系の音声をOpenAI互換APIとして出すコンテナです。
- 完全な「人間みたいな割り込み会話」には、発話終了検出やAI発話中断などの調整が別途必要です。

## 検証済み

- Docker Desktop 4.86.0 / Docker Engine 29.7.2で起動確認済み
- Open WebUI: `http://127.0.0.1:3000` がHTTP 200
- openai-edge-tts: `/v1/audio/speech` がHTTP 200でmp3生成
- Ollama: `http://127.0.0.1:11434/api/tags` が応答

## 参考

- Open WebUI Audio: https://docs.openwebui.com/ecosystem/computer/ai/voice-and-audio/
- Open WebUI STT config: https://docs.openwebui.com/features/chat-conversations/audio/speech-to-text/stt-config/
- Open WebUI audio troubleshooting: https://docs.openwebui.com/troubleshooting/audio/

# tsuri_part

ローカルPCで動く、簡易的な日本語音声会話Webアプリです。

マイクで話すと、音声を文字起こしし、ローカルLLMへ送信し、返答を音声で自動再生します。

## できること

- ブラウザでマイク録音する
- Whisperで日本語の文字起こしをする
- Ollama上のローカルLLMに自動送信する
- LLMの返答を画面に表示する
- TTSで返答を音声化する
- ブラウザで返答音声を自動再生する

## 全体の仕組み

```text
ユーザーの声
  ↓
ブラウザで録音
  ↓
Node.jsサーバー
  ↓
Whisperで文字起こし
  ↓
OllamaのローカルLLM
  ↓
返答テキスト
  ↓
openai-edge-ttsで音声化
  ↓
ブラウザで自動再生
```

## 必要なもの

事前に以下をインストールしてください。

- Git
- Docker Desktop
- Node.js 18以上
- ブラウザ
- マイク

Docker Desktopは、コマンド実行前に起動しておいてください。

## セットアップ

### 1. リポジトリを取得する

```bash
git clone https://github.com/st-tsk/tsuri_part.git
cd tsuri_part
```

### 2. Docker構成を起動する

```bash
cd outputs/open-webui-voice-stack
docker compose up -d
```

これで以下の3つが起動します。

| サービス | 役割 | URL |
| --- | --- | --- |
| Open WebUI | Whisperを含むWebUI | http://localhost:3000 |
| Ollama | ローカルLLM実行環境 | http://localhost:11434 |
| openai-edge-tts | 文字を音声にするTTS | http://localhost:5050 |

### 3. LLMモデルを作成する

まず元になるモデルを取得します。

```bash
docker compose exec ollama ollama pull qwen2.5:0.5b
```

次に、音声会話向けの短い返答モデルを作成します。

```bash
docker compose exec -T ollama ollama create qwen2.5-voice-fast:0.5b -f - < Modelfile.qwen2.5-voice-fast
```

作成できたか確認します。

```bash
docker compose exec ollama ollama list
```

一覧に `qwen2.5-voice-fast:0.5b` があればOKです。

### 4. 簡易音声会話アプリを起動する

別のターミナルを開き、リポジトリのルートから実行します。

```bash
cd outputs/simple-voice-chat
node server.mjs
```

表示されたURLをブラウザで開きます。

```text
http://localhost:3333
```

## 使い方

1. `http://localhost:3333` を開く
2. ブラウザのマイク許可を許可する
3. マイクボタンを押す
4. 日本語で話す
5. もう一度マイクボタンを押す、または8秒待つ
6. 文字起こし、LLM返答、音声読み上げが自動で進む

テキスト入力欄から文字で送信することもできます。

## 動作確認

Docker側が動いているか確認します。

```bash
cd outputs/open-webui-voice-stack
docker compose ps
```

簡易アプリの設定を確認します。

```bash
curl http://localhost:3333/api/health
```

正常なら、使用中のモデル名などがJSONで返ります。

## よくある問題

### http://localhost:3333 が開けない

`node server.mjs` が起動しているか確認してください。

```bash
cd outputs/simple-voice-chat
node server.mjs
```

### 音声入力できない

ブラウザのマイク許可を確認してください。

Macの場合は、システム設定のマイク権限でブラウザが許可されているかも確認してください。

### 文字起こしに失敗する

Docker Desktopが起動しているか、Open WebUIコンテナが動いているか確認してください。

```bash
cd outputs/open-webui-voice-stack
docker compose ps
```

`open-webui-voice` が `running` になっている必要があります。

### LLMが返答しない

Ollamaが起動しているか、モデルがあるか確認してください。

```bash
cd outputs/open-webui-voice-stack
docker compose exec ollama ollama list
```

`qwen2.5-voice-fast:0.5b` がない場合は、セットアップ手順の「LLMモデルを作成する」をもう一度実行してください。

### 読み上げされない

TTSコンテナが起動しているか確認してください。

```bash
cd outputs/open-webui-voice-stack
docker compose ps
```

`openai-edge-tts` が `running` になっている必要があります。

## フォルダ構成

```text
outputs/
  open-webui-voice-stack/
    docker-compose.yml
    Modelfile.qwen2.5-voice-fast
    Modelfile.qwen2.5-voice
    README.md

  simple-voice-chat/
    server.mjs
    index.html
    app.js
    styles.css
    README.md
```

## 各フォルダの役割

| フォルダ | 役割 |
| --- | --- |
| `outputs/open-webui-voice-stack` | DockerでOpen WebUI、Ollama、TTSを起動する設定 |
| `outputs/simple-voice-chat` | `http://localhost:3333` で動く簡易音声会話アプリ |

## 重要な考え方

このアプリは、LLMだけで音声会話しているわけではありません。

```text
録音する
文字にする
返答を考える
音声にする
再生する
```

この5つの処理を、Node.jsサーバーが順番につないでいます。

| 部品 | 役割 |
| --- | --- |
| ブラウザ | 録音、表示、音声再生 |
| Node.js | 処理の流れを管理する橋渡し |
| Whisper | 音声を文字にする |
| Ollama | ローカルLLMを動かす |
| qwen2.5-voice-fast | 返答文を作る |
| openai-edge-tts | 文字を音声にする |
| Docker | 必要な部品をコンテナとして起動する |

## 補足

このリポジトリには、Docker本体、Ollamaのモデルデータ、生成された音声ファイルは含めていません。

GitHubに保存しているのは、アプリのコードと、同じ環境を再現するための設定ファイルです。

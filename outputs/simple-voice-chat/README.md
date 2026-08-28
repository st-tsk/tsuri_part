# 簡易ローカル音声会話システム

Open WebUIとは別に作った、会話だけに絞った小さなWebアプリです。

目的は、ユーザーがマイクで話すと、その音声を文字起こしし、ローカルLLMへ自動送信し、返答を音声で自動再生することです。

## できること

- ブラウザでマイク録音する
- 録音音声をWhisperで文字起こしする
- 文字起こし結果をLLMへ自動送信する
- LLMの返答を画面に表示する
- 返答文をTTSで音声化する
- 生成された音声をブラウザで自動再生する

## 全体像

```text
あなたの声
  ↓
ブラウザで録音
  ↓
Node.jsサーバーへ送信
  ↓
Open WebUIコンテナ内のWhisperで文字起こし
  ↓
Node.jsサーバーへ文字が戻る
  ↓
OllamaのLLMへ自動送信
  ↓
LLMが返答テキストを作る
  ↓
openai-edge-ttsで音声化
  ↓
ブラウザで自動再生
```

## 役割分担

```text
ブラウザ:
画面表示、マイク録音、音声再生を担当する。

Node.jsサーバー:
ブラウザ、Whisper、Ollama、TTSをつなぐ橋渡し役。
会話の流れを管理する。

Docker:
Whisper、Ollama、TTSなどの部品をコンテナとして動かす。

Whisper:
音声を文字に変換する。STTの役割。

Ollama:
ローカルLLMを動かす実行環境。

qwen2.5-voice-fast:0.5b:
実際に返答文を作るLLMモデル。

openai-edge-tts:
返答テキストを音声に変換する。TTSの役割。
```

## 用語

```text
STT:
Speech to Textの略。音声を文字にする仕組み。

Whisper:
STTを行うAIモデル。今回の「耳」の部分。

LLM:
Large Language Modelの略。文字を読んで返答を考えるAI。

Ollama:
ローカルPCでLLMを動かすための実行環境。

TTS:
Text to Speechの略。文字を音声にする仕組み。

Node.js:
JavaScriptでサーバーを動かすための実行環境。

サーバー:
依頼を待ち受け、依頼を処理し、結果を返すプログラム。

localhost:
自分のPC自身を指す名前。

ポート:
PC内の受付番号。3333、3000、11434、5050など。

Docker:
アプリやAI部品を隔離された箱として動かす仕組み。

コンテナ:
Dockerで実際に動いている箱。
```

## 今回使っているポート

```text
http://localhost:3333
簡易音声会話アプリ

http://localhost:3000
Open WebUI

http://localhost:11434
Ollama

http://localhost:5050
openai-edge-tts
```

## 起動方法

先にOpen WebUI、Ollama、TTSのDocker構成を起動します。

```bash
cd /Users/yumatsuri/Documents/Codex/2026-08-16/new-chat/outputs/open-webui-voice-stack
docker compose up -d
```

次に、この簡易音声会話アプリを起動します。

```bash
cd /Users/yumatsuri/Documents/Codex/2026-08-16/new-chat/outputs/simple-voice-chat
node server.mjs
```

ブラウザで開きます。

```text
http://localhost:3333
```

## 使い方

- マイクボタンを押す
- 話す
- もう一度マイクボタンを押す、または8秒待つ
- 録音が止まる
- Whisperで文字起こしされる
- 文字起こし結果が自動でLLMへ送信される
- LLMが返答する
- 返答が自動で読み上げられる

文字入力でも送信できます。

## 細かい処理フロー

1. ユーザーがマイクボタンを押す
2. ブラウザがマイク使用許可を確認する
3. ブラウザが音声を録音する
4. 録音データを`Blob`としてまとめる
5. ブラウザが`/api/transcribe`へ音声を送る
6. Node.jsサーバーが音声を受け取る
7. Node.jsサーバーが音声を一時ファイルとして保存する
8. Node.jsサーバーが`docker cp`で音声ファイルをOpen WebUIコンテナへ渡す
9. Node.jsサーバーが`docker exec`でコンテナ内のWhisperを実行する
10. Whisperが音声を文字に変換する
11. Node.jsサーバーが文字起こし結果をブラウザへ返す
12. ブラウザが文字起こし結果を`/api/chat`へ自動送信する
13. Node.jsサーバーがOllamaの`/api/chat`へテキストを送る
14. Ollamaが`qwen2.5-voice-fast:0.5b`を使って返答を作る
15. Node.jsサーバーが返答テキストをブラウザへ返す
16. ブラウザが返答テキストを画面に表示する
17. ブラウザが返答テキストを`/api/speech`へ送る
18. Node.jsサーバーが`openai-edge-tts`へ返答テキストを送る
19. `openai-edge-tts`が音声データを作る
20. Node.jsサーバーが音声データをブラウザへ返す
21. ブラウザが音声を自動再生する

## Node.jsサーバーのAPI

```text
GET /
画面ファイルを返す。

GET /api/health
サーバー設定の確認用。

POST /api/transcribe
録音音声を受け取り、Whisperで文字起こしして、文字を返す。

POST /api/chat
文字を受け取り、OllamaのLLMへ送り、返答文字を返す。

POST /api/speech
返答文字を受け取り、TTSで音声化して、音声データを返す。
```

## Dockerがどう関わっているか

Dockerは会話の流れを判断していません。

会話の流れを管理しているのはNode.jsサーバーです。

Dockerは、必要な部品をコンテナとして動かし、Node.jsサーバーがそれらを使えるようにしています。

```text
Dockerの役割:
Whisperが使える環境を動かす
Ollamaが使える環境を動かす
TTSが使える環境を動かす
ポートを開いてMac側から呼べるようにする
必要に応じてファイルをコンテナへ渡せるようにする
```

今回のWhisper処理では、Node.jsサーバーがDockerをこう使っています。

```text
録音ファイルを受け取る
  ↓
docker cpでOpen WebUIコンテナへコピー
  ↓
docker execでコンテナ内のWhisperを実行
  ↓
文字起こし結果を受け取る
```

OllamaとTTSはポート経由で呼び出しています。

```text
Node.jsサーバー
  ↓
http://127.0.0.1:11434/api/chat
  ↓
Ollama
```

```text
Node.jsサーバー
  ↓
http://127.0.0.1:5050/v1/audio/speech
  ↓
openai-edge-tts
```

## モデルについて

現在使っているモデルは以下です。

```text
qwen2.5-voice-fast:0.5b
```

これは完全にゼロから作ったモデルではなく、`qwen2.5:0.5b`を元に、音声会話向けの指示を入れたものです。

主な方針は以下です。

```text
日本語で返す
短く返す
読み上げやすい自然な文にする
余計な説明をしない
```

モデルを変更したい場合は、サーバー起動時に環境変数で指定できます。

```bash
OLLAMA_MODEL=モデル名 node server.mjs
```

例:

```bash
OLLAMA_MODEL=qwen2.5:0.5b node server.mjs
```

ただし、そのモデルがOllamaに入っている必要があります。

## 自分用モデルにする方法

一番簡単なのは、Ollamaの`Modelfile`で振る舞いを固定する方法です。

例:

```text
FROM qwen2.5:0.5b

PARAMETER temperature 0.3
PARAMETER num_predict 40

SYSTEM """
あなたは僕専用の音声会話アシスタントです。
返答は短く、自然な日本語にしてください。
専門用語を使う時は、必ず簡単に説明してください。
"""
```

作成例:

```bash
ollama create my-voice-assistant -f Modelfile
```

これは厳密にはモデル本体を学習させるのではなく、既存モデルに専用の振る舞いを付ける方法です。

より本格的にモデル自体を変えたい場合は、ファインチューニングが必要です。

ただし、最初は以下の構成がおすすめです。

```text
Modelfileで性格や返答ルールを固定する
  +
外部メモリに会話や好みを保存する
```

## 常に学ぶ仕組みについて

モデル本体を毎回自動で学習させるより、外部メモリを持たせる方式が現実的です。

```text
会話する
  ↓
大事な情報を保存する
  ↓
次回の会話で保存情報を取り出す
  ↓
今の発言と一緒にLLMへ渡す
  ↓
覚えているように返答する
```

保存する情報の例:

```text
ユーザーは短い返答を好む
ユーザーは専門用語が苦手
ユーザーは音声会話システムを作っている
よく使うモデル
よく使うアプリ
過去の会話の要約
```

この方式は、モデルが本当に毎回学習しているわけではありません。
ただし、ユーザーから見ると「覚えてくれている」ように動かせます。

## 完成までの流れ

最初はOpen WebUIで、音声入力と音声出力ができるかを確認しました。

1. Docker ComposeでOpen WebUI、Ollama、openai-edge-ttsを起動する構成を作った
2. Open WebUIの初期登録を行った
3. Open WebUIで音声入力、文字起こし、音声出力を確認した
4. `gemma3:1b`を試したが、ツール非対応エラーが出た
5. `qwen2.5:0.5b`を使う方向に変更した
6. 音声会話向けに`qwen2.5-voice-fast:0.5b`を作った
7. Open WebUI上でチャット返答と読み上げを確認した
8. Open WebUIとは別に、仕組みが分かりやすい簡易Webアプリを作った
9. 最初はブラウザ標準の音声認識を使った
10. ブラウザによって不安定だったため、ブラウザ録音 + Whisper文字起こし方式へ変更した
11. 文字起こし後に自動送信されない問題を発見した
12. 原因が`busy`状態のまま`sendMessage`を呼んでいたことだと特定した
13. `busy`を解除してから自動送信するよう修正した
14. 最終的に、音声入力から音声出力まで一連の流れが動くようになった

## 同じ機能をAIに作らせるための指示

同じものをもう一度作る場合は、AIに以下のように指示します。

```text
ローカルPC上で動く、簡易的な音声会話Webアプリを作ってください。

目的は、ユーザーがマイクで話すと、その音声を文字起こしし、ローカルLLMに送信し、返答を音声で自動再生することです。

構成は以下にしてください。

1. フロントエンド
- ブラウザで動くシンプルなWeb画面を作る
- マイクボタンを配置する
- マイクボタンを押すと録音開始
- もう一度押す、または一定時間で録音停止
- 録音停止後、自動で文字起こし処理へ送る
- 文字起こし結果を自動でLLMへ送る
- LLMの返答を画面に表示する
- 返答音声を自動再生する
- 状態表示を入れる

2. Node.jsサーバー
- ブラウザと各AI部品をつなぐ中継サーバーを作る
- ポートは3333で起動する
- 静的ファイルを配信する
- /api/transcribe、/api/chat、/api/speechを作る

3. 使用する部品
- LLMはOllamaを使う
- Ollama APIは http://127.0.0.1:11434/api/chat を使う
- TTSはopenai-edge-ttsを使う
- TTS APIは http://127.0.0.1:5050/v1/audio/speech を使う
- TTSのvoiceは ja-JP-NanamiNeural を使う
- Whisperはローカルで動くものを使う
- 可能ならOpen WebUIコンテナ内のfaster-whisperを利用する

4. 注意点
- Open WebUIの自動送信設定や自動読み上げ設定には依存しない
- 簡易アプリ側で自動送信と自動再生を実装する
- モデルは音声を直接扱わない
- 音声入力はSTT、返答生成はLLM、音声出力はTTSに分ける
- ブラウザからDockerやOllamaを直接操作せず、Node.jsサーバーを経由する
- 文字起こし後にbusy状態のまま送信が止まらないよう注意する
- 返答は音声読み上げ向けに短く自然な日本語にする

完成後、以下を検証してください。

- http://localhost:3333 が開ける
- マイク録音ができる
- 録音音声が文字起こしされる
- 文字起こし結果が自動でLLMに送信される
- LLMが返答する
- 返答がTTSで音声化される
- ブラウザで自動再生される
```

## 重要な考え方

この音声会話システムは、モデル単体でできているわけではありません。

```text
録音する
  ↓
文字にする
  ↓
返答を考える
  ↓
音声にする
  ↓
再生する
```

この流れをアプリ側で組み立てています。

つまり、別のアプリに同じ機能を入れる場合も、以下のセットが必要です。

```text
録音・再生できる画面
Node.jsなどの橋渡しサーバー
WhisperなどのSTT
OllamaなどのLLM実行環境
LLMモデル
openai-edge-ttsやVOICEVOXなどのTTS
それらを動かすDockerなどの環境
```

/**
 * Edge TTS 后端 - 复用 Azure 认证 endpoint，通过 HTTP 调用语音合成
 *
 * Edge TTS 音色（如 zh-CN-XiaoxiaoNeural）可通过微软翻译器认证的
 * 同一 TTS HTTP 端点访问，无需 WebSocket。
 * 长文本自动分段合成后拼接。
 */

import { getEndpointAndToken } from "./azure.js";

const USER_AGENT = "okhttp/4.5.0";
const DEFAULT_OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
const MAX_CHUNK_SIZE = 2000;

function buildSSML(text, voiceName, rate, pitch) {
  return `<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" version="1.0" xml:lang="zh-CN">
<voice name="${voiceName}">
    <prosody rate="${rate}%" pitch="${pitch}%">
        ${text}
    </prosody>
</voice>
</speak>`;
}

async function synthesizeChunk(text, voiceName, rate, pitch, ep) {
  const url = `https://${ep.r}.tts.speech.microsoft.com/cognitiveservices/v1`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": ep.t,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": DEFAULT_OUTPUT_FORMAT,
      "User-Agent": USER_AGENT,
    },
    body: buildSSML(text, voiceName, rate, pitch),
  });

  if (!response.ok) {
    throw new Error(`Edge TTS 请求失败: ${response.status}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

export async function getVoice(text, voiceName, rate = "+0%", pitch = "+0Hz") {
  // "+10%" → "10", "-5Hz" → "-5"
  const rateNum = rate.replace(/[%Hz]/g, "").replace(/^\+/, "");
  const pitchNum = pitch.replace(/[%Hz]/g, "").replace(/^\+/, "");

  const ep = await getEndpointAndToken();

  // 短文本直接合成
  if (text.length <= MAX_CHUNK_SIZE) {
    return synthesizeChunk(text, voiceName, rateNum, pitchNum, ep);
  }

  // 长文本分段并行合成
  const chunks = [];
  for (let i = 0; i < text.length; i += MAX_CHUNK_SIZE) {
    chunks.push(text.slice(i, i + MAX_CHUNK_SIZE));
  }

  const audioChunks = await Promise.all(
    chunks.map(chunk => synthesizeChunk(chunk, voiceName, rateNum, pitchNum, ep))
  );

  const totalLen = audioChunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of audioChunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

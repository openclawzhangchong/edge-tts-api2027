const ENDPOINT_URL = "https://dev.microsofttranslator.com/apps/endpoint?api-version=1.0";
const USER_AGENT = "okhttp/4.5.0";
const CLIENT_VERSION = "4.0.530a 5fe1dc6c";
const USER_ID = "0f04d16a175c411e";
const HOME_GEOGRAPHIC_REGION = "zh-Hans-CN";
const CLIENT_TRACE_ID = "aab069b9-70a7-4844-a734-96cd78d94be9";
const VOICE_DECODE_KEY = "oik6PdDdMnOXemTbwvMn9de/h9lFnfBaCWbGMMZqqoSaQaqUOqjVGm5NqsmjcBI1x+sS9ugjB55HEJWRiFXYFw==";
const DEFAULT_OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";

// 缓存 endpoint 和过期时间
let endpoint = null;
let expiredAt = null;

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function sign(urlStr) {
  const u = urlStr.split("://")[1];
  const encodedUrl = encodeURIComponent(u);
  const uuidStr = crypto.randomUUID().replace(/-/g, "");

  const now = new Date();
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const formattedDate = [
    `${days[now.getUTCDay()]},`,
    `${String(now.getUTCDate()).padStart(2, "0")}`,
    months[now.getUTCMonth()],
    now.getUTCFullYear(),
    `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}:${String(now.getUTCSeconds()).padStart(2, "0")}gmt`,
  ].join(" ");

  const bytesToSign = `mstranslatorandroidapp${encodedUrl.toLowerCase()}${formattedDate}${uuidStr}`;

  const keyBuffer = base64ToArrayBuffer(VOICE_DECODE_KEY);
  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC", cryptoKey, new TextEncoder().encode(bytesToSign)
  );
  const signBase64 = arrayBufferToBase64(signatureBuffer);

  return `MSTranslatorAndroidApp::${signBase64}::${formattedDate}::${uuidStr}`;
}

async function getEndpoint() {
  const signature = await sign(ENDPOINT_URL);
  const headers = {
    "Accept-Language": "zh-Hans",
    "X-ClientVersion": CLIENT_VERSION,
    "X-UserId": USER_ID,
    "X-HomeGeographicRegion": HOME_GEOGRAPHIC_REGION,
    "X-ClientTraceId": CLIENT_TRACE_ID,
    "X-MT-Signature": signature,
    "User-Agent": USER_AGENT,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": "0",
  };

  const response = await fetch(ENDPOINT_URL, { method: "POST", headers });
  if (!response.ok) {
    throw new Error(`获取 endpoint 失败: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function decodeJWT(token) {
  const payload = token.split(".")[1];
  return JSON.parse(atob(payload + "=="));
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function buildSSML(text, voiceName, rate, pitch, style) {
  return `<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" version="1.0" xml:lang="zh-CN">
<voice name="${voiceName}">
    <mstts:express-as style="${style}" styledegree="1.0" role="default">
        <prosody rate="${rate}%" pitch="${pitch}%">
            ${text}
        </prosody>
    </mstts:express-as>
</voice>
</speak>`;
}

/** 获取有效的 endpoint（含 token 缓存管理），供 azure 和 edge 共用 */
export async function getEndpointAndToken() {
  const currentTime = Math.floor(Date.now() / 1000);
  if (!expiredAt || currentTime > expiredAt - 60) {
    endpoint = await getEndpoint();
    const jwt = decodeJWT(endpoint.t);
    expiredAt = jwt.exp;
  }
  return endpoint;
}

export async function getVoice(text, voiceName, rate = "0", pitch = "0", outputFormat = "", style = "general") {
  await getEndpointAndToken();

  voiceName = voiceName || "zh-CN-XiaoxiaoMultilingualNeural";
  outputFormat = outputFormat || DEFAULT_OUTPUT_FORMAT;
  style = style || "general";

  const url = `https://${endpoint.r}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const ssml = buildSSML(escapeHtml(text), voiceName, rate, pitch, style);

  const headers = {
    "Authorization": endpoint.t,
    "Content-Type": "application/ssml+xml",
    "X-Microsoft-OutputFormat": outputFormat,
    "User-Agent": USER_AGENT,
  };

  // 重试 3 次，指数退避
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { method: "POST", headers, body: ssml });
      if (!response.ok) {
        throw new Error(`Azure TTS 请求失败: ${response.status}`);
      }
      return new Uint8Array(await response.arrayBuffer());
    } catch (e) {
      lastError = e;
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, Math.min(2000 * Math.pow(2, attempt), 5000)));
        // 强制刷新 token
        expiredAt = null;
        await getEndpointAndToken();
      }
    }
  }
  throw lastError;
}

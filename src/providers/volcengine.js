const HEADERS = {
  "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7,zh-TW;q=0.6",
  "Cache-Control": "no-cache",
  "Connection": "keep-alive",
  "Origin": "chrome-extension://klgfhbiooeogdfodpopgppeadghjjemk",
  "Pragma": "no-cache",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "none",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "accept": "application/json, text/plain, */*",
  "content-type": "application/json",
};

async function detectLanguage(text) {
  try {
    const response = await fetch("https://translate.volcengine.com/web/langdetect/v1/", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ text }),
    });
    const data = await response.json();
    return data.language || null;
  } catch {
    return null;
  }
}

export async function getVoice(text, voice) {
  const language = await detectLanguage(text);

  const jsonData = { text, speaker: voice };
  if (language) jsonData.language = language;

  // 重试 3 次
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch("https://translate.volcengine.com/crx/tts/v1/", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify(jsonData),
      });
      if (!response.ok) {
        throw new Error(`火山语音服务 ${voice} 出错了。`);
      }
      const resp = await response.json();
      const audio = resp.audio;
      if (!audio) {
        throw new Error(`火山语音服务 ${voice} 生成失败，请切换音色后再试一次。`);
      }
      const audioData = audio.data;
      if (!audioData) {
        throw new Error(`火山语音服务 ${voice} 数据生成失败。`);
      }
      // 返回 base64 编码的音频数据
      return audioData;
    } catch (e) {
      lastError = e;
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, Math.min(2000 * Math.pow(2, attempt), 5000)));
      }
    }
  }
  throw lastError;
}

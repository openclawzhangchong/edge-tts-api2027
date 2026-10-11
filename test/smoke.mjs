import worker from "../src/index.js";

const J = (body) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const AUTH = { headers: { authorization: "Bearer test-key" } };

const cases = [
  { name: "GET /api/providers", req: new Request("https://x/api/providers"), expect: 200 },
  { name: "GET /api/voices?provider=azure", req: new Request("https://x/api/voices?provider=azure"), expect: 200 },
  { name: "GET /api/voices?provider=edge", req: new Request("https://x/api/voices?provider=edge"), expect: 200 },
  { name: "GET /api/voices?provider=bogus", req: new Request("https://x/api/voices?provider=bogus"), expect: 400 },
  { name: "GET /api/tts (no text)", req: new Request("https://x/api/tts"), expect: 400 },
  { name: "POST /api/tts bad provider", req: new Request("https://x/api/tts", J({ text: "hi", provider: "nope" })), expect: 400 },
  { name: "POST /api/tts bad voice", req: new Request("https://x/api/tts", J({ text: "hi", provider: "azure", voice: "不存在的音色" })), expect: 400 },
  { name: "GET / (WebUI)", req: new Request("https://x/"), expect: 200 },
  { name: "GET /favicon.ico", req: new Request("https://x/favicon.ico"), expect: 200 },
  { name: "GET /v1/models", req: new Request("https://x/v1/models", AUTH), expect: 200 },
  { name: "POST /v1/audio/speech (no auth)", req: new Request("https://x/v1/audio/speech", J({ input: "hi" })), expect: 401 },
  { name: "POST /v1/audio/speech bad provider", req: new Request("https://x/v1/audio/speech", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer test-key" }, body: JSON.stringify({ input: "hi", provider: "nope" }) }), expect: 400 },
  { name: "GET /unknown", req: new Request("https://x/unknown"), expect: 404 },
];

let pass = 0, fail = 0;
for (const c of cases) {
  try {
    const res = await worker.fetch(c.req, {}, {});
    const ok = res.status === c.expect;
    const body = (await res.text()).slice(0, 70).replace(/\s+/g, " ");
    console.log(`${ok ? "PASS" : "FAIL"} | ${c.name.padEnd(38)} | got ${res.status} want ${c.expect} | ${body}`);
    ok ? pass++ : fail++;
  } catch (e) {
    console.log(`ERROR| ${c.name.padEnd(38)} | ${e.message}`);
    fail++;
  }
}
console.log(`\n${pass} passed, ${fail} failed`);

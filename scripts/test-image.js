const fs = require("fs");
const https = require("https");
const dotenv = require("dotenv");

dotenv.config();

const POLLINATIONS_API_KEY =
  process.env.POLLINATIONS_API_KEY || process.env.POLLI_API_KEY || "";

function buildImageUrl(prompt, seed = 123, model = "flux") {
  const base = "https://gen.pollinations.ai/image/";
  const encoded = encodeURIComponent(prompt);
  const params = new URLSearchParams({
    width: "600",
    height: "400",
    seed: String(seed),
    model,
  });
  if (POLLINATIONS_API_KEY && POLLINATIONS_API_KEY.startsWith("pk_")) {
    params.set("key", POLLINATIONS_API_KEY);
  }
  return `${base}${encoded}?${params.toString()}`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readResponseBody(res) {
  return new Promise((resolve) => {
    let data = "";
    res.on("data", (chunk) => {
      data += chunk.toString();
    });
    res.on("end", () => resolve(data));
  });
}

function downloadImage(url, outputPath, attempts = 3) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          Accept: "image/*,*/*;q=0.8",
          ...(POLLINATIONS_API_KEY
            ? { Authorization: `Bearer ${POLLINATIONS_API_KEY}` }
            : {}),
        },
      },
      (res) => {
        const status = res.statusCode || 0;
        const contentType = res.headers["content-type"] || "";
        console.log("Status:", status, "Content-Type:", contentType);
        if (status >= 400) {
          readResponseBody(res).then((body) => {
            const detail = body ? ` - ${body.slice(0, 500)}` : "";
            reject(new Error(`HTTP ${status}${detail}`));
          });
          return;
        }
        if (!contentType.startsWith("image/")) {
          readResponseBody(res).then((body) => {
            const detail = body ? ` - ${body.slice(0, 500)}` : "";
            reject(
              new Error(
                `Unexpected content-type: ${contentType || "(none)"}${detail}`
              )
            );
          });
          return;
        }
        const file = fs.createWriteStream(outputPath);
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
      }
    );
    request.on("error", reject);
  });
}

async function main() {
  const prompt =
    "heavy snow " +
    "athletes parading, snow-covered mountains, cinematic lighting, " +
    "high detail, realistic, no text";
  const url = buildImageUrl(prompt, 225126364);
  const outputPath = "test-image.jpg";

  console.log("Image URL:", url);
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      if (attempt > 1) {
        console.log(`Retrying (${attempt}/3)...`);
      }
      await downloadImage(url, outputPath);
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      const delay = 1000 * attempt;
      await wait(delay);
    }
  }
  if (lastError) {
    throw lastError;
  }
  const stats = fs.statSync(outputPath);
  console.log("Saved:", outputPath, `(${stats.size} bytes)`);
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});

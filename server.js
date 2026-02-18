const path = require("path");
const fs = require("fs");
const https = require("https");
const express = require("express");
const dotenv = require("dotenv");
const { GoogleGenerativeAI } = require("@google/generative-ai");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_DIR = path.join(__dirname, "data", "cache");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getDateDisplay() {
  return new Intl.DateTimeFormat("he-IL", {
    day: "numeric",
    month: "long",
  }).format(new Date());
}

const CATEGORY_DEFS = [
  {
    id: "cinema_tv",
    title: "קולנוע וטלוויזיה",
    labels: ["הבכורה הגדולה", "פרק בלתי נשכח", "שובר הקופות"],
  },
  {
    id: "music_sound",
    title: "מוזיקה וסאונד",
    labels: ["מקום ראשון במצעד", "יציאת אלבום", "נולד היום"],
  },
  {
    id: "famous_people",
    title: "אנשים מפורסמים",
    labels: ["השחקן המוביל", "אייקון היסטורי", "החלוץ"],
  },
  {
    id: "sports_records",
    title: "ספורט ושיאים",
    labels: ["המשחק הגדול", "שובר השיאים", "מספר שפרש"],
  },
  {
    id: "literature_writing",
    title: "ספרות וכתיבה",
    labels: ["יצירה קלאסית", "יום הולדת לסופר", "אירוע ספרותי"],
  },
  {
    id: "history_tech",
    title: "היסטוריה וטכנולוגיה",
    labels: ["ההמצאה", "הגילוי", "ציון דרך בחלל"],
  },
];

function buildCategorySchema(category, dateDisplay) {
  const items = category.labels
    .map(
      (label) =>
        `        {"label": "${label}", "title": "", "year": 0, "date": "${dateDisplay}", "description": "", "imagePromptEn": ""}`
    )
    .join(",\n");
  return `    {\n      "id": "${category.id}",\n      "title": "${category.title}",\n      "items": [\n${items}\n      ]\n    }`;
}

function buildPrompt(dateDisplay, categories) {
  const categoriesBlock = categories
    .map((category) => buildCategorySchema(category, dateDisplay))
    .join(",\n");

  return `אתה היסטוריון מחקרי. הפק תוכן אמיתי, מבוסס עובדות בלבד, ללא המצאות.
התאריך: ${dateDisplay}.

החזר אך ורק JSON תקני (ללא Markdown, ללא טקסט נוסף) במבנה הבא:
{
  "dateDisplay": "${dateDisplay}",
  "categories": [
${categoriesBlock}
  ]
}

דרישות:
- כל פריט כולל כותרת, שנה, שדה date, ותיאור של 2–4 משפטים בעברית תקנית.
- כל שדה date חייב להיות בדיוק "${dateDisplay}".
- המשפט הראשון בתיאור חייב להתחיל במבנה: "ב-${dateDisplay} בשנת YYYY ..." (YYYY היא השנה של הפריט).
- התוכן חייב להיות היסטורי, מדויק ואמיתי בלבד.
- אין להמציא עובדות. אם אין מידע ודאי, בחר אירוע אחר שכן מתועד.
- בחר רק אירועים עם תאריך מדויק ומתועד לתאריך ${dateDisplay} (יום וחודש ספציפיים), ולא אירועים עם תאריך משוער, כללי, או לא ידוע.
- זה חשוב מאוד.
- הימנע מהערות צד, מקורות, או ניסוחים בסגנון "ייתכן".
- לכל פריט יש להוסיף שדה imagePromptEn באנגלית פשוטה בלבד (ללא עברית או תווים שאינם לטיניים), המתאר את האירוע לתמונה.
`;
}

function buildContinuePrompt(dateDisplay, partialText, categories) {
  return `פלט קודם נקטע באמצע. התאריך: ${dateDisplay}.

הנה הפלט החלקי (ייתכן שהוא מסתיים באמצע מחרוזת):
${partialText}

המשך מהמקום שבו הפלט נקטע והחזר בסוף JSON תקני ושלם בלבד (ללא Markdown וללא טקסט נוסף).
אל תשנה פריטים שכבר הופיעו בפלט החלקי, ואל תוסיף מידע שאינו מתועד היטב.
להזכיר: המבנה הנדרש הוא בדיוק:
${buildPrompt(dateDisplay, categories)}
`;
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    const cleaned = text
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("לא התקבל JSON תקני מהמודל.");
    }
    return JSON.parse(match[0]);
  }
}

function extractPartialJson(text) {
  const cleaned = String(text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const startIndex = cleaned.indexOf("{");
  if (startIndex === -1) return "";
  return cleaned.slice(startIndex);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const DISALLOWED_PHRASES = [
  /ייתכן/i,
  /אין תיעוד/i,
  /אף על פי/i,
  /סביב/i,
  /ככל הנראה/i,
  /משוער/i,
  /לא ידוע/i,
  /לפי /i,
];

function isEnglishPrompt(text) {
  return Boolean(text) && /[A-Za-z]/.test(text) && !/[\u0590-\u05FF]/.test(text);
}

function isValidItem(item, dateDisplay) {
  if (!item?.title || !item?.year || !item?.description) return false;
  if (!item?.date || item.date !== dateDisplay) return false;
  if (item?.imagePromptEn && !isEnglishPrompt(item.imagePromptEn)) return false;

  const desc = String(item.description).trim();
  if (DISALLOWED_PHRASES.some((pattern) => pattern.test(desc))) return false;

  return true;
}

function validatePayload(payload, dateDisplay, expectedCategoryIds) {
  if (!payload?.categories?.length) return false;
  if (payload.categories.length !== expectedCategoryIds.length) return false;

  const seen = new Set();
  for (const category of payload.categories) {
    if (!category?.id || !expectedCategoryIds.includes(category.id)) return false;
    if (seen.has(category.id)) return false;
    seen.add(category.id);
    if (!Array.isArray(category.items) || category.items.length !== 3) return false;
    if (!category.items.every((item) => isValidItem(item, dateDisplay))) return false;
  }

  return true;
}

function chunkArray(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size));
  }
  return chunks;
}

const IMAGE_CREDIT = {
  label: "Images generated by Pollinations.ai",
  url: "https://pollinations.ai/",
};

const IMAGE_BASE_URL = "https://pollinations.ai/prompt/";

function hashSeed(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

const CATEGORY_EN_MAP = {
  cinema_tv: "cinema and television",
  music_sound: "music and sound",
  famous_people: "famous people",
  sports_records: "sports and records",
  literature_writing: "literature and writing",
  history_tech: "history and technology",
};

function extractAsciiText(text) {
  return (text || "")
    .replace(/[^A-Za-z0-9\s'".,-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildImagePrompt(item, categoryTitle, dateDisplay) {
  // 1. Try to get the English prompt provided by Gemini
  let promptFromModel = extractAsciiText(item?.imagePromptEn);
  
  // 2. If Gemini gave us a prompt, use it!
  if (promptFromModel && promptFromModel.length > 3) {
    return `${promptFromModel}. cinematic lighting, high detail, realistic, no text`;
  }

  // 3. Fallback Logic: If imagePromptEn was empty, we build a prompt manually
  const categoryFallback = CATEGORY_EN_MAP[item?.categoryId] || "historical event";
  
  const titleAscii = extractAsciiText(item?.title);
  const labelAscii = extractAsciiText(item?.label);
  const subject = titleAscii || labelAscii || categoryFallback;
  const yearPart = item?.year ? `in ${item.year}` : "";

  // Construct a clean English-structure prompt even with a Hebrew subject
  const prompt = `Historical illustration of ${subject}, ${categoryFallback} ${yearPart}. cinematic lighting, high detail, realistic, no text`;
  
  return prompt.replace(/\s+/g, " ").trim();
}
function normalizeImageUrl(url) {
  if (!url) return url;
  return url.replace("https://image.pollinations.ai/prompt/", IMAGE_BASE_URL);
}

function attachImages(payload) {
  if (!payload?.categories?.length) return payload;
  const withImages = {
    ...payload,
    imageCredit: IMAGE_CREDIT,
    categories: payload.categories.map((category) => ({
      ...category,
      items: category.items.map((item) => {
        const enrichedItem = {
          ...item,
          categoryId: category.id,
        };
        const existingUrl = item?.image?.url ? normalizeImageUrl(item.image.url) : "";
        const hasHebrewEncoding = /%D7|%D6|%D8/i.test(existingUrl);
        if (existingUrl && !hasHebrewEncoding) {
          return {
            ...enrichedItem,
            image: {
              ...item.image,
              url: existingUrl,
              credit: IMAGE_CREDIT,
            },
          };
        }
        const prompt = buildImagePrompt(enrichedItem, category.title, payload.dateDisplay);
        const seed = hashSeed(`${category.id}-${item.title}-${item.year}`);
        const url = `${IMAGE_BASE_URL}${encodeURIComponent(
          prompt
        )}?width=600&height=400&seed=${seed}`;
        return {
          ...enrichedItem,
          image: {
            url,
            credit: IMAGE_CREDIT,
          },
        };
      }),
    })),
  };
  return withImages;
}

async function fetchTodayContent() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("חסר מפתח GEMINI_API_KEY ב-.env");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelCandidates = [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-exp-1206",
    "gemini-flash-latest",
    "gemini-flash-lite-latest",
    "gemini-pro-latest",
    "gemini-2.5-flash-lite",
    "gemini-3-flash-preview",
    "gemini-3-pro-preview",
  ];

  const dateDisplay = getDateDisplay();
  console.log("[4ToDate] Fetching Gemini content", { dateDisplay });

  const fetchCategoryChunk = async (categoriesChunk) => {
    const prompt = buildPrompt(dateDisplay, categoriesChunk);
    const repairPrompt = `החזר רק JSON תקני לפי המבנה המבוקש, ללא Markdown וללא טקסט נוסף. אין לשבור מחרוזות באמצע.\n${prompt}`;
    const expectedCategoryIds = categoriesChunk.map((category) => category.id);

    let lastError;
    let lastPartialResponse = "";

    for (const modelName of modelCandidates) {
      try {
        console.log("[4ToDate] Trying model", modelName, expectedCategoryIds);
        const model = genAI.getGenerativeModel({ model: modelName });
        const generateOnce = async (textPrompt, attempt) => {
          const output = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: textPrompt }] }],
            generationConfig: {
              temperature: 0.2,
              topP: 0.8,
              maxOutputTokens: 4096,
              responseMimeType: "application/json",
            },
          });
          const responseText = output.response.text();
          console.log(`[4ToDate] Gemini response length (${attempt})`, responseText.length);
          return responseText;
        };

        const primaryPrompt = lastPartialResponse
          ? buildContinuePrompt(dateDisplay, lastPartialResponse, categoriesChunk)
          : prompt;
        const firstText = await generateOnce(
          primaryPrompt,
          lastPartialResponse ? "continue" : "primary"
        );
        try {
          const data = parseJsonSafe(firstText);
          if (validatePayload(data, dateDisplay, expectedCategoryIds)) {
            return data;
          }
          console.warn("[4ToDate] Payload validation failed (primary)");
        } catch (error) {
          console.warn("[4ToDate] JSON parse failed (primary)");
          console.error("[4ToDate] Gemini raw response (primary)", firstText);
          const partial = extractPartialJson(firstText);
          if (partial) {
            lastPartialResponse = partial;
          }
        }

        const followupPrompt = lastPartialResponse
          ? buildContinuePrompt(dateDisplay, lastPartialResponse, categoriesChunk)
          : repairPrompt;
        console.log("[4ToDate] Retrying with follow-up prompt");
        const retryText = await generateOnce(
          followupPrompt,
          lastPartialResponse ? "continue-repair" : "repair"
        );
        try {
          const data = parseJsonSafe(retryText);
          if (validatePayload(data, dateDisplay, expectedCategoryIds)) {
            return data;
          }
          console.warn("[4ToDate] Payload validation failed (repair)");
        } catch (error) {
          console.error("[4ToDate] Gemini raw response (repair)", retryText);
          const partial = extractPartialJson(retryText);
          if (partial) {
            lastPartialResponse = partial;
          }
          lastError = error;
        }
      } catch (error) {
        console.warn("[4ToDate] Model failed", modelName, error?.message);
        lastError = error;
      }
    }

    throw lastError || new Error("כל המודלים נכשלו.");
  };

  const categoryChunks = chunkArray(CATEGORY_DEFS, 2);
  const allCategories = [];

  for (const chunk of categoryChunks) {
    const chunkData = await fetchCategoryChunk(chunk);
    allCategories.push(...chunkData.categories);
  }

  return {
    dateDisplay,
    categories: allCategories,
  };
}

async function getCachedOrFresh() {
  const dateKey = getTodayKey();
  const cacheFile = path.join(CACHE_DIR, `${dateKey}.json`);

  if (fs.existsSync(cacheFile)) {
    console.log("[4ToDate] Cache hit", { cacheFile });
    const cached = fs.readFileSync(cacheFile, "utf-8");
    const data = attachImages(JSON.parse(cached));
    fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2), "utf-8");
    return data;
  }

  console.log("[4ToDate] Cache miss", { cacheFile });
  const data = attachImages(await fetchTodayContent());
  fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2), "utf-8");
  console.log("[4ToDate] Cache saved", { cacheFile });
  return data;
}

app.get("/api/today", async (req, res) => {
  try {
    console.log("[4ToDate] /api/today request");
    const data = await getCachedOrFresh();
    res.json(data);
  } catch (error) {
    console.error("[4ToDate] /api/today error", error);
    res.status(500).json({
      error: "שגיאה בטעינת התוכן. נסו שוב בעוד כמה רגעים.",
      details: error.message,
    });
  }
});

function isAllowedImageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith("pollinations.ai");
  } catch {
    return false;
  }
}

app.get("/api/image", (req, res) => {
  const urlParam = req.query.url;
  if (!urlParam) {
    res.status(400).json({ error: "Missing url" });
    return;
  }

  const targetUrl = decodeURIComponent(String(urlParam));
  if (!isAllowedImageUrl(targetUrl)) {
    res.status(400).json({ error: "Invalid image host" });
    return;
  }

  https
    .get(targetUrl, (imageRes) => {
      if (imageRes.statusCode && imageRes.statusCode >= 400) {
        res.status(502).end();
        imageRes.resume();
        return;
      }
      const contentType = imageRes.headers["content-type"] || "image/jpeg";
      res.setHeader("Content-Type", contentType);
      imageRes.pipe(res);
    })
    .on("error", () => {
      res.status(502).end();
    });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`4ToDate running on http://localhost:${PORT}`);
});

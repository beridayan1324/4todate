const path = require("path");
const fs = require("fs");
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

function buildPrompt(dateDisplay) {
  return `אתה היסטוריון מחקרי. הפק תוכן אמיתי, מבוסס עובדות בלבד, ללא המצאות.
התאריך: ${dateDisplay}.

החזר אך ורק JSON תקני (ללא Markdown, ללא טקסט נוסף) במבנה הבא:
{
  "dateDisplay": "${dateDisplay}",
  "categories": [
    {
      "id": "cinema_tv",
      "title": "קולנוע וטלוויזיה",
      "items": [
        {"label": "הבכורה הגדולה", "title": "", "year": 0, "date": "${dateDisplay}", "description": ""},
        {"label": "פרק בלתי נשכח", "title": "", "year": 0, "date": "${dateDisplay}", "description": ""},
        {"label": "שובר הקופות", "title": "", "year": 0, "date": "${dateDisplay}", "description": ""}
      ]
    },
    {
      "id": "music_sound",
      "title": "מוזיקה וסאונד",
      "items": [
        {"label": "מקום ראשון במצעד", "title": "", "year": 0, "date": "${dateDisplay}", "description": ""},
        {"label": "יציאת אלבום", "title": "", "year": 0, "date": "${dateDisplay}", "description": ""},
        {"label": "נולד היום", "title": "", "year": 0, "date": "${dateDisplay}", "description": ""}
      ]
    },
    {
      "id": "famous_people",
      "title": "אנשים מפורסמים",
      "items": [
        {"label": "השחקן המוביל", "title": "", "year": 0, "date": "${dateDisplay}", "description": ""},
        {"label": "אייקון היסטורי", "title": "", "year": 0, "date": "${dateDisplay}", "description": ""},
        {"label": "החלוץ", "title": "", "year": 0, "date": "${dateDisplay}", "description": ""}
      ]
    },
    {
      "id": "sports_records",
      "title": "ספורט ושיאים",
      "items": [
        {"label": "המשחק הגדול", "title": "", "year": 0, "date": "${dateDisplay}", "description": ""},
        {"label": "שובר השיאים", "title": "", "year": 0, "date": "${dateDisplay}", "description": ""},
        {"label": "מספר שפרש", "title": "", "year": 0, "date": "${dateDisplay}", "description": ""}
      ]
    },
    {
      "id": "literature_writing",
      "title": "ספרות וכתיבה",
      "items": [
        {"label": "יצירה קלאסית", "title": "", "year": 0, "date": "${dateDisplay}", "description": ""},
        {"label": "יום הולדת לסופר", "title": "", "year": 0, "date": "${dateDisplay}", "description": ""},
        {"label": "אירוע ספרותי", "title": "", "year": 0, "date": "${dateDisplay}", "description": ""}
      ]
    },
    {
      "id": "history_tech",
      "title": "היסטוריה וטכנולוגיה",
      "items": [
        {"label": "ההמצאה", "title": "", "year": 0, "date": "${dateDisplay}", "description": ""},
        {"label": "הגילוי", "title": "", "year": 0, "date": "${dateDisplay}", "description": ""},
        {"label": "ציון דרך בחלל", "title": "", "year": 0, "date": "${dateDisplay}", "description": ""}
      ]
    }
  ]
}

דרישות:
- כל פריט כולל כותרת, שנה, שדה date, ותיאור של 2–4 משפטים בעברית תקנית.
- כל שדה date חייב להיות בדיוק "${dateDisplay}".
- התוכן חייב להיות היסטורי, מדויק ואמיתי בלבד.
- אין להמציא עובדות. אם אין מידע ודאי, בחר אירוע אחר שכן מתועד.
- הימנע מהערות צד, מקורות, או ניסוחים בסגנון "ייתכן".
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

function validateDates(payload, dateDisplay) {
  if (!payload?.categories?.length) return false;
  return payload.categories.every((category) =>
    category.items.every((item) => item.date === dateDisplay)
  );
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
  const prompt = buildPrompt(dateDisplay);
  const repairPrompt = `החזר רק JSON תקני לפי המבנה המבוקש, ללא Markdown וללא טקסט נוסף. אין לשבור מחרוזות באמצע.
${prompt}`;

  console.log("[4ToDate] Fetching Gemini content", { dateDisplay });

  let lastError;

  for (const modelName of modelCandidates) {
    try {
      console.log("[4ToDate] Trying model", modelName);
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

      const firstText = await generateOnce(prompt, "primary");
      try {
        const data = parseJsonSafe(firstText);
        if (validateDates(data, dateDisplay)) {
          return data;
        }
        console.warn("[4ToDate] Date validation failed (primary)");
      } catch (error) {
        console.warn("[4ToDate] JSON parse failed (primary)");
        console.error("[4ToDate] Gemini raw response (primary)", firstText);
      }

      console.log("[4ToDate] Retrying with repair prompt");
      const retryText = await generateOnce(repairPrompt, "repair");
      try {
        const data = parseJsonSafe(retryText);
        if (validateDates(data, dateDisplay)) {
          return data;
        }
        console.warn("[4ToDate] Date validation failed (repair)");
      } catch (error) {
        console.error("[4ToDate] Gemini raw response (repair)", retryText);
        lastError = error;
      }
    } catch (error) {
      console.warn("[4ToDate] Model failed", modelName, error?.message);
      lastError = error;
    }
  }

  throw lastError || new Error("כל המודלים נכשלו.");
}

async function getCachedOrFresh() {
  const dateKey = getTodayKey();
  const cacheFile = path.join(CACHE_DIR, `${dateKey}.json`);

  if (fs.existsSync(cacheFile)) {
    console.log("[4ToDate] Cache hit", { cacheFile });
    const cached = fs.readFileSync(cacheFile, "utf-8");
    return JSON.parse(cached);
  }

  console.log("[4ToDate] Cache miss", { cacheFile });
  const data = await fetchTodayContent();
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

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`4ToDate running on http://localhost:${PORT}`);
});

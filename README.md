# 4ToDate

אתר "היום בהיסטוריה" בעברית (RTL) עם תוכן דינמי מבוסס Google Gemini.

## התקנה והפעלה

1. צור קובץ .env על בסיס .env.example והגדר GEMINI_API_KEY.
2. התקן תלויות:
   - npm install
3. הפעלה:
   - npm run dev
   - או npm start

## מבנה הפרויקט
- server.js — שרת Express ו־API עם Cache יומי
- public/ — קבצי Frontend (HTML/CSS/JS)
- data/cache/ — קבצי Cache יומיים

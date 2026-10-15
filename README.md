# Shoco Meet 🎥

אפליקציית פגישות וידאו בסגנון Zoom – עובדת ישירות בדפדפן, בלי התקנה ובלי שרת בתשלום.

**קישור לאפליקציה:** https://meet.shocoweb.com/ (עותק נוסף ב-GitHub Pages: https://haimnet08.github.io/shoco-meet/)

## איך משתמשים
1. פותחים את הקישור, כותבים שם ולוחצים **"הצטרף / צור חדר"** (קוד חדר ריק = חדר חדש).
2. לוחצים **"שתף בוואטסאפ"** (או "העתק קישור") ושולחים את הקישור, למשל `https://meet.shocoweb.com/?room=abc123`.
3. מי שמקבל לוחץ על הקישור, כותב שם ומצטרף – עובד ב-Chrome / Edge / Firefox / Safari, על Windows, Mac, Linux וגם בטלפון.

## יכולות
- וידאו ואודיו עם עד ~6 משתתפים (רשת mesh – כל משתתף מחובר ישירות לכל השאר)
- השתקה / כיבוי מצלמה
- צ'אט
- שיתוף מסך
- הקלטה מקומית – בוחרים לשונית/מסך להקלטה, האודיו של כל המשתתפים מעורבב, ובסיום יורד קובץ `webm`
- שליטה מרחוק במחשב אחר (ראו למטה)

## שליטה מרחוק 🖱️
דפדפן לא יכול לשלוט בעכבר/מקלדת של מחשב – לכן מי **שרוצים לשלוט במחשב שלו** מתקין את אפליקציית הדסקטופ:
1. מורידים את הגרסה מ-[Releases](https://github.com/haimnet08/shoco-meet/releases) (Windows `.exe`, Mac `.dmg`, Linux `.AppImage`).
2. פותחים, מכניסים את אותו קוד חדר ומצטרפים – האפליקציה משתפת את המסך הראשי אוטומטית.
3. השולט (מהדפדפן הרגיל) לוחץ על **"בקש שליטה"** על החלון של אותו משתתף (מסומן 🖥️).
4. במחשב הנשלט קופצת בקשת אישור – רק אחרי **"אשר שליטה"** העכבר והמקלדת מועברים.
5. לעצירה: "הפסק שליטה" אצל השולט, או סגירת האפליקציה במחשב הנשלט.

הערות: ב-Mac צריך לאשר לאפליקציה הרשאות **Screen Recording** ו-**Accessibility** בהגדרות המערכת. האפליקציות לא חתומות דיגיטלית, לכן Windows/Mac יציגו אזהרה בהתקנה הראשונה.

## איך זה עובד (טכני)
- אתר סטטי (HTML/JS) – תיקיית `web/`. מתארח ב-https://meet.shocoweb.com (שרת ה-VPS של שוקו, nginx + Let's Encrypt), ועותק ב-GitHub Pages.
- חיבור WebRTC ישיר בין הדפדפנים. ה-"שידוך" (signaling) נעשה דרך שרת PeerJS **שלנו** (`wss://meet.shocoweb.com/peerjs`, שירות systemd `shoco-meet-peer` על ה-VPS).
- ברשתות שבהן חיבור ישיר נכשל (רשתות ארגוניות, סלולר, NAT סימטרי) התעבורה עוברת דרך שרת **TURN** שלנו (coturn על אותו שרת, פורטים 3478/5349, TLS). פרטי הגישה ל-TURN מונפקים לכל משתתף ל-12 שעות דרך `https://meet.shocoweb.com/turn`.
- פריסה: `git push` ל-`main` ואז על ה-VPS `/opt/shoco-meet/bin/deploy.sh` (מושך מהריפו ומעתיק את `web/` לתיקיית האתר).
- הראשון שנכנס לחדר הוא "המארח" שמכיר לכולם את כולם; אם הוא יוצא, משתתפים חדשים לא יוכלו להצטרף לאותו חדר עד שמישהו יכנס מחדש (המשתתפים הקיימים ממשיכים).
- אפליקציית הדסקטופ (`desktop/`) היא Electron שמריצה את אותו אתר, ומבצעת אירועי עכבר/מקלדת עם `@nut-tree-fork/nut-js`.

## פיתוח
```bash
cd web && python3 -m http.server 8000      # http://localhost:8000
cd desktop && npm install && npm start     # אפליקציית דסקטופ
```
בניית התקנות: דוחפים תג `v1.0.0` → GitHub Actions בונה ל-Windows/Mac/Linux ומצרף ל-Release.

---
*English:* Static WebRTC meeting app (PeerJS + GitHub Pages) with chat, screen share, local recording, and an Electron desktop companion for consent-based remote control.

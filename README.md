# KEYPLAN (คีย์แปลน) · beta

PLAN · PRICE · YOUR HOME — เว็บแอปสำหรับนักออกแบบภายในและสถาปนิก: อัปโหลดแปลน → วางหมุดรายการพร้อมรหัส (F-01, BI-01, L-01 …) → จัดการสเปค ราคา และสถานะ → BOQ แยกตามหมวด + VAT 7% → Export **PDF A3** และ Excel

ต่อยอดจาก Light Theory (แพลตฟอร์มออกแบบแสง) โดยขยายจากงานไฟอย่างเดียวเป็นวัสดุและครุภัณฑ์ทุกหมวด และใช้ CI ตาม KEYPLAN Web App Guidelines v1.0 (`docs/Keyplan brand identity system.pdf`, `docs/design-handoff.md`, `reference/`)

**Beta นี้ยังไม่มีระบบสมัครสมาชิกและการชำระเงิน**: ผู้ดูแลคนแรกสร้างบัญชีตอนเปิดครั้งแรก แล้วเพิ่มบัญชีทีมเองที่เมนู “ทีม / บัญชี”

## ฟีเจอร์
- **หมวดหมู่วัสดุ**: 12 หมวดมาตรฐานตามคู่มือ (F เฟอร์นิเจอร์, BI บิวท์อิน, L ไฟ, S วัสดุปิดผิว, P สี, PL สุขภัณฑ์/ประปา, H ฮาร์ดแวร์, EQ อุปกรณ์, CT เคาน์เตอร์ท็อป, D ของตกแต่ง, SG ป้าย, G กราฟิก) และ **เพิ่มหมวดของสตูดิโอได้ไม่จำกัด** ที่เมนู “หมวดหมู่วัสดุ” (ผู้ดูแล): ตัวนำหน้ารหัส, ชื่อไทย/อังกฤษ, หน่วยเริ่มต้น, ไอคอน, วิธีนับจำนวน
- ตัวนำหน้าของหมวดไม่ซ้ำ เปลี่ยนไม่ได้ และใช้ซ้ำไม่ได้แม้เก็บหมวดถาวรแล้ว
- **รหัสรายการ** `PREFIX-NN` ต่อโปรเจกต์ รหัสของรายการที่ลบแล้วจะไม่ถูกออกใหม่
- **จำนวน**: นับจากหมุด/เส้นบนแปลน หรือกรอกเอง (หมวดงานพื้นที่/ความยาว เช่น S, P, CT, G กรอกเองเสมอ) ทศนิยมได้ 2 ตำแหน่ง
- **สถานะรายการ**: ร่าง, เสนอราคาแล้ว, อนุมัติ, สั่งซื้อแล้ว, ส่งถึงหน้างาน, มีปัญหา (สี + จุด + คำ)
- แปลนหลายชั้น รับ PNG/JPG/PDF · ตั้งสเกลจาก 2 จุด · Undo/Redo · เลือกหลายจุด
- **งานไฟ (หมวด L)** คงเครื่องมือจาก Light Theory: สัญลักษณ์โคม, วัตต์/K/IP, โยงวงจร, Lighting Load Schedule (หมวดอื่นโยงวงจรไม่ได้)
- คลังสินค้ากลางข้ามโปรเจกต์ แยกตามหมวด พร้อมอัปเดตจากคลัง/ส่งกลับคลัง
- BOQ / ใบเสนอราคาแยกหมวดพร้อมยอดรวมหมวด, ส่วนลด, ค่าติดตั้ง, VAT · ราคาว่างได้ (“รอราคา”)
- PDF A3: ปก, แปลน + Legend, สเปคชีท, (วงจรและ Load Schedule ถ้ามีงานไฟ), ใบเสนอราคา · Excel BOQ

## รันบนเครื่อง
ใช้ Node 22 (ตรงกับ Dockerfile) ถ้าเครื่องมี Node รุ่นอื่น ใช้ `npx -y -p node@22 -- <คำสั่ง>`
```bash
npm install
npm run build        # สร้างหน้าเว็บ
npm start            # http://localhost:3000  (ครั้งแรกจะให้สร้างบัญชีผู้ดูแล)
npm run seed:demo    # (ไม่บังคับ) โปรเจกต์ตัวอย่างสมมติ [PLACEHOLDER] Residence หลายหมวด
```
พัฒนาแบบ hot-reload: `npm run dev:server` และ `npm run dev:web` (เปิด http://localhost:5173)
ทดสอบ: `npm test` · ตรวจชนิดข้อมูล: `npm run typecheck`
ต้องมี `poppler-utils` ถ้าจะอัปโหลดแปลนเป็น PDF (มีใน Docker แล้ว)

## Deploy ทดสอบบน Railway
ข้อมูลทั้งหมดอยู่ใน `DATA_DIR` (SQLite + รูปที่อัปโหลด) จึง **ต้องผูก Volume** ไม่งั้นข้อมูลหายตอน deploy ใหม่ แยกเป็น service ใหม่ ไม่ใช้ร่วมกับ Light Theory

1. สร้าง repo ส่วนตัวบน GitHub แล้ว push โค้ดนี้ขึ้นไป (`main`)
2. railway.com → **New Project** → **Deploy from GitHub repo** → เลือก repo นี้ (Railway อ่าน `railway.json` และ build จาก `Dockerfile`)
3. Service → **Settings** → Region: Southeast Asia (Singapore)
4. แท็บ **Volumes** → Add Volume → Mount path: `/data`
5. แท็บ **Variables** → `SESSION_SECRET` = ค่าสุ่มยาว ๆ สร้างในเครื่องตัวเองด้วย
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` ห้ามเปลี่ยนภายหลัง (ทุกคนจะหลุดจากระบบ)
6. **Settings → Networking → Generate Domain** → เปิดลิงก์ → สร้างบัญชีผู้ดูแลคนแรก **ทันที** (ใครเปิดลิงก์ก่อนจะได้เป็นผู้ดูแล)
7. เช็ก: `https://<โดเมน>/healthz` ต้องตอบ `{"ok":true}`

push ขึ้น `main` ทุกครั้ง = Railway build และ deploy ใหม่อัตโนมัติ ฐานข้อมูลอัปเกรด schema เองตอนเปิดเซิร์ฟเวอร์โดยข้อมูลเดิมไม่หาย

## ตัวแปรสภาพแวดล้อม
| ชื่อ | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `DATA_DIR` | `data` (Docker: `/data`) | ที่เก็บฐานข้อมูล + ไฟล์อัปโหลด |
| `SESSION_SECRET` | สร้างเองและเก็บใน `DATA_DIR/.session-secret` | กุญแจเซ็นคุกกี้ล็อกอิน |
| `COOKIE_SECURE` | `1` ใน Docker | `1` = ส่งคุกกี้เฉพาะ HTTPS · ตั้ง `0` ถ้าใช้ http |
| `PORT` | `3000` | พอร์ต |

## สำรองข้อมูล
คัดลอกโฟลเดอร์ `DATA_DIR` ทั้งหมด (หรือ Volume backup ของ Railway) ไฟล์สำคัญคือ `app.db` และ `uploads/`

## โครงสร้างโค้ด
```
shared/   ชนิดข้อมูล, หมวดและหน่วย (categories.ts), สัญลักษณ์, สูตร BOQ / Load Schedule, CI (brand.ts, brand-assets.ts)
server/   Fastify API, SQLite + migration, ล็อกอิน, หมวด (categories.ts), PDF (pdfkit), Excel
web/      React + Vite: แปลน, รายการ, BOQ, คลังสินค้า, หมวดหมู่วัสดุ
tests/    คำนวณ + API + การอัปเกรดฐานข้อมูล
scripts/  build-fonts.ts (TTF สำหรับ PDF), extract-brand.ts (โลโก้/ไอคอนจาก reference/brand)
```

## ยังไม่ได้ทำ (ต่อจาก beta)
ระบบสมาชิกและการชำระเงิน · ต้นทุน/markup/กำไร (เห็นเฉพาะเจ้าของ) · FF&E Schedule A4/A3 · Material / Mood board · Presentation 1920×1080 · เลขใบเสนอราคา QT-YYYY-NNNN

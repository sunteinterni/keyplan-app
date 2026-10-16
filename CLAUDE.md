# Lighting Platform (Light Theory)

เว็บแพลตฟอร์มสำหรับทีมออกแบบแสงสว่าง อ่าน README.md สำหรับวิธีรันและรายละเอียดเพิ่มเติม

## Stack และโครงสร้าง
- Fastify 5 + SQLite (better-sqlite3) + React 19 + Vite + TypeScript, PDF ด้วย pdfkit, Excel ด้วย exceljs
- `shared/` ชนิดข้อมูล (types.ts), สัญลักษณ์ (symbols.ts), สูตร BOQ / Load Schedule (calc.ts)
- `server/` API (routes.ts), ล็อกอิน (auth.ts), DB (db.ts), ไฟล์/แปลง PDF (files.ts), pdf.ts, xlsx.ts, seed-demo.ts
- `web/src/` UI (pages/, ui.tsx, api.ts)
- `tests/` เทสต์ (node test runner ผ่าน tsx)

## คำสั่ง
- `npm run typecheck` · `npm test` · `npm run build && npm start`
- `npm run seed:demo` สร้างโปรเจกต์ตัวอย่างสมมติ "[PLACEHOLDER] Residence" (แปลนวาดขึ้นในสคริปต์ ไม่มีข้อมูลลูกค้าใน repo)
- `npm run dev:server` + `npm run dev:web` สำหรับพัฒนา
- `npm run fonts` สร้าง TTF ใน `server/fonts` ใหม่จาก @fontsource (รายชื่อฟอนต์อยู่ที่ `server/fonts.ts` ที่เดียว) — ข้อความใน PDF ใช้ `txt(..., { family: 'display' | 'serif' | 'hand' })`

## กติกา
- ข้อความใน UI และ PDF เป็นภาษาไทย ใช้ฟอนต์ IBM Plex Sans Thai (TTF ใน `server/fonts`)
- สัญลักษณ์โคมอยู่ที่ `shared/symbols.ts` ที่เดียว ใช้ร่วมกันทั้ง SVG บนเว็บและ PDF ห้ามวาดซ้ำที่อื่น
- แก้อะไรที่กระทบ PDF: สร้าง PDF จากข้อมูลตัวอย่างแล้วเปิดดูหน้าจริงทุกครั้ง (เช่นอ่านไฟล์ PDF ด้วย Read ทีละหน้า) ไม่ใช่แค่ดูว่าไม่มี error
- แก้สูตรคำนวณหรือ API ต้องเพิ่ม/แก้เทสต์ใน `tests/` และรัน `npm run typecheck && npm test` ให้ผ่านก่อน commit
- ราคาโคมว่างได้ แสดงเป็น "รอราคา" ห้ามบังคับกรอก และสูตรรวมเงินต้องรองรับค่าว่าง
- การเปลี่ยน schema DB ต้องเป็น migration ใน `server/schema.ts` ที่รันกับฐานข้อมูลเดิมได้โดยข้อมูลไม่หาย
- การแก้ไขบนแปลนใน PlanTab ต้องเรียกผ่าน `edit()` (web/src/history.ts) ไม่เรียก api ตรง เพื่อให้ Undo/Redo ครอบคลุม; ข้อยกเว้นที่ตั้งใจ: เพิ่ม/ลบชั้น, อัปโหลดแปลน, สร้าง/เปลี่ยนชื่อวงจร
- แก้เป็นขั้นเล็ก ๆ และ commit ทีละเรื่อง ข้อความ commit สั้น บอกว่าเปลี่ยนอะไร
- ก่อนเริ่มฟีเจอร์ใหม่ สรุปแผนสั้น ๆ และถามเจ้าของงานถ้ามีจุดที่ต้องตัดสินใจเรื่องการใช้งานหรือหน้าตา

## CI ของ Light Theory (เว็บและ PDF)
- สีแบรนด์: Ink #141414, Filament #FF4F1F, Beam #FFD23F, Plaster #ECEAE3 กำหนดเป็นค่ากลางที่เดียว (CSS variables + ค่าคงที่ใน shared/) ห้ามพิมพ์ hex ซ้ำตามไฟล์
- ความคมชัด: Filament และ Beam ห้ามใช้เป็นสีตัวอักษรบน Plaster/ขาว และห้ามใช้ตัวอักษรขาวบน Filament (ไม่ถึง 4.5:1) ให้ใช้เป็นแถบ/เส้นใต้/จุด/พื้นหลังที่มีตัวอักษร Ink
- ฟอนต์: Schibsted Grotesk (wordmark/display 800 letter-spacing -6%, headline 700 -4% เฉพาะข้อความละติน; หัวข้อไทยใช้ Plex Sans Thai 600 ไม่บีบ), Instrument Serif italic (ใช้น้อย), Mali (โน้ตลายมือ), IBM Plex Sans Thai (เนื้อหาและภาษาไทยทั้งหมด), IBM Plex Mono (ตัวเลข/รหัส/ป้ายเล็ก) ใน PDF ใช้ไฟล์ TTF ใน `server/fonts`
- โลโก้บริษัทวาดเป็นเวกเตอร์จาก path ใน shared/ ที่เดียว ใช้ทั้ง SVG บนเว็บและ doc.path ใน PDF
- บนแปลนใช้เฉพาะสีใช้งาน แดง #E10600 / น้ำเงิน #1030E8 / เขียว #0E9F3E ห้ามเปลี่ยนและห้ามใส่สีแบรนด์หรือลายเส้นตกแต่งลงบนแปลน ยกเว้นเส้นโยงวงจรซึ่งเป็นสีดำเข้ม (Ink) ทุกวงจร แยกวงจรด้วยป้ายชื่อ
- ป้ายรหัสบนแปลนใช้ `LABEL_COLORS` (เขียว #0B7A30 เฉพาะตัวอักษร ได้ 5.5:1) สัญลักษณ์ยังใช้ `COLORS` (เขียว #0E9F3E) ตามเดิม; ปุ่มที่ disabled ได้รับการยกเว้นความคมชัดตาม WCAG
- Graphic language (คู่มือ v1.0 หน้า 07): MOTIFS ใน brand.ts (spark, ring, beam, glow, strip, note) เส้นหนา STROKE 2.5 / 4.5 / 7 เท่านั้น, ไม่เกิน 2 ชิ้นต่อหน้า, Filament เฉพาะส่วนที่สว่าง; ใช้เฉพาะหน้าล็อกอิน empty state และหน้าปก PDF
- PDF (คู่มือหน้า 08): พื้นกระดาษ TONES.paper, แปลน/การ์ด/แถวตารางพื้นขาว, ตัวเลขและรหัสใช้ Mono, ป้ายเล็ก T.label (Mono UPPERCASE +10%), ยอดรวมขึ้นต้น ฿
- รหัสโคมรูปแบบ PREFIX-NN (DL-01, WL-01, EX-01 …) ผู้ใช้เลือกตัวนำหน้าเอง; ระบบตั้งเลขด้วย nextCode() ใน shared/library.ts ห้ามแปลงรหัสเดิมของโปรเจกต์
- ห้ามใส่ข้อมูลจริงของลูกค้าหรือบริษัทในโค้ดหรือข้อมูลตัวอย่าง ใช้ [PLACEHOLDER]

## ข้อควรรู้เรื่องเครื่องที่ใช้พัฒนา (Windows)
- โฟลเดอร์โปรเจกต์อยู่ใน OneDrive: ระวังไฟล์ SQLite ใน `data/` ถูก sync ระหว่างเขียน
- เครื่องนี้ยังไม่มี Docker และ poppler (`pdftoppm`) การอัปโหลดแปลน PDF จะใช้ได้เฉพาะใน Docker/เซิร์ฟเวอร์ที่ติดตั้ง poppler-utils
- ใช้ Node 22 (ตรงกับ Dockerfile) Node 25 ที่ติดตั้งในเครื่องไม่มีไฟล์สำเร็จรูปของ better-sqlite3 และเครื่องไม่มี Visual Studio Build Tools
- better-sqlite3 ล็อกไว้ที่ 12.x เพราะรุ่น 13 เลิกแจกไฟล์สำเร็จรูป ต้องคอมไพล์เองทุกครั้ง
- ดูหน้า PDF เป็นภาพโดยไม่ใช้ poppler: ใช้ npm package `mupdf` (WASM) แปลงหน้าเป็น PNG
- หลัง `npm run build` ต้องรีสตาร์ท `npm start` เพราะ @fastify/static (wildcard: false) จำรายชื่อไฟล์ตอนเปิดเซิร์ฟเวอร์ ไม่อย่างนั้นหน้าเว็บจะว่าง
- ถ่ายภาพหน้าเว็บอัตโนมัติ: puppeteer-core + Edge ที่มีในเครื่อง (`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`)
- Deploy อยู่บน Railway (ดู README) push ขึ้น `main` = deploy production ทันที

# KEYPLAN (คีย์แปลน) · beta app

เว็บแอปแปลน + รายการวัสดุ + ราคา สำหรับนักออกแบบภายในและสถาปนิก ต่อยอดจาก Light Theory (`../Lighting Platform`) อ่าน README.md สำหรับวิธีรันและ deploy

## Stack และโครงสร้าง
- Fastify 5 + SQLite (better-sqlite3) + React 19 + Vite + TypeScript, PDF ด้วย pdfkit, Excel ด้วย exceljs
- `shared/` ชนิดข้อมูล (types.ts), หมวดและหน่วย (categories.ts), สัญลักษณ์ (symbols.ts), สูตร (calc.ts), CI (brand.ts), โลโก้/ไอคอน (brand-assets.ts สร้างอัตโนมัติ)
- `server/` API (routes.ts, categories.ts, library.ts), ล็อกอิน (auth.ts), DB (db.ts, schema.ts), pdf.ts, xlsx.ts, seed-demo.ts
- `web/src/` UI (pages/, ui.tsx, api.ts) · `tests/` (node test runner ผ่าน tsx)

## คำสั่ง
- ใช้ Node 22: `npx -y -p node@22 -- npm test` (Node ในเครื่องเป็นรุ่น 25 ซึ่งไม่มี better-sqlite3 สำเร็จรูป)
- `npm run typecheck` · `npm test` · `npm run build && npm start` (หลัง build ต้องรีสตาร์ท start)
- `npm run seed:demo` · `npm run fonts` (TTF ของ PDF) · `npm run brand` (สร้าง shared/brand-assets.ts และ web/public/brand จาก reference/brand)

## กติกา
- ข้อความใน UI และ PDF ไทยก่อน อังกฤษรอง ภาษาตรง กระชับ ไม่มีอีโมจิ ไม่มีเครื่องหมายตกใจ
- **หมวด**: 12 หมวดมาตรฐานอยู่ใน `shared/categories.ts` (seed ผ่าน migration) หมวดของสตูดิโอเพิ่มผ่าน API/หน้า “หมวดหมู่วัสดุ” ตัวนำหน้าไม่ซ้ำ เปลี่ยนไม่ได้ ใช้ซ้ำไม่ได้ (เก็บถาวร ไม่ลบ)
- **รหัส** `PREFIX-NN` ด้วย `nextCode()` นับรหัสใน `retired_codes` ด้วยเสมอ รหัสของรายการที่ลบแล้วห้ามออกใหม่ ห้ามแปลงรหัสเดิมของโปรเจกต์
- **จำนวน**: หมวด `qty_mode = manual` (S, P, CT, G) ไม่เอาจำนวนจากหมุด ใช้ `qty_manual` เท่านั้น หมวดอื่นใช้จำนวนบนแปลน เว้นแต่กรอก `qty_manual` ทับ
- **งานไฟ** (หมวด L) เท่านั้นที่มีวัตต์/K/IP วงจรและ Load Schedule เซิร์ฟเวอร์ปฏิเสธการโยงวงจรของหมวดอื่น
- ราคาว่างได้ แสดง “รอราคา” สูตรรวมเงินต้องรองรับค่าว่าง
- เปลี่ยน schema = migration ใหม่ใน `server/schema.ts` ที่รันกับฐานข้อมูลเดิมได้โดยข้อมูลไม่หาย (มีเทสต์อัปเกรดจาก schema 4 ของ Light Theory)
- แก้สูตรหรือ API ต้องเพิ่ม/แก้เทสต์ และรัน typecheck + test ผ่านก่อน commit
- แก้อะไรที่กระทบ PDF: สร้าง PDF จากโปรเจกต์ตัวอย่างแล้วเปิดดูหน้าจริง (แปลงเป็น PNG ด้วย npm package `mupdf`)
- การแก้ไขบนแปลนใน PlanTab เรียกผ่าน `edit()` (web/src/history.ts) เพื่อให้ Undo/Redo ครอบคลุม
- ห้ามใส่ข้อมูลจริงของลูกค้าในโค้ดหรือข้อมูลตัวอย่าง ใช้ [PLACEHOLDER]
- ก่อนเริ่มฟีเจอร์ใหม่ สรุปแผนสั้น ๆ และถามเจ้าของงานถ้ามีจุดที่ต้องตัดสินใจ

## CI ของ KEYPLAN (Web App Guidelines v1.0)
- ค่าสีอยู่ที่ `shared/brand.ts` ที่เดียว (CSS variables `--kp-*`) ห้ามพิมพ์ hex ซ้ำตามไฟล์ ยกเว้น styles.css ที่อ่านจากตัวแปร
- Light only: หน้า Canvas #F5F1E8, พื้นที่ทำงานสีขาว, Charcoal #1F1F1F ใช้เป็นตัวอักษรและเส้นเท่านั้น ห้ามพื้นเข้มใหญ่กว่าชิป
- Terracotta #E6765D และ Sage #829B82 เป็นสีพื้นเท่านั้น ตัวอักษรใช้ Terracotta Deep #A9432B / Sage Deep #4A614A · Terracotta 1 จุดเน้นต่อหน้า
- เส้น 1.5 px Charcoal, เส้นแบ่งแถว 1 px Beige, radius 2 px (ปุ่ม/ช่อง/ชิป) 4 px (การ์ด/ตาราง), เงาแบบ offset ทึบเฉพาะเมนู/โมดัล
- ฟอนต์: Manrope (หัวข้ออังกฤษ), IBM Plex Sans Thai (ไทย เนื้อหา ตาราง), IBM Plex Mono (รหัส ตัวเลข) ตัวเลขชิดขวา
- สถานะใช้สี + จุด + คำเสมอ (`STATUS_STYLE`) · ปุ่มสูง ≥ 44 px · focus ring Terracotta 3 px
- โลโก้และไอคอนหมวดวาดจาก `shared/brand-assets.ts` (มาจาก SVG ทางการ) ห้ามพิมพ์หรือวาด wordmark เอง ต่ำกว่า 160 px ใช้สัญลักษณ์อย่างเดียว
- บนแปลนใช้เฉพาะสีใช้งาน แดง #E10600 / น้ำเงิน #1030E8 / เขียว #0E9F3E (ป้ายรหัสเขียวใช้ #0B7A30) ห้ามใส่สีแบรนด์บนแปลน

## ข้อควรรู้เรื่องเครื่องที่ใช้พัฒนา (Windows)
- โฟลเดอร์อยู่ใน OneDrive: ระวังไฟล์ SQLite ใน `data/` ถูก sync ระหว่างเขียน
- เครื่องไม่มี Docker, poppler และ gh CLI · push ใช้ git credential manager
- Deploy บน Railway (ดู README) push ขึ้น `main` = deploy ทันที

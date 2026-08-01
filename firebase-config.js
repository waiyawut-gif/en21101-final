/* =========================================================
   FIREBASE CONFIG — ต้องตั้งค่านี้ก่อนใช้ระบบล็อกอิน/แดชบอร์ดแอดมิน
   =========================================================

   ขั้นตอนตั้งค่า (ทำครั้งเดียว ใช้เวลาประมาณ 5 นาที):

   1. ไปที่ https://console.firebase.google.com/ แล้ว "Add project"
      (ใช้ Google account ที่มีอยู่แล้วก็ได้ ไม่มีค่าใช้จ่าย)

   2. ในโปรเจกต์ที่สร้าง ไปที่ Build > Firestore Database
      กด "Create database" เลือก "Start in test mode" (เลือก location
      ที่ใกล้ที่สุด เช่น asia-southeast1) แล้วกด Enable

   3. ไปที่ Project settings (ไอคอนเฟือง) > General > เลื่อนลงมาที่
      "Your apps" > กดไอคอน "</>" (Web) เพื่อสร้าง Web App ใหม่
      ตั้งชื่อ (เช่น "english-dashboard") แล้วกด Register app

   4. Firebase จะโชว์ค่า config มาให้ (หน้าตาคล้ายด้านล่าง) — คัดลอกมา
      แทนที่ค่าตัวอย่างในไฟล์นี้ทั้งหมด:

      const firebaseConfig = {
        apiKey: "AIzaSy...",
        authDomain: "your-project.firebaseapp.com",
        projectId: "your-project",
        storageBucket: "your-project.appspot.com",
        messagingSenderId: "1234567890",
        appId: "1:1234567890:web:abcdef123456"
      };

   5. ไปที่ Firestore Database > Rules แล้ววางกฎนี้ (เปิดให้อ่าน/เขียน
      คอลเลกชัน "students" ได้ทุกคน — เหมาะสำหรับใช้ในห้องเรียนที่ไว้ใจกัน
      เท่านั้น ไม่มีการยืนยันตัวตนจริงในระบบนี้ นักเรียนที่เปิด DevTools
      เป็นจะสามารถแก้ไขข้อมูลของคนอื่นได้ในทางเทคนิค):

      rules_version = '2';
      service cloud.firestore {
        match /databases/{database}/documents {
          match /students/{studentId} {
            allow read, write: if true;
          }
        }
      }

   6. Save ไฟล์นี้ แล้ว deploy ขึ้น GitHub Pages / Netlify ตามปกติ
========================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyBqumNX5VHEtZ8_umEk1wZ-9IFQkBzadms",
  authDomain: "en21101-final.firebaseapp.com",
  projectId: "en21101-final",
  storageBucket: "en21101-final.firebasestorage.app",
  messagingSenderId: "643584570375",
  appId: "1:643584570375:web:8572480b8b2b17b29866a2",
};

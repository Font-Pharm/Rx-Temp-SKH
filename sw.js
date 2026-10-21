// Service worker ของหน้าห่อ: ทำให้ Android ติดตั้งเป็นแอปได้
// เก็บเฉพาะไฟล์ของหน้าห่อไว้ในเครื่อง ไม่แตะข้อมูลของระบบ (หน้า Apps Script ในกรอบโหลดจาก Google ทุกครั้ง)
const CACHE = 'temp-logging-shell-v2'; // เปลี่ยนเลขเวอร์ชันเมื่อเปลี่ยนไอคอน เพื่อให้เครื่องที่ติดตั้งแล้วโหลดใหม่
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './favicon-32.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ใช้เน็ตก่อนเสมอ (ได้ไฟล์ล่าสุดเมื่อแก้บน GitHub) ถ้าออฟไลน์ค่อยใช้สำเนาในเครื่อง
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});

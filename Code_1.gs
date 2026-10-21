/**
 * ระบบบันทึกอุณหภูมิและแดชบอร์ด กลุ่มงานเภสัชกรรม โรงพยาบาลศีขรภูมิ
 * Spreadsheet ID: 1dVdxlzTGyVaIJaduI_uJ85XF5q6BnexiGUWDE3g5Yk8
 *
 * ฟังก์ชันที่หน้าเว็บเรียกผ่าน google.script.run ได้: getAppConfig, saveData, getDashboardData
 * ฟังก์ชันที่ชื่อลงท้ายด้วย _ เป็นฟังก์ชันภายใน หน้าเว็บเรียกตรงไม่ได้
 *
 * ชีต "ตั้งค่า" (ระบบสร้างให้อัตโนมัติเมื่อเปิดใช้งานครั้งแรก พร้อมค่าปัจจุบันทั้งหมด)
 *   คอลัมน์: ประเภท | ชื่อ | รายละเอียด | สีกราฟ | ใช้งาน
 *   - ห้องยา    : ชื่อ = ชื่อห้องยา, รายละเอียด = ห้องยาหลักที่สังกัด (ใส่เฉพาะจุดย่อย เช่น Sub-Stock)
 *                 เว้นว่าง = เป็นห้องยาหลัก (1 กลุ่มในหน้ารายงาน)
 *   - ตู้เย็น    : ชื่อ = ชื่อตู้เย็น, รายละเอียด = ห้องยาที่ตู้นี้สังกัด, สีกราฟ = รหัสสี เช่น #3b82f6
 *   - ช่วงเวลา  : ชื่อ = ข้อความเวร เช่น "09.00 น. (เวรเช้า)" (เรียงตามลำดับแถว)
 *   - ผู้บันทึก  : ชื่อ = ชื่อ-นามสกุล, รายละเอียด = ตำแหน่ง/กลุ่ม
 *   - เกณฑ์     : ชื่อ = ชื่อเกณฑ์ (ห้ามแก้ข้อความ), รายละเอียด = ตัวเลข
 *   เอาเครื่องหมายช่อง "ใช้งาน" ออกเพื่อปิดรายการโดยไม่ต้องลบแถว
 *   ข้อควรระวัง: ห้ามเปลี่ยนชื่อห้องยา/ตู้เย็น/ช่วงเวลาที่มีข้อมูลเก่าแล้ว เพราะระบบจับคู่ข้อมูลด้วยชื่อ
 *
 * ชีตข้อมูลแยกตามปีงบประมาณ (1 ต.ค. – 30 ก.ย.) ชื่อ "ข้อมูลปีงบประมาณ 2570" เป็นต้น
 *   - ระบบสร้างชีตปีใหม่ให้เองเมื่อมีการบันทึกวันที่ 1 ตุลาคมเป็นต้นไป
 *   - การตรวจบันทึกซ้ำและการดึงข้อมูลอ่านเฉพาะชีตของปีงบที่เกี่ยวข้อง ระบบจึงไม่ช้าลงตามจำนวนปี
 *   - ชีตเดิม "เก็บข้อมูลทั้งหมด" (ถ้ามี) ถูกคัดลอกแยกตามปีงบครั้งเดียว แล้วเก็บไว้เป็นสำรอง ไม่ถูกเขียนเพิ่ม
 */

const TARGET_SHEET_ID = "1dVdxlzTGyVaIJaduI_uJ85XF5q6BnexiGUWDE3g5Yk8";
const LEGACY_DATA_SHEET_NAME = "เก็บข้อมูลทั้งหมด"; // ชีตเดิมก่อนแยกปีงบ (เก็บไว้เป็นสำรอง)
const FY_SHEET_PREFIX = "ข้อมูลปีงบประมาณ ";
const DATA_LAYOUT_KEY = "DATA_LAYOUT";
const DATA_LAYOUT_VERSION = "fiscal-year-1";
const CONFIG_SHEET_NAME = "ตั้งค่า";

// โครงสร้างชีตข้อมูล (คงเดิมเพื่อให้ข้อมูลเก่าใช้ต่อได้)
const DATA_HEADERS = ["Timestamp", "ประเภทแบบฟอร์ม", "วันที่บันทึก", "ช่วงเวลา", "ชื่อห้องยา/ตู้เย็น", "อุณหภูมิ(C)", "ความชื้น(%RH)", "ผู้บันทึก"];
const DATA_KEYS = ["timestamp", "formType", "date", "time", "location", "temp", "humidity", "staff"];
const FORM_TYPE_LABEL = { room: "ห้องยา", fridge: "ตู้เย็น" };

const CONFIG_HEADERS = ["ประเภท", "ชื่อ", "รายละเอียด", "สีกราฟ", "ใช้งาน"];
const CONFIG_TYPE = { ROOM: "ห้องยา", FRIDGE: "ตู้เย็น", TIME: "ช่วงเวลา", STAFF: "ผู้บันทึก", THRESHOLD: "เกณฑ์" };
const THRESHOLD_LABELS = {
  roomTempMin: "ห้องยา อุณหภูมิต่ำสุด (°C)",
  roomTempMax: "ห้องยา อุณหภูมิสูงสุด (°C)",
  roomHumMax: "ห้องยา ความชื้นสูงสุด (%RH)",
  fridgeTempMin: "ตู้เย็น อุณหภูมิต่ำสุด (°C)",
  fridgeTempMax: "ตู้เย็น อุณหภูมิสูงสุด (°C)"
};

// ช่วงค่าที่เป็นไปได้จริงทางกายภาพ ใช้กันพิมพ์ผิด (ไม่ใช่เกณฑ์มาตรฐาน)
const PLAUSIBLE_RANGE = { tempMin: -40, tempMax: 60, humMin: 0, humMax: 100 };
const MAX_RANGE_DAYS = 400;
const LOCK_WAIT_MS = 15000;

// เวอร์ชันของชีตตั้งค่า ใช้อัปเกรดชีตเดิมอัตโนมัติครั้งเดียว (ดู migrateConfig_)
const CONFIG_VERSION = 2;
const CONFIG_VERSION_KEY = "CONFIG_VERSION";
const PREMIUM_ROOM = "ห้องยา Premium 5/2 (OPD P.5/2)";
const PREMIUM_FRIDGE = "OPD P.5/2 - No. 1";

const DEFAULT_PHARMACY_TECHS = [
  "ชโลบล ทองมาน", "ธวัลรัตน์ ดีนาน", "นิตยา สานุสันต์", "วณิดา มีแก้ว", "วนิดา วรางกูร",
  "ศิรินภา พวงลัดดา", "สุญาดา อัลมาด", "สุพัฒน์ ประชุมฉลาด", "สุภาดา นิสัยกล้า",
  "สุภาวดี เหมือนชอบ", "โสรยา โสรเนตร"
];
const DEFAULT_OTHER_STAFF = [
  "กัลยาณี สมัครสมาน", "ชลวุฒิ ลับโกษา", "ณัฐณิชา โกติรัมย์", "ดวงนภา พลอำนวย", "นิตยา ไชยพร",
  "ปรางทิพย์ เทศแจ่ม", "วรินทร สมัครสมาน", "วรรณนิศา สมัครสมาน", "วรรณิศา ศรชัย", "วัชพล รพีพัฒนา",
  "สัญชัย สิงหาภู", "สายชล ชัยศรี", "สุชาติ แผ่นจันทร์", "หัทยา เพชรทโน", "อรพรรณ จันทร์ศิริ",
  "อภิวัฒน์ พูนดี", "อภิสิทธิ์ สุยังกุล", "อัจฉรียา ปาณาราช", "เอเชีย สุขเฉลิม"
];

const DEFAULT_CONFIG = {
  rooms: [
    "ห้องยานอกเบอร์ 7 (OPD 7)",
    "ห้องยา 5/1 (OPD 5/1)",
    "Sub-Stock OPD 5/1",
    "Sub-Stock OPD 7",
    "ห้องยาในเบอร์ 7 (IPD 7)",
    PREMIUM_ROOM
  ],
  // จุดย่อย → ห้องยาหลัก (ใช้จัดกลุ่มในหน้ารายงาน)
  roomParents: {
    "Sub-Stock OPD 5/1": "ห้องยา 5/1 (OPD 5/1)",
    "Sub-Stock OPD 7": "ห้องยานอกเบอร์ 7 (OPD 7)"
  },
  fridges: [
    { name: "OPD 7 - Hitachi", room: "ห้องยานอกเบอร์ 7 (OPD 7)", color: "#eab308" },
    { name: "OPD 7 - Samsung", room: "ห้องยานอกเบอร์ 7 (OPD 7)", color: "#22c55e" },
    { name: "OPD 5/1 - No. 5", room: "ห้องยา 5/1 (OPD 5/1)", color: "#0ea5e9" },
    { name: "IPD 1 - Toshiba", room: "ห้องยาในเบอร์ 7 (IPD 7)", color: "#3b82f6" },
    { name: "IPD 2 - Mitsubishi", room: "ห้องยาในเบอร์ 7 (IPD 7)", color: "#a855f7" },
    { name: PREMIUM_FRIDGE, room: PREMIUM_ROOM, color: "#f97316" }
  ],
  times: ["00.30 น. (เวรดึก)", "09.00 น. (เวรเช้า)", "15.00 น. (เวรเช้า)", "20.00 น. (เวรบ่าย)"],
  staff: DEFAULT_PHARMACY_TECHS.map(function (n) { return { name: n, group: "เจ้าพนักงานเภสัชกรรม" }; })
    .concat(DEFAULT_OTHER_STAFF.map(function (n) { return { name: n, group: "เจ้าหน้าที่" }; })),
  thresholds: { roomTempMin: 15, roomTempMax: 25, roomHumMax: 60, fridgeTempMin: 2, fridgeTempMax: 8 }
};

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('ระบบบันทึกอุณหภูมิและแดชบอร์ด - เภสัชกรรม')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL) // คงไว้เพื่อให้ฝังใน Google Sites ได้
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* =========================================================
 * ฟังก์ชันที่หน้าเว็บเรียกใช้
 * ========================================================= */

/** ส่งค่าตั้งค่าทั้งหมด (ห้อง ตู้เย็น เวร ผู้บันทึก เกณฑ์) ให้หน้าเว็บสร้างเมนูและกราฟ */
function getAppConfig() {
  try {
    const ss = openSpreadsheet_();
    const config = readConfig_(ss);
    config.today = todayIso_(ss.getSpreadsheetTimeZone());
    return config;
  } catch (err) {
    console.error("getAppConfig", err);
    throw new Error("โหลดการตั้งค่าระบบไม่สำเร็จ: " + errorText_(err));
  }
}

/**
 * บันทึกข้อมูล 1 รายการ
 * คืนค่า { status: "success" | "duplicate" | "error", message }
 * - "duplicate" = มีข้อมูล วันที่+เวร+สถานที่ เดียวกันแล้ว ส่ง data.confirmDuplicate = true เพื่อยืนยันบันทึกเพิ่ม
 * - ข้อผิดพลาดที่ไม่คาดคิดจะ throw เพื่อให้ withFailureHandler ทำงาน
 */
function saveData(data) {
  try {
    const ss = openSpreadsheet_();
    const tz = ss.getSpreadsheetTimeZone();
    const config = readConfig_(ss);

    const checked = validateRecord_(data, config, todayIso_(tz));
    if (checked.error) return { status: "error", message: checked.error };
    const rec = checked.record;

    ensureDataLayout_(ss, tz);
    const sheet = getOrCreateSheet_(ss, fySheetName_(fiscalYearOf_(rec.date)), initDataSheet_);
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(LOCK_WAIT_MS)) {
      return { status: "error", message: "มีผู้ใช้บันทึกพร้อมกันหลายคน กรุณากดบันทึกอีกครั้ง" };
    }
    try {
      if (sheet.getLastRow() === 0) initDataSheet_(sheet);
      const values = sheet.getDataRange().getValues();
      const col = getColumnMap_(values[0]);

      if (!data.confirmDuplicate) {
        const dup = findDuplicate_(values, col, rec, tz);
        if (dup) return { status: "duplicate", message: duplicateMessage_(dup, col, rec, tz) };
      }

      const width = Math.max(values[0].length, DATA_HEADERS.length);
      const row = new Array(width).fill("");
      row[col.timestamp] = new Date();
      row[col.formType] = FORM_TYPE_LABEL[rec.type];
      // เก็บวันที่เป็นเที่ยงคืนตาม Timezone ของไฟล์ Sheet ไม่ขึ้นกับ locale ของชีต
      row[col.date] = Utilities.parseDate(rec.date, tz, "yyyy-MM-dd");
      row[col.time] = rec.time;
      row[col.location] = rec.location;
      row[col.temp] = rec.temp;
      row[col.humidity] = rec.type === "room" ? rec.humidity : "-";
      row[col.staff] = rec.staff;

      const rowIndex = sheet.getLastRow() + 1;
      sheet.getRange(rowIndex, 1, 1, width).setValues([row]);
      sheet.getRange(rowIndex, col.date + 1).setNumberFormat("yyyy-mm-dd");
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
    return { status: "success", message: "บันทึก " + rec.location + " เรียบร้อยแล้ว" };
  } catch (err) {
    console.error("saveData", err);
    throw new Error("ระบบผิดพลาด: " + errorText_(err));
  }
}

/**
 * ดึงข้อมูลตามช่วงวันที่ (YYYY-MM-DD) ถ้าไม่ส่งมาจะใช้เดือนปัจจุบัน
 * คืนค่า { rows: [...], start, end } — temp/humidity เป็น null เมื่อไม่มีค่า
 * ข้อผิดพลาดจะ throw เพื่อให้หน้าเว็บแสดงข้อความ ไม่ใช่แสดงว่า "ไม่มีข้อมูล"
 */
function getDashboardData(startDate, endDate) {
  try {
    const ss = openSpreadsheet_();
    const tz = ss.getSpreadsheetTimeZone();
    const range = normalizeRange_(startDate, endDate, tz);
    if (range.error) throw new Error(range.error);

    ensureDataLayout_(ss, tz);
    const result = { rows: [], start: range.start, end: range.end };
    fiscalYearsInRange_(range.start, range.end).forEach(function (fy) {
      const sheet = ss.getSheetByName(fySheetName_(fy));
      if (sheet && sheet.getLastRow() >= 2) readRowsInRange_(sheet, range, tz, result.rows);
    });
    return result;
  } catch (err) {
    console.error("getDashboardData", err);
    throw new Error("ดึงข้อมูลไม่สำเร็จ: " + errorText_(err));
  }
}

function readRowsInRange_(sheet, range, tz, out) {
  const values = sheet.getDataRange().getValues();
  const col = getColumnMap_(values[0]);
  const fridgeLabel = FORM_TYPE_LABEL.fridge;
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    const date = normalizeDate_(r[col.date], tz);
    if (!date || date < range.start || date > range.end) continue;
    const location = cleanText_(r[col.location]);
    if (!location) continue;
    const formType = cleanText_(r[col.formType]);
    const ts = r[col.timestamp] instanceof Date && !isNaN(r[col.timestamp]) ? r[col.timestamp].getTime() : 0;
    out.push({
      ts: ts,
      formType: formType,
      date: date,
      time: normalizeTime_(r[col.time], tz),
      location: location,
      temp: toNumberOrNull_(r[col.temp]),
      humidity: formType === fridgeLabel ? null : toNumberOrNull_(r[col.humidity])
    });
  }
}

/* =========================================================
 * ปีงบประมาณ (1 ต.ค. – 30 ก.ย.)
 * ========================================================= */

/** ปีงบประมาณ (พ.ศ.) ของวันที่ YYYY-MM-DD เช่น 2026-10-01 → 2570, 2026-09-30 → 2569 */
function fiscalYearOf_(iso) {
  const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7));
  return (m >= 10 ? y + 1 : y) + 543;
}

function fySheetName_(fyBE) {
  return FY_SHEET_PREFIX + fyBE;
}

function fiscalYearsInRange_(start, end) {
  const out = [];
  for (let fy = fiscalYearOf_(start); fy <= fiscalYearOf_(end); fy++) out.push(fy);
  return out;
}

/**
 * ทำครั้งเดียว: คัดลอกข้อมูลจากชีตเดิม "เก็บข้อมูลทั้งหมด" แยกลงชีตตามปีงบประมาณ
 * ชีตเดิมไม่ถูกลบหรือแก้ไข (ยกเว้นใส่หมายเหตุที่หัวตาราง) จึงย้อนกลับได้เสมอ
 */
function ensureDataLayout_(ss, tz) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(DATA_LAYOUT_KEY) === DATA_LAYOUT_VERSION) return;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) throw new Error("ระบบกำลังจัดเตรียมข้อมูล กรุณาลองใหม่อีกครั้ง");
  try {
    if (props.getProperty(DATA_LAYOUT_KEY) === DATA_LAYOUT_VERSION) return;
    const legacy = ss.getSheetByName(LEGACY_DATA_SHEET_NAME);
    if (legacy && legacy.getLastRow() >= 2) {
      const values = legacy.getDataRange().getValues();
      const col = getColumnMap_(values[0]);
      const groups = {};
      let skipped = 0, copied = 0;
      for (let i = 1; i < values.length; i++) {
        const r = values[i];
        if (r.every(function (v) { return v === "" || v === null; })) continue;
        const date = normalizeDate_(r[col.date], tz);
        if (!date) { skipped++; continue; }
        const fy = fiscalYearOf_(date);
        (groups[fy] = groups[fy] || []).push(DATA_KEYS.map(function (k) { return r[col[k]]; }));
        copied++;
      }
      Object.keys(groups).forEach(function (fy) {
        const name = fySheetName_(fy);
        let sheet = ss.getSheetByName(name);
        if (!sheet) {
          sheet = ss.insertSheet(name);
          initDataSheet_(sheet);
        } else if (sheet.getLastRow() >= 2) {
          // เหลือจากการคัดลอกที่ค้างครั้งก่อน (ยังไม่มีการบันทึกใหม่ลงชีตนี้จนกว่าจะคัดลอกเสร็จ)
          sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
        }
        const rows = groups[fy];
        sheet.getRange(2, 1, rows.length, DATA_HEADERS.length).setValues(rows);
        sheet.getRange(2, 3, rows.length, 1).setNumberFormat("yyyy-mm-dd");
      });
      legacy.getRange(1, 1).setNote(
        "ชีตนี้เป็นข้อมูลสำรองก่อนแยกตามปีงบประมาณ ระบบไม่บันทึกเพิ่มในชีตนี้แล้ว\n" +
        "คัดลอกไปยังชีต \"" + FY_SHEET_PREFIX + "...\" แล้ว " + copied + " แถว เมื่อ " +
        Utilities.formatDate(new Date(), tz, "dd/MM/yyyy HH:mm") +
        (skipped ? "\nมี " + skipped + " แถวที่อ่านวันที่ไม่ได้ จึงไม่ถูกคัดลอก" : "")
      );
      console.log("แยกข้อมูลตามปีงบ: คัดลอก " + copied + " แถว, ข้าม " + skipped + " แถว");
    }
    SpreadsheetApp.flush();
    props.setProperty(DATA_LAYOUT_KEY, DATA_LAYOUT_VERSION);
  } finally {
    lock.releaseLock();
  }
}

/* =========================================================
 * ชีตตั้งค่า
 * ========================================================= */

function readConfig_(ss) {
  const sheet = getOrCreateSheet_(ss, CONFIG_SHEET_NAME, initConfigSheet_);
  migrateConfig_(sheet);
  const values = sheet.getDataRange().getValues();

  const labelToKey = {};
  Object.keys(THRESHOLD_LABELS).forEach(function (k) { labelToKey[THRESHOLD_LABELS[k]] = k; });

  const cfg = {
    rooms: [], roomParents: {}, fridges: [], times: [], staff: [],
    thresholds: Object.assign({}, DEFAULT_CONFIG.thresholds)
  };
  const usedLocation = {}, usedTime = {}, usedStaff = {};

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const type = cleanText_(row[0]);
    const name = cleanText_(row[1]);
    if (!type || !name || !isActive_(row[4])) continue;
    const detail = cleanText_(row[2]);

    if (type === CONFIG_TYPE.ROOM) {
      if (usedLocation[name]) continue;
      usedLocation[name] = true;
      cfg.rooms.push(name);
      if (detail && detail !== name) cfg.roomParents[name] = detail;
    } else if (type === CONFIG_TYPE.FRIDGE) {
      if (usedLocation[name]) continue;
      usedLocation[name] = true;
      cfg.fridges.push({ name: name, room: detail, color: validColor_(row[3]) });
    } else if (type === CONFIG_TYPE.TIME) {
      if (usedTime[name]) continue;
      usedTime[name] = true;
      cfg.times.push(name);
    } else if (type === CONFIG_TYPE.STAFF) {
      if (usedStaff[name]) continue;
      usedStaff[name] = true;
      cfg.staff.push({ name: name, group: detail || "อื่น ๆ" });
    } else if (type === CONFIG_TYPE.THRESHOLD) {
      const key = labelToKey[name];
      const num = toNumberOrNull_(row[2]);
      if (key && num !== null) cfg.thresholds[key] = num;
    }
  }

  // ป้องกันระบบใช้งานไม่ได้ถ้าชีตตั้งค่าว่างหรือกรอกผิด
  if (!cfg.rooms.length && !cfg.fridges.length) {
    console.warn("ชีตตั้งค่าไม่มีห้องยา/ตู้เย็นที่ใช้งาน ใช้ค่าเริ่มต้นแทน");
    cfg.rooms = DEFAULT_CONFIG.rooms.slice();
    cfg.roomParents = Object.assign({}, DEFAULT_CONFIG.roomParents);
    cfg.fridges = DEFAULT_CONFIG.fridges.map(function (f) { return Object.assign({}, f); });
  }
  // ห้องยาหลักต้องมีอยู่จริงและไม่เป็นจุดย่อยของห้องอื่นอีกชั้น ไม่เช่นนั้นถือเป็นห้องยาหลักเอง
  Object.keys(cfg.roomParents).forEach(function (room) {
    const parent = cfg.roomParents[room];
    if (cfg.rooms.indexOf(parent) < 0 || cfg.roomParents[parent]) delete cfg.roomParents[room];
  });
  if (!cfg.times.length) cfg.times = DEFAULT_CONFIG.times.slice();
  if (!cfg.staff.length) cfg.staff = DEFAULT_CONFIG.staff.map(function (s) { return Object.assign({}, s); });

  const t = cfg.thresholds, d = DEFAULT_CONFIG.thresholds;
  if (!(t.roomTempMin < t.roomTempMax)) { t.roomTempMin = d.roomTempMin; t.roomTempMax = d.roomTempMax; }
  if (!(t.fridgeTempMin < t.fridgeTempMax)) { t.fridgeTempMin = d.fridgeTempMin; t.fridgeTempMax = d.fridgeTempMax; }
  return cfg;
}

function initConfigSheet_(sheet) {
  const rows = [CONFIG_HEADERS];
  DEFAULT_CONFIG.rooms.forEach(function (n) {
    rows.push([CONFIG_TYPE.ROOM, n, DEFAULT_CONFIG.roomParents[n] || "", "", true]);
  });
  DEFAULT_CONFIG.fridges.forEach(function (f) { rows.push([CONFIG_TYPE.FRIDGE, f.name, f.room, f.color, true]); });
  DEFAULT_CONFIG.times.forEach(function (n) { rows.push([CONFIG_TYPE.TIME, n, "", "", true]); });
  DEFAULT_CONFIG.staff.forEach(function (s) { rows.push([CONFIG_TYPE.STAFF, s.name, s.group, "", true]); });
  Object.keys(THRESHOLD_LABELS).forEach(function (k) {
    rows.push([CONFIG_TYPE.THRESHOLD, THRESHOLD_LABELS[k], DEFAULT_CONFIG.thresholds[k], "", true]);
  });

  // ต้องใส่ checkbox ก่อน เพราะ insertCheckboxes จะตั้งค่าทุกช่องเป็น false
  sheet.getRange(2, 5, rows.length - 1, 1).insertCheckboxes();
  sheet.getRange(1, 1, rows.length, CONFIG_HEADERS.length).setValues(rows);
  sheet.getRange(1, 1, 1, CONFIG_HEADERS.length).setFontWeight("bold").setBackground("#f3f4f6");
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 90);
  sheet.setColumnWidth(2, 260);
  sheet.setColumnWidth(3, 230);
  sheet.setColumnWidth(4, 90);
  sheet.setColumnWidth(5, 70);
  sheet.getRange(1, 1).setNote(CONFIG_NOTE);
  PropertiesService.getScriptProperties().setProperty(CONFIG_VERSION_KEY, String(CONFIG_VERSION));
}

const CONFIG_NOTE =
  "ประเภทที่ใช้ได้: ห้องยา, ตู้เย็น, ช่วงเวลา, ผู้บันทึก, เกณฑ์\n" +
  "ห้องยา: ช่องรายละเอียด = ห้องยาหลักที่สังกัด (ใส่เฉพาะจุดย่อย เช่น Sub-Stock) เว้นว่าง = ห้องยาหลัก\n" +
  "ตู้เย็น: ช่องรายละเอียด = ชื่อห้องยาที่ตู้สังกัด (ต้องสะกดตรงกับแถวห้องยา)\n" +
  "ผู้บันทึก: ช่องรายละเอียด = ตำแหน่ง/กลุ่ม\n" +
  "เกณฑ์: ห้ามแก้ข้อความช่องชื่อ แก้ได้เฉพาะตัวเลขในช่องรายละเอียด\n" +
  "ปิดรายการ: เอาเครื่องหมายช่อง ใช้งาน ออก (ไม่ต้องลบแถว)\n" +
  "ห้ามเปลี่ยนชื่อห้อง/ตู้/ช่วงเวลาที่มีข้อมูลเก่าแล้ว\n" +
  "เปลี่ยนแล้วให้กดรีเฟรชหน้าเว็บ";

/**
 * อัปเกรดชีตตั้งค่าที่สร้างจากเวอร์ชันก่อน (ทำครั้งเดียว แล้วจำไว้ใน Script Properties)
 * v2: เพิ่มห้องยา Premium 5/2 + ตู้เย็น No. 1 และผูก Sub-Stock เข้ากับห้องยาหลัก
 * ไม่แตะแถวที่ผู้ใช้แก้ไว้แล้ว และไม่เพิ่มซ้ำถ้ามีชื่อนั้นอยู่แล้ว (แม้ปิดใช้งาน)
 */
function migrateConfig_(sheet) {
  const props = PropertiesService.getScriptProperties();
  const current = function () { return Number(props.getProperty(CONFIG_VERSION_KEY) || 1); };
  if (current() >= CONFIG_VERSION) return;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) return; // ลองใหม่ครั้งถัดไป
  try {
    if (current() >= CONFIG_VERSION) return;
    const values = sheet.getDataRange().getValues();
    const rowOf = {};
    for (let i = 1; i < values.length; i++) {
      const name = cleanText_(values[i][1]);
      if (name && !rowOf[name]) rowOf[name] = i + 1;
    }

    Object.keys(DEFAULT_CONFIG.roomParents).forEach(function (room) {
      const r = rowOf[room];
      if (r && cleanText_(values[r - 1][0]) === CONFIG_TYPE.ROOM && !cleanText_(values[r - 1][2])) {
        sheet.getRange(r, 3).setValue(DEFAULT_CONFIG.roomParents[room]);
      }
    });

    const add = [];
    if (!rowOf[PREMIUM_ROOM]) add.push([CONFIG_TYPE.ROOM, PREMIUM_ROOM, "", "", true]);
    if (!rowOf[PREMIUM_FRIDGE]) add.push([CONFIG_TYPE.FRIDGE, PREMIUM_FRIDGE, PREMIUM_ROOM, "#f97316", true]);
    if (add.length) {
      const start = sheet.getLastRow() + 1;
      sheet.getRange(start, 5, add.length, 1).insertCheckboxes();
      sheet.getRange(start, 1, add.length, CONFIG_HEADERS.length).setValues(add);
    }
    sheet.getRange(1, 1).setNote(CONFIG_NOTE);
    SpreadsheetApp.flush();
    props.setProperty(CONFIG_VERSION_KEY, String(CONFIG_VERSION));
  } finally {
    lock.releaseLock();
  }
}

function initDataSheet_(sheet) {
  sheet.getRange(1, 1, 1, DATA_HEADERS.length).setValues([DATA_HEADERS])
    .setFontWeight("bold").setBackground("#f3f4f6");
  sheet.setFrozenRows(1);
}

/* =========================================================
 * ตรวจสอบและจัดการข้อมูล
 * ========================================================= */

function validateRecord_(data, config, today) {
  if (!data || typeof data !== "object") return { error: "ไม่พบข้อมูลที่ส่งมา" };

  const type = (data.type === "room" || data.type === "fridge") ? data.type : null;
  if (!type) return { error: "ประเภทแบบฟอร์มไม่ถูกต้อง" };

  const rawDate = cleanText_(data.date);
  if (!isIsoDate_(rawDate)) return { error: "วันที่บันทึกไม่ถูกต้อง" };
  if (rawDate > today) return { error: "ไม่สามารถบันทึกข้อมูลของวันที่ล่วงหน้าได้" };

  const time = cleanText_(data.time);
  if (config.times.indexOf(time) < 0) return { error: "กรุณาเลือกช่วงเวลาจากรายการ" };

  const location = cleanText_(type === "room" ? data.roomName : data.fridgeType);
  const allowed = type === "room" ? config.rooms : config.fridges.map(function (f) { return f.name; });
  if (allowed.indexOf(location) < 0) {
    return { error: type === "room" ? "กรุณาเลือกห้องยาจากรายการ" : "กรุณาเลือกตู้เย็นจากรายการ" };
  }

  const staff = cleanText_(data.staff);
  if (!config.staff.some(function (s) { return s.name === staff; })) {
    return { error: "กรุณาเลือกชื่อผู้บันทึกจากรายการ" };
  }

  const temp = toNumberOrNull_(data.temp);
  if (temp === null) return { error: "กรุณากรอกอุณหภูมิเป็นตัวเลข" };
  if (temp < PLAUSIBLE_RANGE.tempMin || temp > PLAUSIBLE_RANGE.tempMax) {
    return { error: "อุณหภูมิ " + temp + "°C ไม่สมเหตุสมผล (ต้องอยู่ระหว่าง " +
      PLAUSIBLE_RANGE.tempMin + " ถึง " + PLAUSIBLE_RANGE.tempMax + "°C) กรุณาตรวจสอบการพิมพ์" };
  }

  let humidity = null;
  if (type === "room") {
    humidity = toNumberOrNull_(data.humidity);
    if (humidity === null) return { error: "กรุณากรอกความชื้นเป็นตัวเลข" };
    if (humidity < PLAUSIBLE_RANGE.humMin || humidity > PLAUSIBLE_RANGE.humMax) {
      return { error: "ความชื้น " + humidity + "% ไม่สมเหตุสมผล (ต้องอยู่ระหว่าง 0 ถึง 100) กรุณาตรวจสอบการพิมพ์" };
    }
  }

  return {
    record: {
      type: type, date: rawDate, time: time, location: location, staff: staff,
      temp: round1_(temp), humidity: humidity === null ? null : round1_(humidity)
    }
  };
}

function findDuplicate_(values, col, rec, tz) {
  for (let i = values.length - 1; i >= 1; i--) {
    const r = values[i];
    if (cleanText_(r[col.location]) === rec.location &&
        cleanText_(r[col.time]) === rec.time &&
        normalizeDate_(r[col.date], tz) === rec.date) {
      return r;
    }
  }
  return null;
}

function duplicateMessage_(row, col, rec, tz) {
  const t = toNumberOrNull_(row[col.temp]);
  const who = cleanText_(row[col.staff]);
  const when = row[col.timestamp] instanceof Date && !isNaN(row[col.timestamp])
    ? Utilities.formatDate(row[col.timestamp], tz, "dd/MM/yyyy HH:mm") : "";
  return rec.location + "\n" +
    "วันที่ " + isoToThaiDate_(rec.date) + " ช่วงเวลา " + rec.time + "\n" +
    "มีบันทึกไว้แล้ว: อุณหภูมิ " + (t === null ? "-" : t) + "°C" +
    (who ? " โดย " + who : "") + (when ? " (บันทึกเมื่อ " + when + ")" : "") + "\n\n" +
    "ถ้าเป็นการวัดซ้ำหลังแก้ไข กด \"บันทึกเพิ่ม\" แดชบอร์ดและรายงานจะใช้ค่าที่บันทึกล่าสุด";
}

/** หาตำแหน่งคอลัมน์จากหัวตาราง ถ้าหัวตารางไม่ครบให้ใช้ลำดับมาตรฐาน */
function getColumnMap_(headerRow) {
  const header = (headerRow || []).map(function (h) { return cleanText_(h); });
  const map = {}, used = {};
  let ok = true;
  DATA_KEYS.forEach(function (key, i) {
    const idx = header.indexOf(DATA_HEADERS[i]);
    if (idx < 0 || used[idx]) { ok = false; return; }
    map[key] = idx;
    used[idx] = true;
  });
  if (ok) return map;
  const fallback = {};
  DATA_KEYS.forEach(function (key, i) { fallback[key] = i; });
  return fallback;
}

function normalizeRange_(startDate, endDate, tz) {
  const today = todayIso_(tz);
  let s = cleanText_(startDate), e = cleanText_(endDate);
  if (!s && !e) { s = today.slice(0, 8) + "01"; e = today; }
  if (!isIsoDate_(s) || !isIsoDate_(e)) return { error: "รูปแบบช่วงวันที่ไม่ถูกต้อง" };
  if (s > e) return { error: "วันที่เริ่มต้นต้องไม่หลังวันที่สิ้นสุด" };
  if (daysBetween_(s, e) > MAX_RANGE_DAYS) return { error: "เลือกช่วงวันที่ได้ไม่เกิน " + MAX_RANGE_DAYS + " วันต่อครั้ง" };
  return { start: s, end: e };
}

/** แปลงค่าวันที่จากชีตเป็น YYYY-MM-DD โดยใช้ Timezone ของไฟล์ Sheet */
function normalizeDate_(v, tz) {
  if (v instanceof Date) return isNaN(v) ? "" : Utilities.formatDate(v, tz, "yyyy-MM-dd");
  const s = cleanText_(v);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return toIso_(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // กรณีพิมพ์ในชีตเป็น วว/ดด/ปปปป (รองรับ พ.ศ.)
  if (m) {
    let y = Number(m[3]);
    if (y > 2400) y -= 543;
    return toIso_(y, Number(m[2]), Number(m[1]));
  }
  return "";
}

function normalizeTime_(v, tz) {
  if (v instanceof Date) return isNaN(v) ? "" : Utilities.formatDate(v, tz, "HH.mm") + " น.";
  return cleanText_(v);
}

/* =========================================================
 * ฟังก์ชันช่วย
 * ========================================================= */

function openSpreadsheet_() {
  return SpreadsheetApp.openById(TARGET_SHEET_ID);
}

/** สร้างชีตถ้ายังไม่มี (ล็อกเฉพาะตอนต้องสร้าง เพื่อกันสร้างซ้ำพร้อมกัน) */
function getOrCreateSheet_(ss, name, initFn) {
  let sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) throw new Error("ระบบไม่ว่าง กรุณาลองใหม่อีกครั้ง");
  try {
    sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      initFn(sheet);
      SpreadsheetApp.flush();
    }
    return sheet;
  } finally {
    lock.releaseLock();
  }
}

function todayIso_(tz) {
  return Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
}

function toIso_(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return "";
  return y + "-" + pad2_(m) + "-" + pad2_(d);
}

function isIsoDate_(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  return !!m && Number(m[1]) >= 2000 && toIso_(Number(m[1]), Number(m[2]), Number(m[3])) === s;
}

function daysBetween_(a, b) {
  const pa = a.split("-").map(Number), pb = b.split("-").map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}

function isoToThaiDate_(iso) {
  return iso.split("-").reverse().join("/");
}

function pad2_(n) {
  return (n < 10 ? "0" : "") + n;
}

function cleanText_(v) {
  if (v === null || v === undefined) return "";
  return String(v).replace(/\s+/g, " ").trim();
}

function toNumberOrNull_(v) {
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = cleanText_(v).replace(",", ".");
  if (s === "" || s === "-") return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}

function round1_(n) {
  return Math.round(n * 10) / 10;
}

function isActive_(v) {
  if (v === false) return false;
  const s = cleanText_(v).toUpperCase();
  return ["FALSE", "NO", "N", "0", "ไม่", "ไม่ใช้งาน", "ปิด"].indexOf(s) < 0;
}

function validColor_(v) {
  const s = cleanText_(v);
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : "";
}

function errorText_(err) {
  return err && err.message ? err.message : String(err);
}

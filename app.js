/* ====================== CONFIG (GitHub Pages) ====================== */
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbz78TUKQZrZziIqpPIJ5lwMYygc_W2-SJjWNTPbmUAQty2QRgvfFDoCPrJb9cYaM9sK/exec";

const APPS_SCRIPT_SECRET =
  "A9xPq7Lm2Zt8Qw1Er5Yu3Io9Kj6Hg4Fs";

/* ====================== API CALL (NO CORS PREFLIGHT + TIMEOUT) ====================== */
async function apiCall(action, data) {
  const payload = JSON.stringify({
    secret: APPS_SCRIPT_SECRET,
    action: action,
    data: data
  });

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), RUN_TIMEOUT_MS);

  let res, text;
  try {
    res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      body: payload,           // ไม่ตั้ง headers => เลี่ยง preflight
      signal: controller.signal
    });
    text = await res.text();
  } catch (err) {
    clearTimeout(t);
    return { ok: false, message: "Network/Timeout: " + String(err) };
  } finally {
    clearTimeout(t);
  }

  if (!res || !res.ok) {
    return { ok: false, message: "HTTP " + (res ? res.status : "?"), raw: text || "" };
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    return { ok: false, message: "Invalid JSON from Apps Script", raw: text };
  }
}



/* ====================== STATE ====================== */
var selectedFiles = [];
var objectUrls = [];
var isSubmitting = false;

var RUN_TIMEOUT_MS = 45000;
var FILE_READ_TIMEOUT_MS = 25000;

function $(id){ return document.getElementById(id); }

function setDisabled(on){
  var btn = $("btnSubmit");
  if (!btn) return;
  btn.disabled = !!on;
}

/* ====== Filters / Sanitizers ====== */
function digitsOnly(v){ return String(v || '').replace(/[^\d]/g,''); }
function digits7Only(v){ return digitsOnly(v).slice(-7); }
function decimalOnly(v){
  v = String(v || '').replace(/[^0-9.]/g,'');
  var parts = v.split('.');
  if (parts.length <= 2) return v;
  return parts[0] + '.' + parts.slice(1).join('');
}
function containerOnly(v){
  return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g,'');
}

/* ====== Preview ====== */
function revokeAllObjectUrls(){
  try{ objectUrls.forEach(function(u){ URL.revokeObjectURL(u); }); }catch(e){}
  objectUrls = [];
}

function updatePreview(){
  var box = $("localPreviewImages");
  if (!box) return;

  box.innerHTML = "";
  revokeAllObjectUrls();

  if (!selectedFiles.length) return;

  var title = document.createElement("div");
  title.className = "preview-images-title";
  title.textContent = "รูปที่เลือก: " + selectedFiles.length + " รูป";
  box.appendChild(title);

  var grid = document.createElement("div");
  grid.className = "preview-images-grid";
  box.appendChild(grid);

  selectedFiles.forEach(function(file, idx){
    var url = URL.createObjectURL(file);
    objectUrls.push(url);

    var thumb = document.createElement("div");
    thumb.className = "preview-thumb";

    var img = document.createElement("img");
    img.loading = "lazy";
    img.decoding = "async";
    img.src = url;
    img.alt = "รูปที่ " + (idx+1);

    thumb.appendChild(img);
    grid.appendChild(thumb);
  });
}

/* ====== Read file as dataURL (per file) ====== */
function readFileAsDataURL(file){
  return new Promise(function(resolve){
    var reader = new FileReader();
    var done = false;

    var timer = setTimeout(function(){
      if (done) return;
      done = true;
      try{ reader.abort(); }catch(e){}
      resolve("");
    }, FILE_READ_TIMEOUT_MS);

    reader.onload = function(e){
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve((e && e.target && e.target.result) ? e.target.result : "");
    };
    reader.onerror = function(){
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve("");
    };

    try{ reader.readAsDataURL(file); }
    catch(e){ clearTimeout(timer); resolve(""); }
  });
}

/* ====== Lookup Store Name ====== */
var storeLookupTimer = 0;

function scheduleStoreLookup(){
  clearTimeout(storeLookupTimer);
  storeLookupTimer = setTimeout(doStoreLookup, 350);
}

async function doStoreLookup(){
  var storeId = digitsOnly($("storeId").value);
  $("storeId").value = storeId;

  if (!storeId){
    $("storeNameThai").value = "";
    return;
  }

  $("storeNameThai").value = "กำลังค้นหา...";

  try{
    var res = await apiCall("lookupStoreNameThai", { storeId: storeId });
    if (res && res.ok){
      $("storeNameThai").value = res.storeName || "-";
    } else {
      $("storeNameThai").value = "";
    }
  }catch(e){
    $("storeNameThai").value = "";
  }
}

/* ====== Upload image one-by-one to server ====== */
async function uploadImagesSequential(meta){
  var ids = [];

  for (var i=0; i<selectedFiles.length; i++){
    Swal.update({
      html: "โปรดรอสักครู่ ระบบกำลังอัปโหลดรูป ("+(i+1)+"/"+selectedFiles.length+")"
    });

    var dataUrl = await readFileAsDataURL(selectedFiles[i]);
    if (!dataUrl) continue;

    var payload = { dataUrl: dataUrl, meta: meta };
    var res = await apiCall("uploadOverweightImage", payload);

    if (res && res.ok && res.fileId){
      ids.push(res.fileId);
    }
  }

  return ids;
}

/* ====== Submit ====== */
async function submitOverweight(){
  if (isSubmitting) return;

  var recordDate = $("recordDate").value;

  var storeId = digitsOnly($("storeId").value);
  $("storeId").value = storeId;

  var storeNameThai = ($("storeNameThai").value || "").trim();

  var bol7 = digits7Only($("bol7").value);
  $("bol7").value = bol7;

  var overweightValue = decimalOnly($("overweightValue").value);
  $("overweightValue").value = overweightValue;

  var overweightUnit = $("overweightUnit").value || "KG";

  var palletCount = digitsOnly($("palletCount").value);
  $("palletCount").value = palletCount;

  var containerNo = containerOnly($("containerNo").value);
  $("containerNo").value = containerNo;

  var recorder = ($("recorder").value || "").trim();

  // validation
  if (!recordDate) return Swal.fire({ icon:"warning", title:"ข้อมูลไม่ครบ", text:"กรุณาเลือกวันที่", confirmButtonText:"ตกลง" });
  if (!storeId) return Swal.fire({ icon:"warning", title:"ข้อมูลไม่ครบ", text:"กรุณากรอกหมายเลขสาขา (ตัวเลขเท่านั้น)", confirmButtonText:"ตกลง" });
  if (!storeNameThai) return Swal.fire({ icon:"warning", title:"ยังไม่พบข้อมูลสาขา", text:"กรุณาตรวจสอบหมายเลขสาขาให้ถูกต้อง", confirmButtonText:"ตกลง" });

  if (!containerNo) return Swal.fire({ icon:"warning", title:"ข้อมูลไม่ครบ", text:"กรุณากรอกหมายเลขตู้สินค้า", confirmButtonText:"ตกลง" });
  if (!/^[A-Z0-9]+$/.test(containerNo)) return Swal.fire({ icon:"warning", title:"รูปแบบไม่ถูกต้อง", text:"หมายเลขตู้สินค้า ต้องเป็น A-Z และ 0-9 เท่านั้น", confirmButtonText:"ตกลง" });

  if (!/^\d{7}$/.test(bol7)) return Swal.fire({ icon:"warning", title:"ข้อมูลไม่ครบ", text:"กรุณากรอก BOL 7 หลักสุดท้ายให้ครบ", confirmButtonText:"ตกลง" });
  if (!overweightValue || Number(overweightValue) <= 0) return Swal.fire({ icon:"warning", title:"ข้อมูลไม่ครบ", text:"กรุณากรอกน.น.ที่เกิน (ตัวเลข/ทศนิยม)", confirmButtonText:"ตกลง" });
  if (!palletCount) return Swal.fire({ icon:"warning", title:"ข้อมูลไม่ครบ", text:"กรุณากรอกจำนวนพาเลท (ตัวเลขเท่านั้น)", confirmButtonText:"ตกลง" });
  if (!recorder) return Swal.fire({ icon:"warning", title:"ข้อมูลไม่ครบ", text:"กรุณาเลือกชื่อผู้บันทึก", confirmButtonText:"ตกลง" });

  isSubmitting = true;
  setDisabled(true);

  // LINE user id (ถ้ามี LIFF) — จะว่างถ้าใช้งานนอก LIFF
  var lineUserId = "";
  try{
    if (window.liff && liff.getDecodedIDToken){
      var token = liff.getDecodedIDToken();
      lineUserId = token && token.sub ? token.sub : "";
    }
  }catch(e){}

  Swal.fire({
    title: "กำลังบันทึกข้อมูล...",
    html: selectedFiles.length ? "เตรียมอัปโหลดรูป..." : "กำลังบันทึกข้อมูล...",
    allowOutsideClick: false,
    allowEscapeKey: false,
    didOpen: function(){ Swal.showLoading(); }
  });

  try{
    // 1) upload images -> ids
    var meta = {
      storeId: storeId,
      bol7: bol7,
      recorder: recorder,
      lineUserId: lineUserId,
      containerNo: containerNo
    };

    var imageIds = [];
    if (selectedFiles.length){
      imageIds = await uploadImagesSequential(meta);
    }
    var imageIdsJoined = (imageIds || []).join("|");

    // 2) save row
    var formData = {
      recordDate: recordDate,
      storeId: storeId,
      storeNameThai: storeNameThai,
      containerNo: containerNo,
      bol7: bol7,
      overweightValue: overweightValue,
      overweightUnit: overweightUnit,
      palletCount: palletCount,
      imageIdsJoined: imageIdsJoined,
      recorder: recorder,
      lineUserId: lineUserId
    };

    var res = await apiCall("saveOverweightRecord", formData);

    Swal.close();

    if (res && res.ok){
      // reset
      $("recordDate").value = "";
      $("storeId").value = "";
      $("storeNameThai").value = "";
      $("containerNo").value = "";
      $("bol7").value = "";
      $("overweightValue").value = "";
      $("overweightUnit").value = "KG";
      $("palletCount").value = "";
      $("recorder").value = "";

      $("fileInput").value = "";
      selectedFiles = [];
      revokeAllObjectUrls();
      $("localPreviewImages").innerHTML = "";

      Swal.fire({
        icon:"success",
        title:"บันทึกสำเร็จ",
        html:
          '<div style="text-align:left; line-height:1.55">' +
          '<div><b>เวลา:</b> ' + (res.timestamp || "-") + '</div>' +
          '<div><b>จำนวนรูปที่บันทึก:</b> ' + (res.imageCount || 0) + ' รูป</div>' +
          '</div>',
        confirmButtonText:"ปิด"
      });
    } else {
      Swal.fire({
        icon:"error",
        title:"บันทึกไม่สำเร็จ",
        text: (res && res.message) ? res.message : "ไม่ทราบสาเหตุ",
        confirmButtonText:"ปิด"
      });
    }

  }catch(err){
    Swal.close();
    Swal.fire({
      icon:"error",
      title:"เกิดข้อผิดพลาด",
      text: String(err),
      confirmButtonText:"ปิด"
    });
  }finally{
    isSubmitting = false;
    setDisabled(false);
  }
}

/* ====== Calendar (SweetAlert) ====== */
function pad2(n){ return String(n).padStart(2,'0'); }
function toDmy(y, m1, d){ return pad2(d) + '/' + pad2(m1) + '/' + String(y); }

async function fetchDatesInMonth(y, m1){
  const res = await apiCall("owGetRecordDatesInMonth", { year: y, month1to12: m1 });
  if (!res || !res.ok) return [];
  return res.dates || [];
}

async function fetchRowsByDate(dmy){
  return await apiCall("owGetRecordsByRecordDate", { dmy: dmy });
}

function buildCalendarHtml(y, m1, datesSet){
  const first = new Date(y, m1 - 1, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(y, m1, 0).getDate();

  const monthNamesTH = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
  const title = monthNamesTH[m1 - 1] + " " + y;

  const dows = ["อา","จ","อ","พ","พฤ","ศ","ส"];

  let html =
    '<div class="ow-cal-wrap">' +
      '<div class="ow-cal-head">' +
        '<div class="ow-cal-title">' + title + '</div>' +
        '<div class="ow-cal-nav">' +
          '<button type="button" id="owCalPrev">ก่อนหน้า</button>' +
          '<button type="button" id="owCalNext">ถัดไป</button>' +
        '</div>' +
      '</div>' +
      '<div class="ow-cal-grid" id="owCalGrid">';

  for (let i=0;i<7;i++){
    html += '<div class="ow-cal-dow">' + dows[i] + '</div>';
  }

  for (let i=0;i<startDow;i++){
    html += '<div class="ow-cal-day muted"></div>';
  }

  for (let d=1; d<=daysInMonth; d++){
    const key = toDmy(y, m1, d);
    const has = datesSet[key] ? 'has-data' : '';
    const dataAttr = datesSet[key] ? 'data-date="'+key+'"' : '';
    html += '<div class="ow-cal-day ' + has + '" ' + dataAttr + '>' + d + '</div>';
  }

  html +=
      '</div>' +
      '<div class="ow-cal-legend"><span class="ow-cal-dot"></span>วันที่มีข้อมูลบันทึก</div>' +
    '</div>';

  return html;
}

async function openOverweightCalendar(){
  const now = new Date();
  let y = now.getFullYear();
  let m1 = now.getMonth() + 1;
  await renderCalendarModal(y, m1);
}

async function renderCalendarModal(y, m1){
  Swal.fire({
    title: "ปฏิทินข้อมูล",
    html: "กำลังโหลด...",
    width: 640,
    allowOutsideClick: false,
    didOpen: async () => {
      Swal.showLoading();

      try{
        const dates = await fetchDatesInMonth(y, m1);
        const datesSet = {};
        (dates || []).forEach(d => { datesSet[d] = true; });

        const calHtml = buildCalendarHtml(y, m1, datesSet);
        Swal.update({ html: calHtml });
        Swal.hideLoading();

        document.getElementById("owCalPrev").onclick = async () => {
          let yy = y, mm = m1 - 1;
          if (mm < 1){ mm = 12; yy--; }
          await renderCalendarModal(yy, mm);
        };
        document.getElementById("owCalNext").onclick = async () => {
          let yy = y, mm = m1 + 1;
          if (mm > 12){ mm = 1; yy++; }
          await renderCalendarModal(yy, mm);
        };

        document.querySelectorAll('.ow-cal-day.has-data').forEach(el => {
          el.addEventListener('click', async () => {
            const dmy = el.getAttribute('data-date');
            if (!dmy) return;
            await showRecordsForDate(dmy);
          });
        });

      }catch(err){
        Swal.update({ icon: "error", html: "โหลดปฏิทินไม่สำเร็จ: " + String(err) });
      }
    }
  });
}

function buildRecordHtml(res){
  const rows = (res && res.rows) ? res.rows : [];
  const date = (res && res.date) ? res.date : "";

  if (!rows.length){
    return '<div style="text-align:left">ไม่พบข้อมูลของวันที่ ' + date + '</div>';
  }

  let html =
    '<div style="text-align:left; line-height:1.55">' +
      '<div style="font-weight:800; margin-bottom:8px;">วันที่: ' + date + ' (ทั้งหมด ' + rows.length + ' รายการ)</div>';

  rows.forEach((r, idx) => {
    const imgs = (r.imageIds || []).map(id => 'https://lh5.googleusercontent.com/d/' + id);

    html +=
      '<div style="border:1px solid rgba(15,23,42,.10); border-radius:14px; padding:10px; margin-bottom:10px; background:#fff;">' +
        '<div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap;">' +
          '<div><b>#' + (idx+1) + '</b> <span style="color:rgba(100,116,139,.95)">(' + (r.timestamp || "-") + ')</span></div>' +
          '<div style="font-weight:800">' + (r.storeId || "-") + ' — ' + (r.storeNameThai || "-") + '</div>' +
        '</div>' +
        '<div style="margin-top:6px; color:rgba(15,23,42,.92)">' +
          '<div><b>ตู้สินค้า:</b> ' + (r.containerNo || "-") + '</div>' +
          '<div><b>BOL:</b> ' + (r.bol7 || "-") + '</div>' +
          '<div><b>น.น.ที่เกิน:</b> ' + (r.overweightValue || 0) + ' ' + (r.unit || "KG") + '</div>' +
          '<div><b>พาเลท:</b> ' + (r.palletCount || 0) + '</div>' +
          '<div><b>ผู้บันทึก:</b> ' + (r.recorder || "-") + '</div>' +
        '</div>';

    if (imgs.length){
      html += '<div class="ow-img-grid">';
      imgs.forEach(url => {
        html += '<a href="' + url + '" target="_blank" rel="noopener"><img src="' + url + '" alt="img"></a>';
      });
      html += '</div>';
    } else {
      html += '<div style="margin-top:8px; font-size:12px; color:rgba(100,116,139,.95)">ไม่มีรูปแนบ</div>';
    }

    html += '</div>';
  });

  html += '</div>';
  return html;
}

async function showRecordsForDate(dmy){
  Swal.fire({
    title: "กำลังดึงข้อมูล...",
    text: "โปรดรอสักครู่",
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  try{
    const res = await fetchRowsByDate(dmy);
    if (!res || !res.ok){
      Swal.fire({
        icon:"error",
        title:"ไม่สามารถดึงข้อมูลได้",
        text: (res && res.message) ? res.message : "กรุณาลองใหม่",
        confirmButtonText:"ปิด"
      });
      return;
    }

    Swal.fire({
      icon:"info",
      title:"ข้อมูลวันที่ " + dmy,
      html: buildRecordHtml(res),
      width: 720,
      confirmButtonText:"ปิด"
    });

  }catch(err){
    Swal.fire({
      icon:"error",
      title:"เกิดข้อผิดพลาด",
      text: String(err),
      confirmButtonText:"ปิด"
    });
  }
}

/* ====== DOM Ready ====== */
window.addEventListener("DOMContentLoaded", function(){
  $("storeId").addEventListener("input", function(){
    this.value = digitsOnly(this.value);
    scheduleStoreLookup();
  });

  $("bol7").addEventListener("input", function(){
    this.value = digits7Only(this.value);
  });

  $("overweightValue").addEventListener("input", function(){
    this.value = decimalOnly(this.value);
  });

  $("palletCount").addEventListener("input", function(){
    this.value = digitsOnly(this.value);
  });

  $("containerNo").addEventListener("input", function(){
    const cleaned = containerOnly(this.value);
    if (this.value !== cleaned) this.value = cleaned;
  });

  $("fileInput").addEventListener("change", function(){
    if (this.files && this.files.length){
      selectedFiles = Array.prototype.slice.call(this.files);
      updatePreview();
    } else {
      selectedFiles = [];
      updatePreview();
    }
  });

  // load recorder list
  apiCall("getRecorderNameList", {}).then(function(res){
    var sel = $("recorder");
    sel.innerHTML = '<option value="">เลือกชื่อผู้บันทึก</option>';
    var list = (res && res.ok) ? (res.data || []) : [];
    (list || []).forEach(function(name){
      var opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
  }).catch(function(){
    $("recorder").innerHTML = '<option value="">โหลดรายชื่อไม่สำเร็จ</option>';
  });
});




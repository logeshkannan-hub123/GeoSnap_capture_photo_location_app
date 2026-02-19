// ════════════════════════════════════
// TAB SWITCHING
// ════════════════════════════════════
function switchTab(name) {
  document
    .querySelectorAll(".panel")
    .forEach((p) => p.classList.remove("active"));
  document
    .querySelectorAll(".tab-btn")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById(name + "-panel").classList.add("active");
  event.target.classList.add("active");
}

// ── APP STATE ────────────────────────────────────────
let currentLocation = null;
let stream = null;
let cameraReady = false;
let capturedDataUrl = null;

// ── UPLOAD STATE ─────────────────────────────────────
let uploadedFile = null; // the File object from input/drop
let uploadedDataUrl = null; // base64 preview URL

// ════════════════════════════════════
// CAMERA: START
// ════════════════════════════════════
async function startCamera() {
  setStatus("Requesting camera permission…");
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    const video = document.getElementById("videoEl");
    video.srcObject = stream;
    video.style.display = "block";
    document.getElementById("vfPlaceholder").style.display = "none";
    setBadge("camBadge", "granted", "Camera ✓");
    setStatus("Camera ready. Press Get GPS next.");
    cameraReady = true;
    checkReadyToCapture();
  } catch (err) {
    setBadge("camBadge", "denied", "Camera ✗");
    if (err.name === "NotAllowedError")
      setStatus("Camera denied. Allow it in browser settings.");
    else if (err.name === "NotFoundError")
      setStatus("No camera found on this device.");
    else setStatus("Camera error: " + err.message);
  }
}

// ════════════════════════════════════
// GPS
// ════════════════════════════════════
function getLocation() {
  if (!navigator.geolocation) {
    setStatus("Geolocation not supported.");
    return;
  }
  setStatus("Requesting GPS permission…");
  setBadge("gpsBadge", "", "Location…");
  navigator.geolocation.getCurrentPosition(onLocationSuccess, onLocationError, {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0,
  });
}

function onLocationSuccess(position) {
  currentLocation = {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    acc: position.coords.accuracy,
    time: new Date(),
  };
  setBadge("gpsBadge", "granted", "Location ✓");
  const coordStr = `${currentLocation.lat.toFixed(5)}, ${currentLocation.lng.toFixed(5)}`;
  document.getElementById("gpsCoords").textContent = "📍 " + coordStr;
  document.getElementById("gpsAddr").textContent =
    `Accuracy: ±${currentLocation.acc.toFixed(0)}m · ${currentLocation.time.toLocaleTimeString()}`;
  document.getElementById("gpsOverlay").classList.add("visible");
  setStatus("GPS acquired. Ready to capture!");
  checkReadyToCapture();
}

function onLocationError(err) {
  setBadge("gpsBadge", "denied", "Location ✗");
  const msgs = {
    1: "Location denied by user.",
    2: "GPS unavailable.",
    3: "Location timed out.",
  };
  setStatus(msgs[err.code] || "Location error.");
}

// ════════════════════════════════════
// CAPTURE PHOTO
// ════════════════════════════════════
function capturePhoto() {
  const video = document.getElementById("videoEl");
  const canvas = document.getElementById("canvasEl");
  const ctx = canvas.getContext("2d");

  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  capturedDataUrl = canvas.toDataURL("image/jpeg", 0.95);

  const img = document.getElementById("resultImg");
  img.src = capturedDataUrl;

  const meta = document.getElementById("resultMeta");
  if (currentLocation) {
    const { lat, lng, acc, time } = currentLocation;
    meta.innerHTML =
      `<span>LAT</span> ${lat.toFixed(6)}<br>` +
      `<span>LNG</span> ${lng.toFixed(6)}<br>` +
      `<span>ACC</span> ±${acc.toFixed(0)}m<br>` +
      `<span>TIME</span> ${time.toLocaleString()}<br>` +
      `<span>STATUS</span> <span id="saveStatus">⏳ Uploading & scanning text…</span>`;
  }

  document.getElementById("photoResult").classList.add("visible");
  document.getElementById("controls").style.display = "none";
  video.style.display = "none";
  if (stream) stream.getTracks().forEach((t) => t.stop());

  // ── Show company name input + upload button ───────
  // User types company name (optional), then clicks "Upload & Scan"
  // saveToBackend() is called from saveWithCompany() below
  const wrap = document.getElementById("cameraCompanyWrap");
  if (wrap) wrap.style.display = "flex";
  const compInput = document.getElementById("cameraCompanyInput");
  if (compInput) {
    compInput.value = "";
    compInput.focus();
  }
  setSaveStatus("Enter company name (optional), then click Upload & Scan");
}

// ── Called when user clicks "Upload & Scan" button ───
function saveWithCompany() {
  const btn = document.getElementById("btnSaveCamera");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "⏳ Uploading…";
  }

  // Hide the input wrap so it doesn't show again on retake
  const wrap = document.getElementById("cameraCompanyWrap");
  if (wrap) wrap.style.display = "none";

  saveToBackend();
}

// ════════════════════════════════════
// SAVE CAMERA PHOTO TO BACKEND
// ════════════════════════════════════
async function saveToBackend() {
  if (!capturedDataUrl || !currentLocation) return;
  setSaveStatus("⏳ Uploading & scanning text…");

  try {
    const blob = dataUrlToBlob(capturedDataUrl);

    // Pick up company name typed by user before saving
    const cameraCompany = (
      document.getElementById("cameraCompanyInput")?.value || ""
    ).trim();

    const formData = new FormData();
    formData.append("photo", blob, "photo.jpg");
    formData.append("latitude", currentLocation.lat);
    formData.append("longitude", currentLocation.lng);
    formData.append("accuracy", currentLocation.acc);
    formData.append("captured_at", currentLocation.time.toISOString());
    if (cameraCompany) formData.append("company_name", cameraCompany);

    const response = await fetch("/api/photos/upload", {
      method: "POST",
      body: formData,
    });
    const result = await response.json();

    if (result.success) {
      const addr = result.address;
      const addrStr =
        addr.address_city && addr.address_country
          ? `${addr.address_road || ""} ${addr.address_city}, ${addr.address_country}`.trim()
          : addr.address_full || "Address not found";

      setSaveStatus(`✅ Saved! ID: ${result.photo_id}`);
      document.getElementById("gpsAddr").textContent = addrStr;

      const meta = document.getElementById("resultMeta");
      let extra = "";

      // Show company name if user entered one
      if (result.company_name) {
        extra += `<br><span>🏢 COMPANY</span> ${escapeHtml(result.company_name)}`;
      }

      extra += `<br><span>ADDR</span> ${addrStr}`;
      extra += `<br><span>FILE</span> ${result.photo_name}`;

      const ocr = result.ocr;
      if (ocr && ocr.has_text) {
        extra += `<br><br><span style="color:#f4a261;letter-spacing:2px">── OCR SCAN ──</span>`;
        if (ocr.address)
          extra += `<br><span>📍 ADDR</span> ${escapeHtml(ocr.address)}`;
        if (ocr.contact_number)
          extra += `<br><span>📞 PHONE</span> ${escapeHtml(ocr.contact_number)}`;
        if (ocr.email)
          extra += `<br><span>📧 EMAIL</span> ${escapeHtml(ocr.email)}`;
        if (ocr.url) extra += `<br><span>🔗 URL</span> ${escapeHtml(ocr.url)}`;
        if (ocr.other_text)
          extra += `<br><span>📄 OTHER TEXT</span> ${escapeHtml(ocr.other_text.substring(0, 300))}${ocr.other_text.length > 300 ? "…" : ""}`;
        if (ocr.text)
          extra += `<br><span>📝 FULL TEXT</span>${escapeHtml(ocr.text.substring(0, 300))}${ocr.text.length > 300 ? "…" : ""}`;
      } else {
        extra += `<br><span>OCR</span> No text detected`;
      }
      meta.innerHTML += extra;

      // Re-enable save button in case user wants to retry
      const saveBtn = document.getElementById("btnSaveCamera");
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = "☁ Upload & Scan Text";
      }
    } else {
      setSaveStatus(`❌ Save failed: ${result.error}`);
    }
  } catch (err) {
    setSaveStatus(`❌ Network error: ${err.message}`);
    const saveBtn = document.getElementById("btnSaveCamera");
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = "☁ Upload & Scan Text";
    }
    // Re-show company wrap so user can retry
    const wrap = document.getElementById("cameraCompanyWrap");
    if (wrap) wrap.style.display = "flex";
  }
}

// ════════════════════════════════════════════════════
//  UPLOAD IMAGE SECTION — NEW FUNCTIONS
// ════════════════════════════════════════════════════

// ── Handle file input change ─────────────────────────
function handleUploadFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  setUploadFile(file);
}

// ── Drag & drop handlers ─────────────────────────────
function handleDragOver(event) {
  event.preventDefault();
  document.getElementById("uploadDropzone").classList.add("dragover");
}

function handleDragLeave(event) {
  document.getElementById("uploadDropzone").classList.remove("dragover");
}

function handleDrop(event) {
  event.preventDefault();
  document.getElementById("uploadDropzone").classList.remove("dragover");
  const file = event.dataTransfer.files[0];
  if (!file || !file.type.startsWith("image/")) {
    alert("Please drop an image file (JPG, PNG, WEBP).");
    return;
  }
  setUploadFile(file);
}

// ── Set the file + show preview ──────────────────────
function setUploadFile(file) {
  uploadedFile = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    uploadedDataUrl = e.target.result;

    // Show preview image
    document.getElementById("uploadPreviewImg").src = uploadedDataUrl;
    document.getElementById("uploadResult").classList.add("visible");

    // Reset OCR panel to empty state
    document.getElementById("ocrSpinner").classList.remove("active");
    document.getElementById("ocrContent").innerHTML = "";

    // Enable scan+save button only if location is also set
    checkUploadReady();

    // Update dropzone label to show file name
    document.querySelector(".upload-dropzone-text").innerHTML =
      `<strong>${escapeHtml(file.name)}</strong><br/>
       <span style="color:rgba(255,255,255,0.25);font-size:10px">${(file.size / 1024).toFixed(0)} KB · Click to change</span>`;
  };
  reader.readAsDataURL(file);
}

// ── Step 2: Get GPS for the uploaded image ───────────
function getUploadLocation() {
  if (!navigator.geolocation) {
    setUploadGpsStatus("Geolocation not supported.", "err");
    return;
  }
  const btn = document.getElementById("btnUploadGps");
  btn.disabled = true;
  btn.textContent = "📍 Getting…";
  setUploadGpsStatus("Requesting location…", "");

  navigator.geolocation.getCurrentPosition(
    (position) => {
      uploadLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        acc: position.coords.accuracy,
        time: new Date(),
      };
      btn.textContent = "📍 Location ✓";
      const coordStr = `${uploadLocation.lat.toFixed(5)}, ${uploadLocation.lng.toFixed(5)} (±${uploadLocation.acc.toFixed(0)}m)`;
      setUploadGpsStatus(coordStr, "ok");
      // Enable scan+save button only if we also have a file
      checkUploadReady();
    },
    (err) => {
      btn.disabled = false;
      btn.textContent = "📍 Retry Location";
      const msgs = {
        1: "Location denied.",
        2: "GPS unavailable.",
        3: "Timed out.",
      };
      setUploadGpsStatus(msgs[err.code] || "Location failed.", "err");
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
  );
}

function setUploadGpsStatus(msg, state) {
  const el = document.getElementById("uploadGpsStatus");
  el.textContent = msg;
  el.className = "upload-gps-status" + (state ? " " + state : "");
}

function checkUploadReady() {
  // Enable scan+save only when both file AND location are set
  const ready = uploadedFile && uploadLocation;
  document.getElementById("btnUploadScan").disabled = !ready;
}

// ── Step 3: Scan text + save to database ─────────────
async function scanAndSaveUpload() {
  if (!uploadedFile || !uploadLocation) return;

  const btn = document.getElementById("btnUploadScan");
  btn.disabled = true;
  btn.textContent = "⏳ Scanning & saving…";

  document.getElementById("uploadResult").classList.add("visible");
  document.getElementById("ocrSpinner").classList.add("active");
  document.getElementById("ocrSpinnerText").textContent =
    "Scanning text & saving…";
  document.getElementById("ocrContent").innerHTML = "";

  try {
    // Read company name from Step 3 input field
    const uploadCompany = (
      document.getElementById("companyNameInput")?.value || ""
    ).trim();

    const formData = new FormData();
    formData.append("photo", uploadedFile, uploadedFile.name);
    formData.append("latitude", uploadLocation.lat);
    formData.append("longitude", uploadLocation.lng);
    formData.append("accuracy", uploadLocation.acc);
    formData.append("captured_at", uploadLocation.time.toISOString());
    if (uploadCompany) formData.append("company_name", uploadCompany);

    const response = await fetch("/api/photos/upload", {
      method: "POST",
      body: formData,
    });

    const result = await response.json();
    document.getElementById("ocrSpinner").classList.remove("active");

    if (result.success) {
      // Build address string from reverse geocode
      const addr = result.address;
      const addrStr =
        addr.address_city && addr.address_country
          ? `${addr.address_road || ""} ${addr.address_city}, ${addr.address_country}`.trim()
          : addr.address_full || "Address not found";

      // Show full OCR + save result
      renderOcrResult(result.ocr, {
        saved: true,
        photo_id: result.photo_id,
        photo_name: result.photo_name,
        company_name: result.company_name || uploadCompany || null,
        address: addrStr,
        lat: uploadLocation.lat,
        lng: uploadLocation.lng,
        acc: uploadLocation.acc,
        time: uploadLocation.time,
      });
    } else {
      document.getElementById("ocrContent").innerHTML =
        `<div class="ocr-none">❌ Failed: ${escapeHtml(result.error)}</div>`;
    }
  } catch (err) {
    document.getElementById("ocrSpinner").classList.remove("active");
    document.getElementById("ocrContent").innerHTML =
      `<div class="ocr-none">❌ Network error: ${escapeHtml(err.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "🔍 Scan Text & Save to Database";
  }
}

// ── Render OCR result + optional save info ───────────
function renderOcrResult(ocr, saveInfo = null) {
  const content = document.getElementById("ocrContent");
  let html = "";

  // ── Save confirmation block ───────────────────────
  if (saveInfo && saveInfo.saved) {
    html += `<div class="ocr-heading" style="color:#52b788">── ✅ Saved to Database ──</div>`;
    if (saveInfo.company_name) {
      html += ocrRow("🏢 Company", saveInfo.company_name);
    }
    html += ocrRow("🆔 Photo ID", `#${saveInfo.photo_id}`);
    html += ocrRow("📍 Location", saveInfo.address);
    html += ocrRow(
      "🌐 GPS",
      `${saveInfo.lat.toFixed(5)}, ${saveInfo.lng.toFixed(5)} (±${saveInfo.acc.toFixed(0)}m)`,
    );
    html += ocrRow("🕐 Captured", saveInfo.time.toLocaleString());
    html += ocrRow("📁 File", saveInfo.photo_name);
    html += `<div style="height:8px"></div>`;
  }

  // ── OCR text result ───────────────────────────────
  html += `<div class="ocr-heading">── OCR Scan Result ──</div>`;

  if (!ocr || !ocr.has_text) {
    html += `<div class="ocr-none" style="font-size:11px;padding:6px 0">
               No readable text found in this image.
             </div>`;
    content.innerHTML = html;
    return;
  }

  if (ocr.text) html += ocrRow("📄 Text", ocr.text);
  if (ocr.address) html += ocrRow("📍 Address", ocr.address);
  if (ocr.contact_number) html += ocrRow("📞 Phone", ocr.contact_number);
  if (ocr.email) html += ocrRow("📧 Email", ocr.email);
  if (ocr.url) html += ocrRow("🔗 URL", ocr.url);
  if (ocr.other_text) html += ocrRow("📄 Other Text", ocr.other_text);

  if (
    !ocr.address &&
    !ocr.contact_number &&
    !ocr.email &&
    !ocr.url &&
    ocr.text
  ) {
    html += `<div style="font-size:10px;color:rgba(255,255,255,0.2);padding-top:6px;letter-spacing:1px">
               No phone / address / email detected in text
             </div>`;
  }

  content.innerHTML = html;
}

function ocrRow(key, value) {
  return `<div class="ocr-row">
    <div class="ocr-key">${key}</div>
    <div class="ocr-val">${escapeHtml(String(value))}</div>
  </div>`;
}

// ── Clear upload — reset all upload state ────────────
function clearUpload() {
  uploadedFile = null;
  uploadedDataUrl = null;
  uploadLocation = null;

  document.getElementById("uploadFileInput").value = "";
  document.getElementById("uploadResult").classList.remove("visible");
  document.getElementById("uploadPreviewImg").src = "";
  document.getElementById("ocrContent").innerHTML = "";
  document.getElementById("ocrSpinner").classList.remove("active");
  document.getElementById("btnUploadScan").disabled = true;

  // Reset GPS status
  const gpsBtn = document.getElementById("btnUploadGps");
  gpsBtn.disabled = false;
  gpsBtn.textContent = "📍 Get My Location";
  setUploadGpsStatus("Location not set", "");

  // Reset company name input
  const companyInput = document.getElementById("companyNameInput");
  if (companyInput) companyInput.value = "";

  // Reset dropzone text
  document.querySelector(".upload-dropzone-text").innerHTML =
    `<strong>Click to choose</strong> or drag &amp; drop<br/>Reads English · Tamil · Numbers`;
}

// ════════════════════════════════════
// DOWNLOAD / RETAKE
// ════════════════════════════════════
function downloadPhoto() {
  if (!capturedDataUrl) return;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const link = document.createElement("a");
  link.href = capturedDataUrl;
  link.download = `geosnap_${timestamp}.jpg`;
  link.click();
}

function retake() {
  document.getElementById("photoResult").classList.remove("visible");
  document.getElementById("videoEl").style.display = "block";
  document.getElementById("controls").style.display = "flex";
  document.getElementById("controls").style.flexDirection = "column";
  capturedDataUrl = null;
  cameraReady = false;
  currentLocation = null;
  setBadge("camBadge", "", "Camera");
  document.getElementById("gpsOverlay").classList.remove("visible");
  document.getElementById("btnCapture").disabled = true;

  // Reset camera company name fields
  const compInput = document.getElementById("cameraCompanyInput");
  if (compInput) compInput.value = "";
  const wrap = document.getElementById("cameraCompanyWrap");
  if (wrap) {
    wrap.style.display = "none";
  }
  const saveBtn = document.getElementById("btnSaveCamera");
  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.textContent = "☁ Upload & Scan Text";
  }

  startCamera();
}

// ════════════════════════════════════
// HELPERS
// ════════════════════════════════════
function setStatus(msg) {
  document.getElementById("statusMsg").textContent = msg;
}

function setSaveStatus(msg) {
  const el = document.getElementById("saveStatus");
  if (el) el.textContent = msg;
}

function setBadge(id, state, label) {
  const b = document.getElementById(id);
  b.classList.remove("granted", "denied");
  if (state) b.classList.add(state);
  b.innerHTML = `<div class="perm-dot"></div> ${label}`;
}

function checkReadyToCapture() {
  const ready = cameraReady && currentLocation;
  document.getElementById("btnCapture").disabled = !ready;
  if (ready) setStatus("All set — press Capture Photo!");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(",");
  const mime = parts[0].match(/:(.*?);/)[1];
  const binary = atob(parts[1]);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
  return new Blob([array], { type: mime });
}

document.querySelector(".controls").id = "controls";

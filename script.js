import { supabase } from "./supabaseClient.js";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import coreURL from "@ffmpeg/core?url";
import wasmURL from "@ffmpeg/core/wasm?url";

const campaignSelect = document.querySelector("#campaign-select");
const sessionSelect = document.querySelector("#session-select");
const recordingCampaignSelect = document.querySelector("#recording-campaign");
const audio = document.querySelector("#session-audio");
const audioStatus = document.querySelector("#audio-status");
const accessForm = document.querySelector("#access-form");
const recordingForm = document.querySelector("#recording-form");
const recordingFile = document.querySelector("#recording-file");

const MAX_STORAGE_FILE_BYTES = 48 * 1024 * 1024;
const EDGE_FUNCTION = "submit-recording";
let uploadPassword = "";

let campaigns = [];
let sessions = [];
let sessionsRequest = 0;
let detailRequest = 0;

function renderList(target, items) {
  target.replaceChildren(...items.map((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    return li;
  }));
}

function setSelectOptions(select, rows, placeholder, valueFor, labelFor) {
  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = placeholder;
  placeholderOption.disabled = true;
  placeholderOption.selected = true;

  const options = rows.map((row) => {
    const option = document.createElement("option");
    option.value = String(valueFor(row));
    option.textContent = labelFor(row);
    return option;
  });
  select.replaceChildren(placeholderOption, ...options);
  select.disabled = rows.length === 0;
  if (rows.length > 0) select.value = String(valueFor(rows[0]));
}

function compareSessionNumbers(left, right) {
  const a = String(left).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const b = String(right).split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function clearSessionDetails(message = "") {
  document.querySelector("#session-number").textContent = "";
  document.querySelector("#session-detail-title").textContent = message || "No session selected";
  document.querySelector("#session-date").textContent = "";
  renderList(document.querySelector("#character-list"), []);
  renderList(document.querySelector("#player-list"), []);
  document.querySelector("#audio-session-title").textContent = message || "No session selected";
  audio.removeAttribute("src");
  audio.load();
  audioStatus.textContent = "Select a session with a recording to listen.";
}

async function renderSession() {
  const requestId = ++detailRequest;
  const session = sessions.find((item) => String(item.id) === sessionSelect.value);
  if (!session) {
    clearSessionDetails();
    return;
  }

  document.querySelector("#session-number").textContent = `SESSION ${session.session_number}`;
  document.querySelector("#session-detail-title").textContent = session.session_name || "Untitled session";
  document.querySelector("#session-date").textContent = session.session_date
    ? `Session date: ${session.session_date}`
    : "";
  document.querySelector("#audio-session-title").textContent = session.session_name || "Untitled session";

  if (session.recording_url) {
    audio.src = session.recording_url;
    audioStatus.textContent = "Recording loaded from the public archive.";
  } else {
    audio.removeAttribute("src");
    audioStatus.textContent = "No recording is attached to this session yet.";
  }
  audio.load();

  renderList(document.querySelector("#character-list"), []);
  renderList(document.querySelector("#player-list"), []);

  const [characterResult, playerResult] = await Promise.all([
    supabase
      .from("SessionCharacters")
      .select("Characters(character_name)")
      .eq("session_id", session.id),
    supabase
      .from("SessionPlayers")
      .select("Players(player_name)")
      .eq("session_id", session.id)
  ]);

  document.querySelector(".session-notes").textContent = session.session_description?.trim()
    || "Session information is loaded from the shared campaign archive.";

  if (requestId !== detailRequest) return;

  if (characterResult.error || playerResult.error) {
    document.querySelector("#session-help").textContent =
      "Session loaded, but participant details could not be read. Check the foreign-key relationships and RLS policies.";
    return;
  }

  const characterNames = (characterResult.data ?? [])
    .map((row) => row.Characters?.character_name)
    .filter(Boolean);
  const playerNames = (playerResult.data ?? [])
    .map((row) => row.Players?.player_name)
    .filter(Boolean);
  renderList(document.querySelector("#character-list"), characterNames);
  renderList(document.querySelector("#player-list"), playerNames);
  document.querySelector("#session-help").textContent = "Choose a session to see its details.";
}

async function loadSessions() {
  const requestId = ++sessionsRequest;
  const campaignId = campaignSelect.value;
  const sessionHelp = document.querySelector("#session-help");

  if (!campaignId) {
    sessions = [];
    setSelectOptions(sessionSelect, [], "Choose a campaign first", (item) => item.id, (item) => item.session_name);
    clearSessionDetails();
    return;
  }

  sessionHelp.textContent = "Loading sessions…";
  sessionSelect.disabled = true;
  const { data, error } = await supabase
    .from("Sessions")
    .select("id, recording_url, session_name, session_number, campaign_ID, session_date, session_description")
    .eq("campaign_ID", campaignId);

  if (requestId !== sessionsRequest) return;

  if (error) {
    sessions = [];
    setSelectOptions(sessionSelect, [], "Could not load sessions", (item) => item.id, (item) => item.session_name);
    sessionHelp.textContent = "Could not load sessions. Check Supabase read policies.";
    clearSessionDetails("Sessions unavailable");
    return;
  }

  sessions = (data ?? []).sort((left, right) => compareSessionNumbers(left.session_number, right.session_number));
  setSelectOptions(
    sessionSelect,
    sessions,
    sessions.length ? "Choose a session" : "No sessions yet",
    (session) => session.id,
    (session) => `Session ${session.session_number} · ${session.session_name || "Untitled session"}`
  );

  if (sessions.length === 0) {
    sessionHelp.textContent = "No sessions have been added to this campaign yet.";
    clearSessionDetails("No sessions yet");
    return;
  }

  sessionHelp.textContent = "Choose a session to see its details.";
  await renderSession();
}

async function loadCampaigns() {
  const { data, error } = await supabase
    .from("Campaigns")
    .select("id, campaign_name")
    .not("campaign_name", "is", null)
    .order("id");

  if (error) {
    setSelectOptions(campaignSelect, [], "Could not load campaigns", (item) => item.id, (item) => item.campaign_name);
    setSelectOptions(recordingCampaignSelect, [], "Could not load campaigns", (item) => item.id, (item) => item.campaign_name);
    document.querySelector("#session-help").textContent = "Could not load campaigns. Check Supabase URL, key, and read policies.";
    clearSessionDetails("Campaigns unavailable");
    return;
  }

  campaigns = (data ?? []).filter((campaign) => campaign.campaign_name?.trim());
  setSelectOptions(campaignSelect, campaigns, "No campaigns found", (campaign) => campaign.id, (campaign) => campaign.campaign_name);
  setSelectOptions(recordingCampaignSelect, campaigns, "No campaigns found", (campaign) => campaign.id, (campaign) => campaign.campaign_name);

  if (campaigns.length === 0) {
    document.querySelector("#session-help").textContent = "No campaign rows found in the Campaigns table.";
    clearSessionDetails("No campaigns yet");
    return;
  }

  await loadSessions();
}

campaignSelect.addEventListener("change", loadSessions);
sessionSelect.addEventListener("change", renderSession);
void loadCampaigns();

accessForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = String(new FormData(accessForm).get("password") ?? "");
  const message = document.querySelector("#password-message");
  const button = accessForm.querySelector("button[type=submit]");

  message.textContent = "Checking access…";
  button.disabled = true;
  const { data, error } = await supabase.functions.invoke(EDGE_FUNCTION, {
    body: { action: "verify", password }
  });
  button.disabled = false;

  if (error || !data?.ok) {
    message.textContent = error
      ? "Could not verify access. Make sure the upload function is deployed, then try again."
      : "That password did not match. Please try again.";
    return;
  }

  uploadPassword = password;
  accessForm.reset();
  message.textContent = "The form is unlocked.";
  recordingForm.hidden = false;
  document.querySelector("#recording-campaign").focus();
});

function readAudioDuration(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const probe = document.createElement("audio");
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      URL.revokeObjectURL(objectUrl);
      if (Number.isFinite(probe.duration) && probe.duration > 0) resolve(probe.duration);
      else reject(new Error("The recording duration could not be read."));
    };
    probe.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("The browser could not read this audio file."));
    };
    probe.src = objectUrl;
  });
}

async function splitRecording(file, baseSessionNumber, progress) {
  if (file.size <= MAX_STORAGE_FILE_BYTES) {
    return [{ file, sessionNumber: baseSessionNumber }];
  }

  const extension = file.name.toLowerCase().endsWith(".m4a") ? "m4a" : "mp3";
  const duration = await readAudioDuration(file);
  const ffmpeg = new FFmpeg();
  progress("Loading the audio splitter…");
  await ffmpeg.load({ coreURL, wasmURL });
  const inputPath = `source.${extension}`;
  try {
    await ffmpeg.writeFile(inputPath, new Uint8Array(await file.arrayBuffer()));

    let partCount = Math.ceil(file.size / MAX_STORAGE_FILE_BYTES);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const outputPaths = Array.from({ length: partCount }, (_, index) => `part-${index}.${extension}`);
      const outputFiles = [];
      progress(`Splitting the recording into ${partCount} parts…`);

      for (let index = 0; index < partCount; index += 1) {
        const start = (duration * index) / partCount;
        const segmentDuration = index === partCount - 1 ? duration - start : duration / partCount;
        const exitCode = await ffmpeg.exec([
          "-ss", start.toFixed(3), "-i", inputPath, "-t", segmentDuration.toFixed(3),
          "-map", "0:a:0", "-c:a", "copy", "-avoid_negative_ts", "make_zero", outputPaths[index]
        ]);
        if (exitCode !== 0) throw new Error("The audio splitter could not create a playable part.");
        const bytes = await ffmpeg.readFile(outputPaths[index]);
        outputFiles.push(new File([bytes], outputPaths[index], { type: file.type }));
      }

      for (const path of outputPaths) await ffmpeg.deleteFile(path);
      const largestPart = Math.max(...outputFiles.map((part) => part.size));
      if (largestPart <= MAX_STORAGE_FILE_BYTES) {
        await ffmpeg.deleteFile(inputPath);
        return outputFiles.map((part, index) => ({
          file: part,
          sessionNumber: `${baseSessionNumber}.${index + 1}`
        }));
      }

      partCount = Math.max(partCount + 1, Math.ceil(partCount * (largestPart / MAX_STORAGE_FILE_BYTES) * 1.05));
    }
    throw new Error("Could not split this recording into files below the 50 MB limit. Try a smaller recording.");
  } finally {
    ffmpeg.terminate();
  }
}

function normalizedNames(value) {
  return value.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
}

recordingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = recordingFile.files[0];
  const fileName = file?.name.toLowerCase() ?? "";
  const message = document.querySelector("#submission-message");
  const submitButton = recordingForm.querySelector("button[type=submit]");

  if (!file || !(fileName.endsWith(".mp3") || fileName.endsWith(".m4a"))) {
    recordingFile.setCustomValidity("Choose an MP3 or M4A file.");
    recordingFile.reportValidity();
    return;
  }

  recordingFile.setCustomValidity("");
  const formData = new FormData(recordingForm);
  const sessionName = String(formData.get("sessionName") ?? "").trim();
  const baseSessionNumber = String(formData.get("sessionNumber") ?? "").trim();
  const campaignId = String(formData.get("campaign") ?? "");
  const characters = normalizedNames(String(formData.get("characters") ?? ""));
  const players = normalizedNames(String(formData.get("players") ?? ""));
  const extension = fileName.endsWith(".m4a") ? "m4a" : "mp3";
  if (!uploadPassword) {
    message.textContent = "Unlock the form again before submitting.";
    return;
  }

  submitButton.disabled = true;
  recordingFile.disabled = true;
  message.textContent = "Preparing the recording…";
  let uploadPlan = null;
  let finalized = false;

  try {
    const parts = await splitRecording(file, baseSessionNumber, (status) => { message.textContent = status; });
    const { data, error: planError } = await supabase.functions.invoke(EDGE_FUNCTION, {
      body: {
        action: "start",
        password: uploadPassword,
        baseSessionNumber,
        sessionName,
        extension,
        parts: parts.map((part) => ({ sessionNumber: part.sessionNumber, size: part.file.size }))
      }
    });
    uploadPlan = data;
    if (planError || !uploadPlan?.uploads || uploadPlan.uploads.length !== parts.length) {
      throw new Error(uploadPlan?.error || planError?.message || "Could not prepare secure uploads.");
    }

    for (let index = 0; index < parts.length; index += 1) {
      message.textContent = `Uploading recording part ${index + 1} of ${parts.length}…`;
      const target = uploadPlan.uploads[index];
      const { error } = await supabase.storage.from("Recordings").uploadToSignedUrl(
        target.path,
        target.token,
        parts[index].file,
        { contentType: extension === "m4a" ? "audio/mp4" : "audio/mpeg", upsert: false }
      );
      if (error) throw new Error(`Part ${index + 1} could not be uploaded: ${error.message}`);
    }

    message.textContent = "Saving session details…";
    const { data: saved, error: saveError } = await supabase.functions.invoke(EDGE_FUNCTION, {
      body: {
        action: "finalize",
        password: uploadPassword,
        baseSessionNumber,
        sessionName,
        sessionDescription: String(formData.get("summary") ?? "").trim(),
        sessionDate: String(formData.get("sessionDate") ?? ""),
        campaignId,
        extension,
        uploadId: uploadPlan.uploadId,
        partCount: parts.length,
        characters,
        players
      }
    });
    if (saveError || !saved?.ok) throw new Error(saved?.error || saveError?.message || "Could not save the session details.");

    finalized = true;
    console.log("success");
    message.textContent = parts.length > 1
      ? `Success. The recording was added as ${parts.length} session parts.`
      : "Success. The recording and session were added to the archive.";
    recordingForm.reset();
    await loadSessions();
  } catch (error) {
    if (uploadPlan?.uploads && !finalized) {
      await supabase.functions.invoke(EDGE_FUNCTION, {
        body: {
          action: "cancel",
          password: uploadPassword,
          baseSessionNumber,
          sessionName,
          extension,
          uploadId: uploadPlan.uploadId,
          partCount: uploadPlan.uploads.length
        }
      });
    }
    console.error("Recording submission failed:", error);
    message.textContent = error instanceof Error ? error.message : "The recording could not be submitted.";
  } finally {
    submitButton.disabled = false;
    recordingFile.disabled = false;
  }
});

recordingFile.addEventListener("change", () => recordingFile.setCustomValidity(""));

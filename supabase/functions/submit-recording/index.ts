import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const BUCKET = "Recordings";
const MAX_FILE_BYTES = 48 * 1024 * 1024;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const uploadPassword = Deno.env.get("RECORDING_UPLOAD_PASSWORD");

if (!supabaseUrl || !serviceKey || !uploadPassword) {
  throw new Error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or RECORDING_UPLOAD_PASSWORD function secret.");
}

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function validSessionNumber(value: unknown): value is string {
  return typeof value === "string" && /^\d+(?:\.\d+)*$/.test(value) && value.length <= 32;
}

function safeTitle(value: string): string {
  return value.replace(/[^\p{L}\p{N}-]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 120) || "Untitled_Session";
}

function normalizeNames(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30) return null;
  const unique = new Map<string, string>();
  for (const entry of value) {
    if (typeof entry !== "string" || !entry.trim() || entry.trim().length > 100) return null;
    const name = entry.trim();
    unique.set(name.toLocaleLowerCase(), name);
  }
  return [...unique.values()];
}

function makeParts(base: string, count: number, title: string, extension: string) {
  return Array.from({ length: count }, (_, index) => {
    const sessionNumber = count === 1 ? base : `${base}.${index + 1}`;
    return {
      sessionNumber,
      path: `${sessionNumber}_${safeTitle(title)}.${extension}`,
    };
  });
}

function isUploadId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function pendingPaths(uploadId: string, parts: ReturnType<typeof makeParts>) {
  return parts.map((part) => `pending/${uploadId}/${part.path}`);
}

async function passwordMatches(password: unknown): Promise<boolean> {
  if (typeof password !== "string") return false;
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(password)),
    crypto.subtle.digest("SHA-256", encoder.encode(uploadPassword!)),
  ]);
  const provided = new Uint8Array(providedHash);
  const expected = new Uint8Array(expectedHash);
  return provided.length === expected.length && provided.every((byte, index) => byte === expected[index]);
}

async function findOrCreate(table: "Characters" | "Players", column: "character_name" | "player_name", name: string, extra?: Record<string, unknown>) {
  const { data: existing, error: lookupError } = await admin.from(table).select("id").eq(column, name).limit(1).maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return existing.id;
  const { data: created, error: insertError } = await admin.from(table)
    .insert({ [column]: name, ...extra }).select("id").single();
  if (insertError) throw insertError;
  return created.id;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }

  if (!await passwordMatches(body.password)) return json({ error: "The upload password did not match." }, 401);
  if (body.action === "verify") return json({ ok: true });

  const base = body.baseSessionNumber;
  const title = body.sessionName;
  const extension = body.extension;
  if (!validSessionNumber(base) || typeof title !== "string" || !title.trim() || title.length > 120 ||
      (extension !== "mp3" && extension !== "m4a")) {
    return json({ error: "Session number, session name, or recording type is invalid." }, 400);
  }

  if (body.action === "start") {
    if (!Array.isArray(body.parts) || body.parts.length < 1 || body.parts.length > 100) {
      return json({ error: "Recording part list is invalid." }, 400);
    }
    const expected = makeParts(base, body.parts.length, title, extension);
    for (let index = 0; index < body.parts.length; index += 1) {
      const part = body.parts[index] as Record<string, unknown>;
      if (part.sessionNumber !== expected[index].sessionNumber || !Number.isInteger(part.size) ||
          (part.size as number) < 1 || (part.size as number) > MAX_FILE_BYTES) {
        return json({ error: "A recording part exceeds the supported file size or has an invalid number." }, 400);
      }
    }

    const uploadId = crypto.randomUUID();
    const pending = pendingPaths(uploadId, expected);
    const uploads = [];
    for (const path of pending) {
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false });
      if (error || !data) return json({ error: error?.message || "Could not create a secure upload URL." }, 500);
      uploads.push({ path, token: data.token });
    }
    return json({ uploadId, uploads });
  }

  if (body.action === "cancel") {
    const count = body.partCount;
    if (!isUploadId(body.uploadId) || !Number.isInteger(count) || (count as number) < 1 || (count as number) > 100) {
      return json({ error: "Recording part list is invalid." }, 400);
    }
    const { error } = await admin.storage.from(BUCKET).remove(pendingPaths(
      body.uploadId,
      makeParts(base, count as number, title, extension),
    ));
    if (error) return json({ error: "Uploaded files could not be cleaned up." }, 500);
    return json({ ok: true });
  }

  if (body.action !== "finalize") return json({ error: "Unknown action." }, 400);

  const partCount = body.partCount;
  const campaignId = body.campaignId;
  const description = body.sessionDescription;
  const sessionDate = body.sessionDate;
  const uploadId = body.uploadId;
  const characters = normalizeNames(body.characters);
  const players = normalizeNames(body.players);
  if (!Number.isInteger(partCount) || (partCount as number) < 1 || (partCount as number) > 100 ||
      !isUploadId(uploadId) ||
      typeof campaignId !== "string" || !/^\d+$/.test(campaignId) ||
      typeof description !== "string" || description.length > 1000 ||
      typeof sessionDate !== "string" || (characters === null) || (players === null)) {
    return json({ error: "Session details or participant names are invalid." }, 400);
  }

  const parts = makeParts(base, partCount as number, title, extension);
  const pending = pendingPaths(uploadId, parts);
  for (let index = 0; index < parts.length; index += 1) {
    const { data, error } = await admin.storage.from(BUCKET).info(pending[index]);
    if (error || !data || !data.size || data.size > MAX_FILE_BYTES) {
      return json({ error: `Uploaded file part ${index + 1} is missing or exceeds the 50 MB limit.` }, 400);
    }
  }

  const finalPaths = parts.map((part) => part.path);
  for (const path of finalPaths) {
    const { data: exists } = await admin.storage.from(BUCKET).exists(path);
    if (exists) {
      await admin.storage.from(BUCKET).remove(pending);
      return json({ error: `A recording named ${path} already exists. Change the session number or name and try again.` }, 409);
    }
  }

  const movedPaths: string[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const { error } = await admin.storage.from(BUCKET).move(pending[index], finalPaths[index]);
    if (error) {
      if (movedPaths.length) await admin.storage.from(BUCKET).remove(movedPaths);
      await admin.storage.from(BUCKET).remove(pending);
      return json({ error: "Could not finalize the uploaded recording files." }, 500);
    }
    movedPaths.push(finalPaths[index]);
  }

  const insertedSessionIds: number[] = [];
  try {
    const { data: campaign, error: campaignError } = await admin.from("Campaigns")
      .select("id").eq("id", campaignId).maybeSingle();
    if (campaignError) throw campaignError;
    if (!campaign) {
      await admin.storage.from(BUCKET).remove(movedPaths);
      return json({ error: "The selected campaign no longer exists." }, 400);
    }

    for (const part of parts) {
      const recordingUrl = admin.storage.from(BUCKET).getPublicUrl(part.path).data.publicUrl;
      const { data: session, error } = await admin.from("Sessions").insert({
        recording_url: recordingUrl,
        session_name: title.trim(),
        session_number: part.sessionNumber,
        campaign_ID: campaignId,
        session_date: sessionDate || null,
        session_description: description.trim(),
      }).select("id").single();
      if (error) throw error;
      insertedSessionIds.push(session.id);

      for (const characterName of characters) {
        const characterId = await findOrCreate("Characters", "character_name", characterName);
        const { error: linkError } = await admin.from("SessionCharacters").insert({
          session_id: session.id,
          character_id: characterId,
        });
        if (linkError) throw linkError;
      }
      for (const playerName of players) {
        const playerId = await findOrCreate("Players", "player_name", playerName);
        const { error: linkError } = await admin.from("SessionPlayers").insert({
          session_id: session.id,
          player_id: playerId,
        });
        if (linkError) throw linkError;
      }
    }
    return json({ ok: true, sessionIds: insertedSessionIds });
  } catch (error) {
    if (insertedSessionIds.length) {
      await admin.from("SessionCharacters").delete().in("session_id", insertedSessionIds);
      await admin.from("SessionPlayers").delete().in("session_id", insertedSessionIds);
      await admin.from("Sessions").delete().in("id", insertedSessionIds);
    }
    await admin.storage.from(BUCKET).remove(movedPaths);
    console.error("Could not save submitted session:", error);
    return json({ error: "The files uploaded, but one or more session records could not be saved. Please retry." }, 500);
  }
});

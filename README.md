# The Lad's Listening Stones

A responsive, single-page listening room for a group's Dungeons & Dragons campaign recordings. Vite, FFmpeg WebAssembly, and Supabase power campaign/session reads, public playback, and password-gated recording submissions.

## Run locally

Install dependencies with `npm install`, add the Supabase URL and publishable key to `.env.local` (see `.env.example`), then run `npm run dev`. Google Fonts are requested when internet access is available; local system font fallbacks are included.

## Current behavior

- Campaign choices are loaded from `public."Campaigns"`.
- Sessions and participant names are requested from their Supabase tables when a campaign or session is selected.
- See the selected session number, title, description, characters, and players.
- Listen to recordings from the public `Recordings` Storage bucket with the native audio controls.
- The upload form checks its password through the `submit-recording` Edge Function. Recordings over 48 MiB are split into playable MP3 or M4A files in the browser; each part is stored as a separate session, for example `7.1_The_Road.mp3` and `7.2_The_Road.mp3`.
- Session records and participant links are written by the Edge Function with its server-side service key. The browser only receives short-lived signed upload URLs and never receives that key.
- Navigate by keyboard, including with the skip link, and use the layout at narrow widths and browser zoom.

## Deploy the upload function

The upload flow needs a deployed Supabase Edge Function. From a terminal with the Supabase CLI installed and authenticated, link this folder to your Supabase project, set the password you already chose as the `RECORDING_UPLOAD_PASSWORD` Edge Function secret, then deploy:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set RECORDING_UPLOAD_PASSWORD=YOUR_GROUP_PASSWORD
supabase functions deploy submit-recording
```

Set the secret through the Supabase Dashboard instead if you prefer; use the exact name `RECORDING_UPLOAD_PASSWORD`. Do not put the service-role key or upload password in `.env.local` or front-end code. This function assumes the `Recordings` bucket exists and the `Sessions` table has `session_description` and `session_date` text columns. The Edge Function is configured for password verification in its code, so it does not rely on Supabase user accounts.

Browser-side splitting uses memory and CPU on the submitter's device. The original file remains local until the split finishes and each resulting part is uploaded. The archive database must allow public SELECT on the tables used by the listening page; keep client-side table writes restricted because the Edge Function handles inserts.

See [CHANGELOG.md](CHANGELOG.md) for the project change log and [specification1.md](specification1.md) for the current increment requirements.

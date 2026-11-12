# Change Log

Record project changes here so future work (including the planned Supabase integration) has a concise implementation history.

## 2026-11-11 — Supabase recording uploads

- Replaced the hard-coded browser password with password verification through the `submit-recording` Supabase Edge Function.
- Added browser-side audio splitting for files above 48 MiB. MP3/M4A segments are checked against the storage size cap and recorded as separate sessions with part numbers.
- Added signed uploads to the public `Recordings` bucket and server-side creation of session, character/player, and join-table rows. Existing character/player names are reused.
- Added optional session dates, upload progress and failure messages, and cleanup for incomplete uploads.
- Fixed the destination filename check so a missing (available) Storage object is treated as expected rather than as an error.
- Added Edge Function deployment/configuration notes. The function requires the `RECORDING_UPLOAD_PASSWORD` secret and the Supabase service-role key provided by the function runtime.

## 2026-11-10 — Supabase Session Descriptions and Session Audio Permissions
- Added a session description field to the Sessions table and changed the front end to display it.
- Changed the Recordings bucket permissions to public so that the recordings can be listened to by all users. 


## 2026-11-09 — Supabase archive reads

- Replaced static campaign/session examples in the listening view with Supabase queries for campaigns, sessions, and their separate session-character/session-player relationships.
- Populated both campaign selectors from `Campaigns`, sorted textual session numbers numerically (including part numbers), and connected a session's `recording_url` to the native audio player.
- Added loading, empty, and read-error messages. Session descriptions are displayed from the `session_description` column.
- Upload submissions are handled by the Edge Function; it must be deployed and given the configured password secret before the form can be unlocked.

## 2026-11-09 — Front-end Supabase and FFmpeg setup

- Added Vite and installed the Supabase JavaScript client plus FFmpeg WebAssembly packages.
- Changed the page script to a Vite-compatible JavaScript module and added `supabaseClient.js`, configured through `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Added `.env.example` and updated README run instructions. `.env.local` remains ignored by Git and must contain the project's local URL and publishable key.
- Campaign/session reads are connected; secure uploads require deployment of the Edge Function.

## 2026-11-05 — M4A recording support

- Updated the recording file picker and client-side extension validation to accept `.m4a` alongside `.mp3`.
- Updated submission help text and README documentation to list both accepted formats.

## 2026-11-05 — Password-gated recording form

- Added an “Add a recording” navigation link that opens a themed submission section.
- Added a temporary password gate using `MAbsol49`; a correct password reveals the form.
- Added required fields for campaign, session number, session name, summary, participating characters, participating players, and an MP3 file.
- Added client-side `.mp3` extension validation. A valid submission only prints `success` to the browser console and displays confirmation; it does not upload, save, or add the session to the archive.
- Documented that the password is visible in front-end code and must be replaced with trusted authentication/access control for production.

## 2026-11-05 — Listening player website shell

- Replaced the empty document with a single-page site titled **The Lad's Listening Stones**, including header navigation, introduction, listening area, about section, and footer.
- Added campaign selection for Princes and Eberron and four illustrative sample sessions per campaign. Session selection updates the session number, title, summary, characters, and players.
- Added native audio controls with an explicit no-recording placeholder state. No audio files were supplied, so playback is not yet connected.
- Added responsive styling, keyboard skip navigation, visible focus treatments, semantic landmarks, and responsive session details to support narrow screens and zoom.
- Applied a dark leather, parchment, aged-gold, and red accent palette based on a text description of the D&D 3.5 Player's Handbook cover: antique book-like materials, gold title plates, and red/amber accents. Reference description: [UNAM art and design journal PDF](https://masam.cuautitlan.unam.mx/seminarioarteydiseno/revista/index.php/reiadyc/article/download/384/228/526).
- Added README usage notes and identified replacing sample data and connecting Supabase/audio storage as future work.

### Implementation notes for future Supabase work

- `script.js` currently owns a static `campaigns` object. Replace it with data retrieval while preserving the campaign-to-session relationship and the fields consumed by `renderSession()`.
- The audio element has no source until recordings are provided. Set its `src` from the selected session's recording URL when available, then update the status text for loading/error states.
- Sample names and descriptions are invented demonstration content; confirm actual campaign details, character names, player names, and recording locations before publishing real archive data.

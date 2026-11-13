# The Lad's Listening Stones

A responsive listening room for a group's Dungeons & Dragons campaign recordings. Visitors can browse campaigns and sessions, listen to public recordings, and submit recordings and session details with the group upload password.

## Features

- Loads campaigns, sessions, descriptions, characters, and players from Supabase.
- Plays recordings from the public Supabase Storage bucket named `Recordings`.
- Accepts MP3 and M4A uploads through a password-gated form.
- Splits large recordings in the submitter's browser into playable files below the 50 MB Storage limit. Each part is stored as its own session, such as `3.1_Tomb_of_the_Moving_Stones.m4a` and `3.2_Tomb_of_the_Moving_Stones.m4a`.
- Saves session, character, player, and participation-link rows through a Supabase Edge Function. Matching character and player names are reused.
- Includes a GitHub Actions workflow to build and deploy the site to GitHub Pages.

## Technology

- HTML, CSS, and JavaScript modules
- Vite
- Supabase JavaScript client, database, Storage, and Edge Functions
- FFmpeg WebAssembly for browser-side audio splitting
- GitHub Pages and GitHub Actions

## Run locally

Requirements: Node.js 20.19+ or 22.12+.

1. Install dependencies:

   ```sh
   npm ci
   ```

2. Copy `.env.example` to `.env.local` and fill in the Supabase Project URL and Publishable key:

   ```powershell
   Copy-Item .env.example .env.local
   ```

3. Start the local development server:

   ```sh
   npm run dev
   ```

Build and preview commands:

```sh
npm run build
npm run preview
```

`.env.local` is ignored by Git. The Publishable key is intended for browser use; never place a Supabase secret or service-role key in a `VITE_` variable.

## Supabase setup

The site expects the following tables and relationships:

- `Campaigns` with `id` and `campaign_name`
- `Sessions` with `id`, `recording_url`, `session_name`, text `session_number`, `campaign_ID`, optional `session_date`, and `session_description`
- `Characters` and `Players`
- `SessionCharacters` linking sessions to characters
- `SessionPlayers` linking sessions to players

The listening page needs public `SELECT` access and matching RLS policies for the tables it reads. The upload function writes database rows using its server-side key; keep that key out of the website. The `Recordings` bucket must exist and be public so listeners can play its files.

### Deploy the upload Edge Function

The function source is `supabase/functions/submit-recording/index.ts`. It expects the `RECORDING_UPLOAD_PASSWORD` Edge Function secret. Set that secret in the Supabase Dashboard under the project's Edge Function secrets, using that exact name. The Supabase Edge Function runtime supplies the project URL and service-role key to the function.

From a terminal in the project folder, authenticate and link the Supabase CLI to the project, then deploy:

```powershell
npx.cmd supabase login
npx.cmd supabase link --project-ref YOUR_PROJECT_REF
npx.cmd supabase functions deploy submit-recording
```

The function configuration disables gateway JWT verification because access is checked using the Edge Function password. Do not put the upload password or a Supabase secret key in this repository.

## Deploy to GitHub Pages

The workflow at `.github/workflows/deploy-pages.yml` builds the site and deploys the `dist` directory when changes are pushed to `main`. In the repository's **Settings > Pages**, set the deployment source to **GitHub Actions**.

Add these repository variables under **Settings > Secrets and variables > Actions > Variables** so the build can configure the browser client:

- `VITE_SUPABASE_URL`: Supabase Project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY`: Supabase Publishable key

The Vite base path is configured for this repository's project page at `https://landonm-byui.github.io/D-D-recording-player/`.

## Upload behavior and limits

- Each uploaded part is capped at 48 MiB to stay below the bucket's 50 MB per-file limit.
- Files above that size are split into parts with session numbers such as `3.1`, `3.2`, and so on. Each part gets its own session row and public recording URL.
- Session dates are optional. A blank date is stored as `NULL`.
- The browser performs the split locally, so larger recordings use the submitter's device memory and processing power.
- Uploaded object names follow `{session-number}_{session-name}` with spaces replaced by underscores and the original `.mp3` or `.m4a` extension.

See [CHANGELOG.md](CHANGELOG.md) for the implementation history and [specification1.md](specification1.md) for the original project requirements.

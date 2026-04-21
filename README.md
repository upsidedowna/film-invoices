# Invoice Generator

Pure client-side invoice tool. Two templates (Coverage Invoice / Production Quote). Downloads a pixel-close PDF.

## Run locally
Just open `index.html` in a browser. No server needed.

```bash
open /Users/ambriacornelius/projects/invoice-generator/index.html
```

Or run a simple local server (some features work better this way):

```bash
cd /Users/ambriacornelius/projects/invoice-generator
python3 -m http.server 8000
# then open http://localhost:8000
```

## First-time setup
1. Click **⚙ Settings** in the header
2. Fill in your business info (name, address, phone, payment details)
3. Click **Load my default kit** if you want Ambria's preset gear catalog, or add your own items
4. **Save Settings**

All data stays on this device in localStorage. Login + cloud sync is on the roadmap.

## Using it
- Pick a **Template** (Coverage Invoice for day-by-day, Production Quote for grouped/branded)
- Fill in client + project fields (left pane)
- Click **+ Add** in any section to add line items
- Pick gear from your **Kit catalog** dropdown → tap ⤴ Add
- Click **⬇ Download PDF** to save

## Telegram integration
Atlas (the bot) can draft invoices from your phone. Atlas sends you a URL like:

```
file:///.../index.html?draft=<base64-json>
```

Open the link on your Mac, review, adjust, download.

## Deploy to Vercel (free, no domain needed)
When you want internet access to this tool without paying for anything:

1. Create a free Vercel account at [vercel.com](https://vercel.com) (GitHub login works)
2. Install Vercel CLI: `npm i -g vercel`
3. From this directory: `vercel` — follow prompts
4. You'll get a free URL like `invoice-generator-ambria.vercel.app`

No domain purchase required. Auto-redeploys on git push if you link a repo.

## Future
- Login + accounts (per-user data, not per-device)
- Cloud save of recents + clients + kit
- Template designer (custom colors, logo upload)
- Email-direct option (email the client, don't just download)
- Gumroad integration for paid tier

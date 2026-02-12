# Site Directory

This directory contains the static site for [clutch.md](https://clutch.md) — the landing page for OpenClutch.

## Structure

```
site/
├── index.html    # Main landing page (single-file site)
└── README.md     # This file
```

The site is intentionally simple: a single HTML file with embedded CSS. No build step required.

## Local Development

Since this is a static HTML site, you can preview it using any static file server:

### Option 1: Python (built-in)

```bash
cd site/
python3 -m http.server 8080
# Open http://localhost:8080
```

### Option 2: Node.js (npx serve)

```bash
cd site/
npx serve -p 8080
# Open http://localhost:8080
```

### Option 3: VS Code Live Server

Install the "Live Server" extension, right-click `index.html`, and select "Open with Live Server".

## Making Changes

1. Edit `index.html` directly
2. Test locally using one of the methods above
3. Commit and push — see deployment below

## Deployment

The site deploys automatically via GitHub Actions:

**Trigger:** Push to `main` branch with changes to:
- `site/**` (any file in this directory)
- `.github/workflows/deploy-site.yml` (workflow changes)

**Deployment process:**
1. Syncs files to S3 bucket (`clutch.md`)
2. Invalidates CloudFront cache
3. Site live at https://clutch.md

**Workflow file:** `.github/workflows/deploy-site.yml`

## Notes

- The site uses inline CSS for simplicity (no external assets to manage)
- HTML files are deployed with `no-cache` headers for instant updates
- Static assets (if added later) would use long-term caching

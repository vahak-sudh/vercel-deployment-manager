# Vercel Deployment Manager

Next.js App Router rewrite of the vanilla `vercel-deployment-manager.html` console.

## Features

- List paginated Vercel deployments (20/page, cursor pagination)
- Group by git commit
- Cancel building/queued deployments (single or whole commit)
- Redeploy by project + branch (single or whole commit)
- Search + status filter chips
- **New:** Team and project filters
- **New:** Auto-refresh while builds are running
- **New:** Token stored in httpOnly cookie; all Vercel calls go through Next.js API routes

## Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), paste a token from [vercel.com/account/tokens](https://vercel.com/account/tokens), then Fetch.

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm start` — run production server

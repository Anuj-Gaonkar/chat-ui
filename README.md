A minimal test-harness chat UI for the `chat-bot-service` backend (a separate sibling repo) — not
a production banking UI. Two pages: `/` drives a live conversation against the workflow engine
(start with a phone number, tap through the flow), `/journey` looks a phone number up and replays
its whole conversation end to end. See `../NEXTJS_CHAT_UI_BRIEF.md` (in the parent directory) for
the full API contract this app is built against and the current state of what's implemented.

Requires the backend running (`docker compose up -d && ./mvnw spring-boot:run` in
`chat-bot-service`) and `.env.local` with `NEXT_PUBLIC_API_BASE_URL` pointed at it (defaults to
`http://localhost:8080`) — API calls are proxied through `next.config.ts`'s `rewrites()`, so the
backend needs no CORS configuration.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

# RAG ChatBot — AI-Powered Candidate Search Platform (Frontend)

A premium recruiter SaaS frontend built with React 18, TypeScript, Vite, and Tailwind CSS. Talks to the
`backend` service (default `http://localhost:4000/api`) for all data — candidate uploads, listing, natural
language search, and the AI recruitment chatbot.

## Getting started

```bash
npm install
npm run dev
```

The app runs on `http://localhost:5173`.

Copy `.env.example` to `.env` and adjust `VITE_API_BASE_URL` if your backend runs somewhere other than
`http://localhost:4000/api`.

## Scripts

- `npm run dev` — start the Vite dev server
- `npm run build` — type-check (`tsc -b`) and build for production
- `npm run preview` — preview the production build locally

## Pages

1. **Candidate Creation** (`/`) — drag-and-drop resume upload with an animated processing pipeline.
2. **Candidate List** (`/candidates`) — filterable, paginated candidate table with a profile drawer.
3. **Candidate Search** (`/search`) — natural-language AI search with ranked, justified results.
4. **AI Chatbot** (`/chatbot`) — conversational recruiting assistant, also available as a floating
   assistant on every other page.

## Tech

React Router v6, Zustand (chat session + theme + candidate profile state), Framer Motion, Radix UI
primitives styled as a local shadcn-style component library (`src/components/ui`), react-dropzone,
date-fns, lucide-react.

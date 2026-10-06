# Notebook LLM Clone — Backend

The backend for a NotebookLM-inspired learning application. It lets users organize material into workspaces, ingest PDFs, websites, YouTube transcripts, plain text, and Markdown, turn that material into searchable embeddings, and use the retrieved context to build grounded AI experiences.

This README explains both how to run the server and how the Retrieval-Augmented Generation (RAG) pipeline works. It reflects the current repository state; see [Implementation status](#implementation-status) for features that exist at the service layer but are not exposed through HTTP yet.

## What this server does

- Authenticates users with Better Auth and Google OAuth.
- Keeps every user's workspaces and data isolated.
- Imports source material from PDFs, websites, and captioned YouTube videos.
- Processes sources asynchronously with Inngest.
- Splits documents into chunks and creates OpenAI embeddings.
- Stores and searches vectors in a separate Pinecone namespace per workspace.
- Builds grounded prompts from the most relevant source chunks.
- Streams model responses and stores conversations with citations.
- Supports optional live web search through Tavily.
- Supports optional long-term user memory through Mem0.
- Generates learning artifacts such as summaries, flashcards, quizzes, mind maps, takeaways, and reports at the service layer.

## RAG in plain English

A language model does not automatically know the documents a user uploaded. RAG solves that problem by finding the most relevant parts of those documents before asking the model to answer.

This project uses two related pipelines.

### 1. Source ingestion

```mermaid
flowchart LR
    A[PDF, website, YouTube, or text] --> B[Extract clean text]
    B --> C[Split into chunks]
    C --> D[Create OpenAI embeddings]
    D --> E[Store vectors in Pinecone]
    C --> F[Store readable chunks in PostgreSQL]
    E --> G[Source status: READY]
```

Each embedding is a numerical representation of a chunk's meaning. Similar ideas end up close to one another in vector space, even if they use different words.

### 2. Question answering

```mermaid
flowchart LR
    A[User question] --> B[Embed the question]
    B --> C[Search the workspace's Pinecone namespace]
    C --> D[Keep the best relevant chunks]
    D --> E[Build prompt with sources, memory, and chat summary]
    E --> F[Stream the model's answer]
    F --> G[Save answer and citations]
```

The current retrieval configuration is:

| Setting | Value | Purpose |
| --- | --- | --- |
| Embedding model | `text-embedding-3-small` | Converts source chunks and questions into vectors |
| Dimensions | `1536` | Must match the Pinecone index dimension |
| Chunk size | `1000` characters | Keeps retrieved passages focused |
| Chunk overlap | `100` characters | Preserves context around hard split boundaries |
| Retrieval count | Top `6` chunks | Limits how much source context enters a prompt |
| Minimum score | `0.35` cosine similarity | Removes weak matches |

PDF chunks retain page numbers, allowing responses to include page-aware citations. Vectors are separated by workspace using Pinecone namespaces, which prevents retrieval from mixing different notebooks.

## Architecture

The server follows a layered architecture:

```text
HTTP request
    │
    ▼
Routes → authentication middleware → controllers → Zod validation
                                                │
                                                ▼
                                            services
                                      ┌─────────┼─────────┐
                                      ▼         ▼         ▼
                                repositories  AI/RAG   external APIs
                                      │
                                      ▼
                                  PostgreSQL
```

- **Routes** define the HTTP interface.
- **Middleware** handles sessions, PDF uploads, and errors.
- **Controllers** parse requests and return HTTP responses.
- **Validators** define request contracts with Zod.
- **Services** contain business rules and orchestration.
- **Repositories** isolate Prisma database operations.
- **Inngest functions** run retryable background workflows.
- **Library modules** wrap OpenAI, Pinecone, Firecrawl, Cloudinary, Tavily, Mem0, and Better Auth.

### Why background jobs are used

Document processing can involve uploads, extraction, many embedding requests, and vector writes. Doing all of that inside one HTTP request would be slow and fragile. Instead, an import creates a `PENDING` source and emits a `source/created` event. Inngest then runs the durable workflow:

1. Mark the source `PROCESSING`.
2. Extract or load its text.
3. Split and store chunks.
4. Embed chunks in batches of 50.
5. Upsert vectors into Pinecone in batches of 100.
6. Mark the source `READY`.
7. Retry failures up to three times and finally mark the source `FAILED` with an error in its metadata.

This status model lets the client poll a source without holding an upload request open.

## Technology stack

| Area | Technology |
| --- | --- |
| Runtime | Node.js, TypeScript, ES modules |
| HTTP API | Express 5 |
| Validation | Zod |
| Database | PostgreSQL, Prisma 7, Prisma PostgreSQL adapter |
| Authentication | Better Auth, Google OAuth |
| AI generation and streaming | Vercel AI SDK, OpenAI |
| Embeddings | OpenAI `text-embedding-3-small` |
| Vector database | Pinecone |
| Background jobs | Inngest |
| PDF storage and extraction | Cloudinary, Multer, UnPDF |
| Website extraction | Firecrawl |
| YouTube ingestion | `youtube-transcript` |
| Optional web search | Tavily |
| Optional user memory | Mem0 |

## Project structure

```text
server/
├── prisma/
│   ├── migrations/             # Database migration history
│   └── schema.prisma           # Application data model
├── src/
│   ├── controllers/            # HTTP request/response handlers
│   ├── generated/prisma/       # Generated Prisma client
│   ├── inngest/                # Background job client and functions
│   ├── lib/
│   │   └── rag/retrieve.ts     # Vector retrieval and prompt construction
│   ├── middleware/             # Authentication, uploads, errors
│   ├── repositories/           # Database access layer
│   ├── routes/                 # Express route definitions
│   ├── services/               # Application and AI workflows
│   ├── types/                  # Shared error types
│   ├── utils/                  # Request and chat helpers
│   └── index.ts                # Express application entry point
├── package.json
├── prisma7.config.ts
└── tsconfig.json
```

## Data model

The main relationships are:

```text
User
├── Sessions / Accounts
└── Workspaces
    ├── Sources
    │   └── SourceChunks
    ├── Conversations
    │   └── Messages
    └── LearningArtifacts
```

- A **Workspace** is a user's notebook and owns all of its sources, chats, and artifacts.
- A **Source** tracks its type, original content or URL, metadata, and processing status.
- A **SourceChunk** stores the readable text that was embedded. The matching vector ID is the chunk ID.
- A **Conversation** stores a rolling summary so long chats do not need to resend their entire history.
- A **Message** stores the role, content, and source/web citations.
- A **LearningArtifact** stores generated structured JSON for a summary, quiz, flashcard set, mind map, or report.

Deleting a workspace cascades through its PostgreSQL records. The workspace's Pinecone namespace is also removed on a best-effort basis.

## Getting started

### Prerequisites

- Node.js 22 or newer
- npm
- PostgreSQL
- An OpenAI API key
- A Pinecone account
- An Inngest account or the Inngest local development server
- Google OAuth credentials for the configured authentication flow
- Service credentials for whichever import/optional features you use

### 1. Install dependencies

From the repository root:

```bash
cd server
npm install
```

### 2. Configure environment variables

Create `server/.env` and add the following values. Do not commit this file.

```dotenv
# Server
PORT=3001
CLIENT_URL=http://localhost:3000
NODE_ENV=development

# PostgreSQL
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/notebook_llm

# Better Auth and Google OAuth
BETTER_AUTH_URL=http://localhost:3001
BETTER_AUTH_SECRET=replace-with-a-long-random-secret
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Required for RAG and AI generation
OPENAI_API_KEY=your-openai-api-key
PINECONE_API_KEY=your-pinecone-api-key
PINECONE_INDEX=notebook-llm-clone

# Required for PDF uploads
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_UPLOAD_PRESET=your-unsigned-upload-preset
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret

# Required for website imports
FIRECRAWL_API_KEY=your-firecrawl-api-key

# Optional enhancements
TAVILY_API_KEY=your-tavily-api-key
MEM0_API_KEY=your-mem0-api-key

# Normally required when deploying Inngest; local development can use the dev server
INNGEST_EVENT_KEY=your-inngest-event-key
INNGEST_SIGNING_KEY=your-inngest-signing-key
```

`PINECONE_INDEX` is optional and defaults to `notebook-llm-clone`. If the index does not exist, the server creates a serverless cosine index in AWS `us-east-1` with 1536 dimensions.

`TAVILY_API_KEY` and `MEM0_API_KEY` are optional. With no Tavily key, web search is disabled. With no Mem0 key, memory lookup and automatic learning are skipped, although memory write endpoints still require Mem0 to be configured.

For Google OAuth, register the Better Auth callback URL for your server, normally:

```text
http://localhost:3001/api/auth/callback/google
```

### 3. Generate the Prisma client and apply migrations

```bash
npx prisma generate
npx prisma migrate dev
```

For an already-migrated production database, use:

```bash
npx prisma migrate deploy
```

### 4. Start the API

```bash
npm run dev
```

The defaults in this README assume:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`
- Health check: `GET http://localhost:3001/health`

### 5. Start Inngest locally

In a second terminal, point the Inngest development server at the Express handler:

```bash
npx inngest-cli@latest dev -u http://localhost:3001/api/inngest
```

The dashboard shows received events, individual processing steps, retries, and errors. Source imports will remain `PENDING` if events are not being processed.

## Available scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the TypeScript server in watch mode |
| `npm run build` | Type-check and compile to `dist/` |
| `npm start` | Run the compiled server from `dist/index.js` |

## HTTP API

All workspace, source, and memory endpoints require a valid Better Auth session. Browser clients must send cookies, for example with `credentials: "include"`. Better Auth is mounted at `/api/auth/*`.

### Public endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/` | Basic route response |
| `GET` | `/health` | Health check |
| `ALL` | `/api/auth/*` | Better Auth endpoints |
| `ALL` | `/api/inngest` | Inngest serve and registration endpoint |

### Workspaces

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/workspaces` | List the current user's workspaces |
| `POST` | `/api/workspaces` | Create a workspace |
| `GET` | `/api/workspaces/:workspaceId` | Get one owned workspace |
| `PATCH` | `/api/workspaces/:workspaceId` | Update an owned workspace |
| `DELETE` | `/api/workspaces/:workspaceId` | Delete a workspace and its related data |

Create a workspace:

```json
{
  "title": "Machine Learning Notes",
  "description": "Papers, lectures, and revision material",
  "icon": "🧠",
  "defaultModel": "gpt-4o-mini"
}
```

Supported workspace models are currently `gpt-4o-mini` and `gpt-4o`.

### Sources

All source endpoints are nested under an owned workspace.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/workspaces/:workspaceId/sources` | List sources; accepts `q`, `type`, and `status` filters |
| `GET` | `/api/workspaces/:workspaceId/sources/:sourceId` | Get one source |
| `POST` | `/api/workspaces/:workspaceId/sources/upload` | Upload a PDF as multipart field `file` (maximum 10 MB) |
| `POST` | `/api/workspaces/:workspaceId/sources/import/website` | Import a website through Firecrawl |
| `POST` | `/api/workspaces/:workspaceId/sources/import/youtube` | Import a captioned YouTube video |
| `POST` | `/api/workspaces/:workspaceId/sources/bulk-delete` | Delete multiple sources |
| `DELETE` | `/api/workspaces/:workspaceId/sources/:sourceId` | Delete one source |
| `POST` | `/api/workspaces/:workspaceId/sources` | Reserved for text/Markdown creation; see implementation status |

Website import body:

```json
{
  "url": "https://example.com/article",
  "title": "Optional custom title"
}
```

YouTube import body:

```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "title": "Optional custom title"
}
```

Only videos with accessible captions can be imported. The current transcript integration is intended for English-captioned videos.

PDF upload example:

```bash
curl -X POST http://localhost:3001/api/workspaces/WORKSPACE_ID/sources/upload \
  --cookie "better-auth.session_token=YOUR_SESSION_COOKIE" \
  -F "file=@./paper.pdf" \
  -F "title=Attention Is All You Need"
```

Source list filters can be combined:

```text
GET /api/workspaces/WORKSPACE_ID/sources?q=transformer&type=PDF&status=READY
```

Valid source types are `PDF`, `WEBSITE`, `YOUTUBE`, `TEXT`, and `MARKDOWN`. Valid statuses are `PENDING`, `PROCESSING`, `READY`, and `FAILED`.

### Memories

These endpoints store user-level memory in Mem0 rather than PostgreSQL.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/memory` | List up to 100 memories |
| `POST` | `/api/memory` | Create a manual memory |
| `PATCH` | `/api/memory/:memoryId` | Replace a memory's text |
| `DELETE` | `/api/memory/:memoryId` | Delete a memory |

Create or update body:

```json
{
  "memory": "I prefer short explanations followed by examples."
}
```

### Errors

Errors use a consistent JSON shape:

```json
{
  "error": "Validation failed",
  "details": {
    "title": ["Title is required"]
  }
}
```

Expected application errors return `400`, `401`, `404`, or `409`. Unexpected errors are logged server-side and returned as `500` without exposing internal details.

## Chat, citations, and memory

The chat service is designed around the Vercel AI SDK's UI message stream protocol:

1. Save the user's latest message.
2. Search Pinecone and Mem0 in parallel.
3. Add retrieved chunks, relevant memories, and any rolling conversation summary to the system prompt.
4. Optionally expose Tavily as a model tool when web search is requested.
5. Stream the answer to the client.
6. Save the assistant response and its citations.
7. Learn useful memory from the exchange when Mem0 is enabled.

Source citations store the source, chunk, optional PDF page, excerpt, and similarity score. Web citations store the title, URL, and excerpt.

Every eight persisted messages, an Inngest event creates a rolling summary. Once a summary exists, the model receives that summary plus the most recent 12 UI messages instead of relying only on a continuously growing context window.

## Learning artifacts

The service layer supports six generated artifact types:

| Type | Output |
| --- | --- |
| `SUMMARY` | Markdown summary |
| `TAKEAWAYS` | Structured list of key points |
| `FLASHCARDS` | Front/back study cards |
| `QUIZ` | Multiple-choice questions with answers and explanations |
| `MINDMAP` | Nodes and edges for visualization |
| `REPORT` | Structured sections plus complete Markdown |

Artifacts use only `READY` source content, with a maximum combined context of 120,000 characters. Structured outputs are validated with Zod before being stored as JSON.

## Implementation status

The repository contains more service-layer functionality than the currently mounted HTTP API. This distinction is useful for contributors:

| Capability | Current state |
| --- | --- |
| Authentication | Mounted at `/api/auth/*` |
| Workspace CRUD | Mounted and functional |
| PDF, website, and YouTube imports | Mounted; processing requires Inngest |
| Source listing, filtering, and deletion | Mounted |
| Text/Markdown source creation | Route and validation exist, but the service body is not implemented |
| RAG chat and conversation persistence | Service implementation exists; controllers/routes are not mounted yet |
| Learning artifacts | Repository, validation, generation, and worker code exist; controllers/routes are not mounted yet |
| Artifact worker | Defined, but not currently included in the exported Inngest `functions` array |
| Mem0 memory CRUD | Mounted; a Mem0 key is required for writes |
| Source vector cleanup on source deletion | Helper exists, but the delete flow does not currently call it |
| Automated tests | Not added yet; `npm run build` is the current verification command |

These are the main integration tasks remaining before every implemented service is reachable end to end.

## Security and production notes

- Every workspace operation verifies ownership through the authenticated user ID.
- CORS allows only `CLIENT_URL` and enables credentialed requests.
- PDF uploads use in-memory buffering, accept only `application/pdf`, and are limited to 10 MB.
- Secrets belong in environment variables and must never be committed.
- Use a long random `BETTER_AUTH_SECRET` and HTTPS in production.
- Restrict OAuth callback URLs and allowed origins to deployed domains.
- Keep Pinecone, Cloudinary, Firecrawl, Tavily, and Mem0 keys server-side.
- Add rate limits, request logging, observability, and API-level tests before a public production launch.
- Review deletion behavior for third-party data: PostgreSQL cascade deletion does not automatically imply deletion from every external provider.

## Troubleshooting

### A source stays `PENDING`

Make sure the Inngest dev server is running and can reach `/api/inngest`. Check its dashboard for the `source/created` event.

### A source becomes `FAILED`

Inspect `source.metadata.processingError` and the Inngest run. Common causes are missing API keys, inaccessible PDFs, no YouTube captions, empty extracted text, or an embedding/index error.

### Pinecone rejects vectors

The index must use cosine similarity and 1536 dimensions. Delete or rename an incompatible development index, or point `PINECONE_INDEX` to a compatible one.

### PDF upload is rejected

Confirm that the file is a PDF under 10 MB and that `CLOUDINARY_UPLOAD_PRESET` exactly matches an unsigned preset. The Cloudinary API key also needs upload permission when using authenticated operations.

### Browser requests return `401`

Send cookies with the request, verify `CLIENT_URL`, and confirm that Better Auth's server URL and Google callback URL match the environment.

## Contributing

Keep new backend work within the existing layers: route → controller → validator/service → repository. For RAG changes, keep PostgreSQL chunk metadata and Pinecone vector metadata in sync, preserve workspace scoping, and update this README whenever an internal capability becomes part of the public API.

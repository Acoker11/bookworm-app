# BookWorm

Build **BookWorm**, a Netflix-style book browsing app where anyone can discover books and read other readers' logs, and signed-in users can build a personal library and write logs about what they read.

You will build and deploy this application yourself using **Claude Code**. You are responsible for everything that ships, including the parts Claude Code wrote for you.

<a href="https://docs.google.com/spreadsheets/d/12VXSh01Toe5lbbHTBuJ8mdwhuV3GgaMA5phU_EbEntw/edit?usp=drive_link" target="_">**RUBRIC**</a>

---

## Tech Stack (required)

| Layer | Technology |
|---|---|
| Hosting | Vercel |
| Frontend | Vite + React, React Router DOM |
| Backend | Supabase |
| Database | Supabase PostgreSQL |
| Auth | Supabase Auth |
| CRUD API | Supabase PostgREST (via `supabase-js`) |
| Business logic / third-party calls | Supabase Edge Functions |
| Third-party API | [Google Books API](https://developers.google.com/books) |

**Out of scope:** WebSockets, Supabase Realtime channels, Redis, and caching layers. Data does not need to update live; a page refresh is fine.

---

## The Challenge

The core challenge is not just building CRUD screens. It is building an application that:

1. Talks to a third-party API **without ever exposing your API key**
2. Protects user data with **database-level authorization** (Row Level Security), not just hidden buttons
3. Is **deployed** and works from a fresh browser

You will need to read the Google Books API documentation to figure out how to query it. We will not tell you which parameters to use.

---

## Functional Requirements

### Public (no login required)

**Home page**
- Displays books related to **"technology"** in a browsable, Netflix-inspired layout (cover, title, and author(s) at minimum).

**Search**
- Users can search for books by **title only**. Searching by author, ISBN, or keyword is not part of this app.

**Genre filtering**
- Users can browse books by genre. The required genres are:
  - Adventure
  - Technology
  - Horror
  - Sci-Fi
  - Fiction
  - Non-Fiction
- Figuring out how to translate each genre into a Google Books request is part of the assessment.

**Load more**
- Any list of books (home, search results, genre results) must support loading additional results. Implement it either as a **"Load More" button** or as **automatic loading when the user reaches the bottom of the page**. Be mindful that the API limits how many results come back per request.

**Book details page**
- Clicking a book navigates to its own route (for example, `/books/:id`) that shows:
  - Book details from the Google Books API (title, author(s), description, cover image, and at least two additional fields of your choice)
  - **Logs written by all users** for that book, showing the author's display name and date
- The page must work when visited directly by URL or refreshed.

### Authenticated users

**Sign up / login / logout**
- Email and password via Supabase Auth.
- Every user must have a **profile with a display name**. Logs show the display name, never the email address.

**My Library**
- Users can add a book to their library (from the details page or elsewhere) and remove it.
- Each library entry has a **reading status** (`want to read`, `reading`, `finished`) that the user can change. This is the library's "update" operation.
- A library is **private**. Users can only see and manage their own.

**Logs**
- From a book in their library, users can write logs about what they have read and what they think of it.
- Each log has a body of text and an optional 1-5 rating.
- Users have **full CRUD on their own logs** and can only **view** other users' logs.
- A log can only exist for a book that is in its author's library. This must be enforced **in the database**, not only in the UI.
- If a book is removed from a library, its logs are deleted with it.

---

## Data Model (minimum)

You will design the exact schema, but it must include at least these tables:

| Table | Purpose |
|---|---|
| `profiles` | One row per user. Display name, linked to the auth user. |
| `library_items` | A user's saved books (Google Books volume ID, reading status). |
| `logs` | A user's written entries about a book in their library. |

**Design problem to solve:** libraries are private, but logs must be publicly readable on a book's page. Design your schema and policies so the book page can list every user's logs **without** exposing anyone's library.

All tables must have **Row Level Security enabled** with policies that match the rules above.

---

## Edge Function Requirements

All Google Books requests must go through **at least one Supabase Edge Function**. The browser must never call Google Books directly.

Your function(s) must:

- Be callable by **anonymous visitors**. Public pages mean you cannot require login, so you must compensate with input validation
- **Validate input**: reject missing or oversized queries and out-of-range page values
- **Shape the response**: return only what the UI needs, not the raw Google payload (for example, handle missing covers and descriptions, and use https image URLs)
- **Handle failure gracefully**: upstream errors, rate limiting (HTTP 429), and timeouts return a meaningful error, and the UI shows a friendly error state instead of crashing
- Configure **CORS** correctly
- Never expose the API key

---

## Secrets Management (non-negotiable)

You must create **your own** Google Books API key in Google Cloud Console. Do not share keys with classmates.

- The key lives only in a secure and secret location.
- The key must **never** appear in client-side code, in a `VITE_`-prefixed variable, in the deployed JavaScript bundle, in your repo, or in your git history
- Vercel environment variables should contain only the public Supabase URL and anon key
- `.env` files are gitignored
- Include a `.env.example` listing every variable needed, with **no real values**

> **Warning:** Anything prefixed `VITE_` is compiled into the code shipped to every visitor's browser. Claude Code will happily put a secret in the wrong place if prompted carelessly. Review what it writes.
>
> A key that was committed and then deleted is **still leaked**. If it happens, rotate the key and notify the instructional staff when turning in your assessment.

---

## Deployment Requirements

- Frontend deployed on **Vercel**; Edge Functions and database on **Supabase**
- Deep links and page refreshes must work on every route (configure Vercel rewrites for React Router)
- Supabase Auth redirect URLs must be configured for your deployed domain
- A new user must be able to sign up on the deployed site and complete every feature above

---

## Claude Code Workflow (also evaluated)

You must build BookWorm with Claude Code, and **how you use it is graded alongside the application itself.** The finished app is not enough; we are evaluating your process.

### Prompt records (automatic)

Your project includes hooks that run automatically while you work:

- One hook **writes each prompt you send** into the `prompt-records/` directory.
- Another hook **appends your context window status** to those records after Claude Code acts.

Rules:

- Do not edit, disable, delete, or rewrite the hooks or the records. Tampering is an automatic fail.
- Commit `prompt-records/` with your submission. It is part of your deliverables.
- **Never paste secrets into a prompt.** Your records are submitted with your repository, so a key typed into a prompt is a leaked key.

### Required Claude Code configuration

Your repository must include working, project-level configuration that you wrote for this application:

| Component | Minimum | Expectation |
|---|---|---|
| **Subagents** | At least 1 custom subagent | Delegates a focused task, such as reviewing RLS policies, auditing for secrets, or exploring the codebase. It has a clear description and a restricted set of tools. |
| **Skills** | At least 1 custom skill | Encodes a repeatable procedure or convention for this project. It is invoked when relevant, not copy-pasted into prompts. |
| **MCP servers** | At least 1 MCP server | Helps you manage the application, for example its database or deployment. Choose it deliberately and justify it. |

Be careful with MCP server credentials. The secrets rules above apply to them as well. Tokens must not be committed in your MCP config, repository, or prompts.

### Context management

You will be evaluated on how deliberately you manage Claude Code's context window. We will look for evidence such as:

- A maintained `CLAUDE.md` with project conventions and constraints, not a dump of everything
- Working in focused sessions and clearing or compacting at sensible points
- Delegating noisy or exploratory work to subagents so it does not flood your main context
- Giving Claude only the files, errors, and information a task needs
- Context window status in your prompt records that shows you are keeping usage under control instead of letting it fill up

### Exercise the Prompt Life Cycle

> DEFINE >> EXPLORE >> PLAN >> CODE >> REVIEW >> COMMIT

---

## Deliverables

1. GitHub repository URL
2. Deployed application URL
3. `README` in your repo with setup instructions, including how to run it locally and which secrets are needed
4. `.env.example`
5. `prompt-records/` directory, unmodified
6. Your Claude Code configuration (subagents, skills, and MCP server setup, with no secrets committed)
7. Access to your Supabase project and Github Repository

---

## How You Will Be Evaluated

Your project will be assessed across these areas:

- **Functionality:** every requirement above works on the deployed site
- **Secrets handling:** key placement, bundle, and git history
- **Authorization:** RLS policies and data isolation between users
- **Edge Function quality:** validation, response shaping, error handling
- **Frontend quality:** routing, load-more behavior, loading and error states
- **Data modeling:** a clean schema that solves the library/logs privacy problem
- **Claude Code implementation:** subagents, skills, and MCP servers that are purposeful and working
- **Context management:** evidence of deliberate context window usage
- **Prompt engineering:** the quality and progression of your recorded prompts

### Automatic fail conditions

- The API key is found in the deployed bundle, the repository, or git history
- The browser calls Google Books directly
- The deployed site does not work
- The prompt-recording hooks or records were tampered with, disabled, or are missing
- A secret appears in `prompt-records/` or in committed MCP configuration

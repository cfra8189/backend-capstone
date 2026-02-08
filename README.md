# The Box — Backend

## Description

This folder contains the backend services for The Box, providing REST API endpoints, authentication, database models, and integrations required by the frontend. The backend is designed for local development and production deployment, using modern Node.js tooling and TypeScript for clarity and safety.

## Table of Contents

- [Technologies Used](#technologies-used)
- [API Overview](#api-overview)
- [Features](#features)
- [Planned Enhancements](#planned-enhancements)
- [Local Development](#local-development)
- [Deployment](#deployment)
- [Author](#author)
- [Development Process](#development-process)
- [References](#references)

## <a name="technologies-used"></a>Technologies Used

- **Node.js** — Runtime for the server
- **Express** — HTTP server and routing
- **TypeScript** — Type safety and developer ergonomics
- **ts-node / tsx** — Runtime for TypeScript in development
- **MongoDB / Mongoose / Drizzle** — Data persistence
- **Passport / passport-google-oauth20** — Authentication strategies
- **Jest / Supertest** — Testing (where applicable)

## <a name="api-overview"></a>API Overview

The backend exposes the following major route groups (examples):

- `/api/auth` — Authentication endpoints (Google OAuth, logout, session)
- `/api/users` — User profile retrieval and updates
- `/api/projects` — CRUD for music projects
- `/api/documents` — Uploading and managing files
- `/api/creative` — Notes and creative workspace endpoints
- `/api/uploads` — File storage integration endpoints

Refer to the project code for route details and request/response formats.

## <a name="features"></a>Features

- Google OAuth sign-in and session handling for development
- RESTful API organized by resource
- MongoDB-backed models for users, projects, documents, and notes
- Local session store for development and configurable production store
- CORS and proxy-ready configuration for frontend integration

## <a name="planned-enhancements"></a>Planned Enhancements

- Add comprehensive automated tests for API endpoints
- Add role-based access control and permissions
- Implement rate limiting and request throttling in production
- Add metrics and health endpoints for observability
- Improve file upload resiliency and storage provider abstraction

## <a name="local-development"></a>Local Development

Prerequisites:

- Node.js (LTS), npm
- MongoDB connection (local or cloud)

Environment variables

Create a `.env` file in this folder (example keys):

- `MONGODB_URI` — MongoDB connection string
- `SESSION_SECRET` — Secret used for session cookies
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — OAuth credentials
- `GOOGLE_CALLBACK_URL` — Callback registered in Google Cloud Console
- `PORT` — Server port (set via environment variable; if not set the system will assign an available port)

Quick start:

```bash
cd backend
npm install
# start dev server (reloads on change)
npm run dev
```

Common commands:

```bash
npm run build    # build TypeScript to JS
npm run lint     # run linters
npm run test     # run tests
```

## <a name="deployment"></a>Deployment

Deploy the compiled backend to your chosen host (e.g., VPS, Docker container, platform-as-a-service). Ensure environment variables are configured in your deployment environment and that HTTPS is enabled for OAuth redirect URIs. For containerized deployments, provide a production-ready `Dockerfile` and set process manager or container orchestrator to run the built artifact.

## <a name="author"></a>Author

**Clarence Franklin (cfra8189)**

GitHub: https://github.com/cfra8189

## <a name="development-process"></a>Development Process

- Use feature branches and open pull requests for code changes
- Run linters and tests before merging
- Keep API changes backward-compatible where possible

## <a name="references"></a>References

- Express — https://expressjs.com/
- Passport — http://www.passportjs.org/
- MongoDB — https://www.mongodb.com/
- TypeScript — https://www.typescriptlang.org/
Backend

How to run (development):

1. cd backend
2. npm install
3. npm run dev:server (or run the server file directly)

Notes: This folder contains the server TypeScript sources, auth providers, and database code. Move or add environment variables as needed.

## JWT (Access & Refresh) - Minimal Implementation

This backend includes a minimal JWT pattern for API authentication using short-lived access tokens and a rotating refresh token stored as a secure, HTTP-only cookie.

Environment variables to configure:

- `JWT_ACCESS_SECRET` — secret used to sign access tokens
- `JWT_REFRESH_SECRET` — secret used to sign refresh tokens
- `JWT_ACCESS_EXP` — access token expiry (e.g., `15m`)
- `JWT_REFRESH_EXP` — refresh token expiry (e.g., `30d`)

Usage:

- After OAuth login or password login the server issues a refresh token (HTTP-only cookie) and stores a hashed copy in the user record.
- Clients call `POST /api/auth/refresh` to exchange a valid refresh cookie for a new access token; this endpoint also rotates the refresh token.
- Clients call `POST /api/auth/logout` to clear the refresh cookie and remove the stored refresh token.

Note: For production set `cookie.secure=true`, use HTTPS, and store secrets in a secrets manager. This implementation is intentionally minimal to bootstrap secure token-based flows.

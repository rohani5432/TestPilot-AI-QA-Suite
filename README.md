# TestPilot AI

TestPilot AI is a responsive test management workspace for manual QA teams and early-career testers. It keeps test cases, defect reports, execution history, and review-ready reports together, with a transparent rule-based scenario generator.

## Features

- Dashboard metrics and visual summaries calculated from saved test cases, bug reports, and test-run outcomes.
- Test case management with create, view, edit, delete, search, module/status/priority filters, and CSV export.
- Bug tracking with create, view, edit, delete, severity/priority/status/module filters, lifecycle updates, and CSV export.
- Module-based test execution with Pass, Fail, Blocked, and Not Run outcomes, notes, linked bug reports, and persistent history.
- Requirement-driven, rule-based test suggestions for positive, negative, boundary, input-validation, and error-handling scenarios. Suggestions are editable and individually saved as test cases. No AI API is called.
- Execution summary, open bugs by severity, CSV export, and print-friendly reports.
- Editable demo data with a reset action.
- PostgreSQL persistence through the shared API server. No login is required for the initial non-sensitive demo.

## Technology

- React, TypeScript, Vite, Wouter, TanStack Query, and CSS
- Express 5 API server
- PostgreSQL with Drizzle ORM
- OpenAPI contract with generated Zod schemas and React Query hooks
- pnpm workspace

## Setup

The app expects PostgreSQL through `DATABASE_URL`. In Replit, use the project's managed database. For local development, provide a PostgreSQL connection string using your environment's secret manager.

```sh
pnpm install
pnpm --filter @workspace/db run push
```

Run the API and web app using the project's configured workflows. The API is served under `/api`; the web app is served at `/`.

## Validation

Run the package and workspace type checks:

```sh
pnpm run typecheck
pnpm --filter @workspace/testpilot-ai run typecheck
pnpm --filter @workspace/api-server run typecheck
```

Build the API:

```sh
pnpm --filter @workspace/api-server run build
```

### Manual workflow checklist

1. Open the dashboard and confirm counts and severity/status charts match the demo records.
2. Create a test case, view it, edit its status, search/filter it, export the list, and delete it.
3. Create a bug report, open its detail page, change its status, filter by severity/priority/module, export it, and delete it.
4. Enter a feature and requirement in the generator. Edit a suggestion and save it; confirm it appears in the case library.
5. Run a module with Pass, Fail, Blocked, and Not Run outcomes. Link a failed case to a bug, then confirm run history, case status, dashboard metrics, and reports update.
6. Export execution results, use the print-report action, then reset the demo records.
7. Check the app at desktop and mobile widths.

## Deployment

On Replit, use **Publish** to publish the web app and API together. Keep the database configured for the published environment. Replit provides the live URL after publishing; no production URL is included here because the app has not yet been published.


import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import {
  Bug,
  BugInput,
  CreateBugBody,
  CreateBugResponse,
  CreateTestCaseBody,
  CreateTestCaseResponse,
  CreateTestRunBody,
  CreateTestRunResponse,
  DeleteBugParams,
  DeleteTestCaseParams,
  GetBugParams,
  GetBugResponse,
  GetTestCaseParams,
  GetTestCaseResponse,
  ListBugsResponse,
  ListTestCasesResponse,
  ListTestRunsResponse,
  ResetDemoDataResponse,
  TestCase,
  TestCaseInput,
  TestRun,
  TestRunInput,
  UpdateBugBody,
  UpdateBugParams,
  UpdateBugResponse,
  UpdateTestCaseBody,
  UpdateTestCaseParams,
  UpdateTestCaseResponse,
} from "@workspace/api-zod";
import {
  bugsTable,
  db,
  testCasesTable,
  testRunsTable,
} from "@workspace/db";

const router: IRouter = Router();

const demoCases: TestCase[] = [
  { id: "TC-0001", title: "Login succeeds with valid credentials", module: "Authentication", preconditions: "An active user account exists.", steps: "1. Open the login page.\n2. Enter valid credentials.\n3. Select Sign in.", testData: "qa.user@example.com / ValidPass!23", expectedResult: "The user is authenticated and redirected to the dashboard.", actualResult: "User redirected to dashboard.", priority: "Critical", status: "Pass", createdAt: "2026-10-08T09:10:00.000Z" },
  { id: "TC-0002", title: "Login rejects an incorrect password", module: "Authentication", preconditions: "An active user account exists.", steps: "1. Open login.\n2. Enter a valid email and incorrect password.\n3. Select Sign in.", testData: "qa.user@example.com / WrongPass1", expectedResult: "A safe validation message appears; the user remains signed out.", actualResult: "Inline error shown; no session created.", priority: "High", status: "Pass", createdAt: "2026-10-08T09:14:00.000Z" },
  { id: "TC-0003", title: "Signup validates required fields", module: "Registration", preconditions: "The signup page is available.", steps: "1. Open signup.\n2. Leave all required fields empty.\n3. Select Create account.", testData: "Name: empty; email: empty; password: empty", expectedResult: "Required field messages are shown and no account is created.", actualResult: "", priority: "High", status: "Not Run", createdAt: "2026-10-08T10:05:00.000Z" },
  { id: "TC-0004", title: "Password reset sends a recovery link", module: "Password Reset", preconditions: "An account exists for the submitted email.", steps: "1. Open Forgot password.\n2. Enter a registered email.\n3. Submit the request.", testData: "qa.user@example.com", expectedResult: "A confirmation is shown and a reset email is queued.", actualResult: "Confirmation shown.", priority: "Medium", status: "Pass", createdAt: "2026-10-08T10:21:00.000Z" },
  { id: "TC-0005", title: "Search returns matching records", module: "Search", preconditions: "Several records with different titles exist.", steps: "1. Open the records list.\n2. Search for \"invoice\".\n3. Review results.", testData: "Query: invoice", expectedResult: "Only records matching the query are displayed.", actualResult: "One matching record displayed.", priority: "Medium", status: "Pass", createdAt: "2026-10-08T11:40:00.000Z" },
  { id: "TC-0006", title: "Signup rejects an invalid email format", module: "Registration", preconditions: "The signup page is available.", steps: "1. Enter a name.\n2. Enter an invalid email.\n3. Enter a valid password and submit.", testData: "Email: rohan.example.com", expectedResult: "Email format validation is shown and signup is prevented.", actualResult: "Form submitted without email validation.", priority: "High", status: "Fail", createdAt: "2026-10-08T12:18:00.000Z" },
  { id: "TC-0007", title: "Signup prevents duplicate registration", module: "Registration", preconditions: "The email is already registered.", steps: "1. Open signup.\n2. Enter an existing email and valid remaining fields.\n3. Submit.", testData: "Email: existing.user@example.com", expectedResult: "A helpful duplicate-account message appears; a second account is not created.", actualResult: "", priority: "High", status: "Blocked", createdAt: "2026-10-08T13:03:00.000Z" },
  { id: "TC-0008", title: "Login handles empty required fields", module: "Authentication", preconditions: "The login page is available.", steps: "1. Leave email and password empty.\n2. Select Sign in.", testData: "Email: empty; password: empty", expectedResult: "Required field validation appears without a server error.", actualResult: "", priority: "Medium", status: "Not Run", createdAt: "2026-10-08T13:30:00.000Z" },
];

const demoBugs: Bug[] = [
  { id: "BUG-0001", title: "Valid users cannot log in after password update", description: "The authentication service rejects a valid credential after a password has been changed.", stepsToReproduce: "1. Change an account password.\n2. Sign out.\n3. Sign in using the new password.", expectedResult: "The user is signed in with the updated password.", actualResult: "Login returns a generic authentication failure.", environment: "Staging · Chrome 128 · macOS 15", module: "Authentication", severity: "Critical", priority: "High", status: "Reopened", assignee: "Maya Chen", createdAt: "2026-10-09T08:25:00.000Z", updatedAt: "2026-10-10T07:50:00.000Z" },
  { id: "BUG-0002", title: "Signup email field helper text is misaligned", description: "The helper text sits several pixels below the email input on narrow viewports.", stepsToReproduce: "1. Open signup at a 390px viewport.\n2. Focus the email field.", expectedResult: "Helper text aligns consistently beneath the input.", actualResult: "Helper text is vertically offset.", environment: "Chrome 128 · iPhone 14 viewport", module: "Registration", severity: "Minor", priority: "Low", status: "Open", assignee: "Unassigned", createdAt: "2026-10-09T10:12:00.000Z", updatedAt: "2026-10-09T10:12:00.000Z" },
  { id: "BUG-0003", title: "Invalid email is accepted during registration", description: "The client-side email validator accepts addresses without an at-sign.", stepsToReproduce: "1. Open signup.\n2. Enter rohan.example.com as the email.\n3. Submit the form.", expectedResult: "Submission is blocked with an email format error.", actualResult: "The request is accepted and reaches the confirmation step.", environment: "Staging · Firefox 130 · Windows 11", module: "Registration", severity: "Major", priority: "High", status: "In Progress", assignee: "Dev Patel", createdAt: "2026-10-09T11:02:00.000Z", updatedAt: "2026-10-10T08:05:00.000Z" },
];

const demoRuns: TestRun[] = [
  { id: "RUN-0002", module: "Registration", name: "Registration smoke · 09 Oct", executedAt: "2026-10-09T15:20:00.000Z", outcomes: [
    { testCaseId: "TC-0003", status: "Not Run", actualResult: "", notes: "Awaiting test environment refresh.", bugId: null },
    { testCaseId: "TC-0006", status: "Fail", actualResult: "Invalid address was accepted.", notes: "Linked to BUG-0003.", bugId: "BUG-0003" },
    { testCaseId: "TC-0007", status: "Blocked", actualResult: "", notes: "Email service unavailable in staging.", bugId: null },
  ] },
  { id: "RUN-0001", module: "Authentication", name: "Authentication smoke · 08 Oct", executedAt: "2026-10-08T14:30:00.000Z", outcomes: [
    { testCaseId: "TC-0001", status: "Pass", actualResult: "Dashboard loaded.", notes: "Verified standard account.", bugId: null },
    { testCaseId: "TC-0002", status: "Pass", actualResult: "Inline validation displayed.", notes: "", bugId: null },
  ] },
];

const idFor = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;

async function ensureDemoData(): Promise<void> {
  const [existing] = await db.select({ id: testCasesTable.id }).from(testCasesTable).limit(1);
  if (existing) return;
  await db.insert(testCasesTable).values(demoCases.map((item) => ({ id: item.id, data: item }))).onConflictDoNothing();
  await db.insert(bugsTable).values(demoBugs.map((item) => ({ id: item.id, data: item }))).onConflictDoNothing();
  await db.insert(testRunsTable).values(demoRuns.map((item) => ({ id: item.id, data: item }))).onConflictDoNothing();
}

router.get("/test-cases", async (_req, res): Promise<void> => {
  await ensureDemoData();
  const rows = await db.select().from(testCasesTable).orderBy(asc(testCasesTable.createdAt));
  res.json(ListTestCasesResponse.parse(rows.map((row) => row.data)));
});

router.post("/test-cases", async (req, res): Promise<void> => {
  const parsed = CreateTestCaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await ensureDemoData();
  const input = parsed.data as TestCaseInput;
  const item: TestCase = { ...input, id: idFor("TC"), actualResult: input.actualResult ?? "", status: input.status ?? "Not Run", createdAt: new Date().toISOString() };
  await db.insert(testCasesTable).values({ id: item.id, data: item });
  res.status(201).json(CreateTestCaseResponse.parse(item));
});

router.get("/test-cases/:id", async (req, res): Promise<void> => {
  const params = GetTestCaseParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await ensureDemoData();
  const [row] = await db.select().from(testCasesTable).where(eq(testCasesTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Test case not found" }); return; }
  res.json(GetTestCaseResponse.parse(row.data));
});

router.patch("/test-cases/:id", async (req, res): Promise<void> => {
  const params = UpdateTestCaseParams.safeParse(req.params);
  const parsed = UpdateTestCaseBody.safeParse(req.body);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.select().from(testCasesTable).where(eq(testCasesTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Test case not found" }); return; }
  const updated = { ...(row.data as TestCase), ...parsed.data };
  await db.update(testCasesTable).set({ data: updated, updatedAt: new Date() }).where(eq(testCasesTable.id, params.data.id));
  res.json(UpdateTestCaseResponse.parse(updated));
});

router.delete("/test-cases/:id", async (req, res): Promise<void> => {
  const params = DeleteTestCaseParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [row] = await db.delete(testCasesTable).where(eq(testCasesTable.id, params.data.id)).returning({ id: testCasesTable.id });
  if (!row) { res.status(404).json({ error: "Test case not found" }); return; }
  res.sendStatus(204);
});

router.get("/bugs", async (_req, res): Promise<void> => {
  await ensureDemoData();
  const rows = await db.select().from(bugsTable).orderBy(asc(bugsTable.createdAt));
  res.json(ListBugsResponse.parse(rows.map((row) => row.data)));
});

router.post("/bugs", async (req, res): Promise<void> => {
  const parsed = CreateBugBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await ensureDemoData();
  const input = parsed.data as BugInput;
  const now = new Date().toISOString();
  const item: Bug = { ...input, id: idFor("BUG"), status: input.status ?? "Open", assignee: input.assignee ?? "Unassigned", createdAt: now, updatedAt: now };
  await db.insert(bugsTable).values({ id: item.id, data: item });
  res.status(201).json(CreateBugResponse.parse(item));
});

router.get("/bugs/:id", async (req, res): Promise<void> => {
  const params = GetBugParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await ensureDemoData();
  const [row] = await db.select().from(bugsTable).where(eq(bugsTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Bug not found" }); return; }
  res.json(GetBugResponse.parse(row.data));
});

router.patch("/bugs/:id", async (req, res): Promise<void> => {
  const params = UpdateBugParams.safeParse(req.params);
  const parsed = UpdateBugBody.safeParse(req.body);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.select().from(bugsTable).where(eq(bugsTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Bug not found" }); return; }
  const updated: Bug = { ...(row.data as Bug), ...parsed.data, updatedAt: new Date().toISOString() };
  await db.update(bugsTable).set({ data: updated, updatedAt: new Date() }).where(eq(bugsTable.id, params.data.id));
  res.json(UpdateBugResponse.parse(updated));
});

router.delete("/bugs/:id", async (req, res): Promise<void> => {
  const params = DeleteBugParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [row] = await db.delete(bugsTable).where(eq(bugsTable.id, params.data.id)).returning({ id: bugsTable.id });
  if (!row) { res.status(404).json({ error: "Bug not found" }); return; }
  res.sendStatus(204);
});

router.get("/test-runs", async (_req, res): Promise<void> => {
  await ensureDemoData();
  const rows = await db.select().from(testRunsTable).orderBy(asc(testRunsTable.createdAt));
  res.json(ListTestRunsResponse.parse(rows.map((row) => row.data).reverse()));
});

router.post("/test-runs", async (req, res): Promise<void> => {
  const parsed = CreateTestRunBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await ensureDemoData();
  const input = parsed.data as TestRunInput;
  const caseIds = [...new Set(input.outcomes.map((outcome) => outcome.testCaseId))];
  const existingCases = caseIds.length ? await db.select().from(testCasesTable).where(and(...caseIds.map((id) => eq(testCasesTable.id, id)))) : [];
  if (existingCases.length !== caseIds.length) { res.status(400).json({ error: "A selected test case no longer exists." }); return; }
  const bugIds = [...new Set(input.outcomes.flatMap((outcome) => outcome.bugId ? [outcome.bugId] : []))];
  for (const bugId of bugIds) {
    const [bug] = await db.select({ id: bugsTable.id }).from(bugsTable).where(eq(bugsTable.id, bugId));
    if (!bug) { res.status(400).json({ error: `Linked bug ${bugId} does not exist.` }); return; }
  }
  const item: TestRun = { ...input, id: idFor("RUN"), executedAt: new Date().toISOString() };
  await db.transaction(async (tx) => {
    await tx.insert(testRunsTable).values({ id: item.id, data: item });
    for (const outcome of input.outcomes) {
      const [caseRow] = await tx.select().from(testCasesTable).where(eq(testCasesTable.id, outcome.testCaseId));
      if (!caseRow) continue;
      const oldCase = caseRow.data as TestCase;
      const updated: TestCase = { ...oldCase, status: outcome.status, actualResult: outcome.actualResult };
      await tx.update(testCasesTable).set({ data: updated, updatedAt: new Date() }).where(eq(testCasesTable.id, outcome.testCaseId));
    }
  });
  res.status(201).json(CreateTestRunResponse.parse(item));
});

router.post("/demo/reset", async (_req, res): Promise<void> => {
  await db.transaction(async (tx) => {
    await tx.delete(testRunsTable);
    await tx.delete(bugsTable);
    await tx.delete(testCasesTable);
    await tx.insert(testCasesTable).values(demoCases.map((item) => ({ id: item.id, data: item })));
    await tx.insert(bugsTable).values(demoBugs.map((item) => ({ id: item.id, data: item })));
    await tx.insert(testRunsTable).values(demoRuns.map((item) => ({ id: item.id, data: item })));
  });
  res.json(ResetDemoDataResponse.parse({ success: true }));
});

export default router;

import { type FormEvent, type ReactNode, createContext, useContext, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  Activity, AlertCircle, AlertTriangle, ArrowDownToLine, ArrowLeft, BarChart3, BookOpen,
  Bug as BugIcon, Check, CheckCircle2, ChevronRight, CircleHelp, ClipboardCheck, Clock3,
  FilePlus2, FileText, FlaskConical, LayoutDashboard, Pencil,
  Plus, Printer, RefreshCw, RotateCcw, Search, ShieldCheck, Sparkles, Trash2, X,
} from 'lucide-react';
import {
  Bug, BugInput, BugPriority, BugSeverity, BugStatus, RunOutcome, RunOutcomeStatus,
  TestCase, TestCaseInput, TestCasePriority, TestCaseStatus, TestRun, TestRunInput,
  getHealthCheckQueryKey, getListBugsQueryKey, getListTestCasesQueryKey, getListTestRunsQueryKey,
  getGetBugQueryKey, getGetTestCaseQueryKey, useCreateBug, useCreateTestCase, useCreateTestRun,
  useDeleteBug, useDeleteTestCase, useGetBug, useGetTestCase, useHealthCheck,
  useListBugs, useListTestCases, useListTestRuns, useResetDemoData, useUpdateBug, useUpdateTestCase,
} from '@workspace/api-client-react';
import { Link, Route, Switch, useLocation, useParams } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
type ToastMessage = { text: string; kind?: 'error' } | null;
const ToastContext = createContext<(message: ToastMessage) => void>(() => {});
const useNotify = () => useContext(ToastContext);
const nav = [
  { href: '/', label: 'Overview', Icon: LayoutDashboard },
  { href: '/test-cases', label: 'Test cases', Icon: BookOpen },
  { href: '/bugs', label: 'Bug reports', Icon: BugIcon },
  { href: '/runs', label: 'Test runs', Icon: ClipboardCheck },
  { href: '/generator', label: 'Rule generator', Icon: Sparkles },
  { href: '/reports', label: 'Reports', Icon: BarChart3 },
];

function cx(...parts: Array<string | false | undefined>) { return parts.filter(Boolean).join(' '); }
function prettyDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}
function badgeClass(value: string) {
  return value.toLowerCase().replace(/\s+/g, '-');
}
function Badge({ children }: { children: string }) {
  return <span className={`badge ${badgeClass(children)}`} data-testid={`status-${badgeClass(children)}`}>{children}</span>;
}
function csvCell(value: unknown) {
  const raw = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  const text = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${text.replaceAll('"', '""')}"`;
}
function downloadCsv(filename: string, rows: object[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.map(csvCell).join(','), ...rows.map(row => headers.map(key => csvCell((row as Record<string, unknown>)[key])).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function LoadingPanel({ rows = 4 }: { rows?: number }) {
  return <div className="panel loading-state" aria-label="Loading data" data-testid="state-loading">
    <div style={{ maxWidth: 520, margin: 'auto', display: 'grid', gap: 13 }}>{Array.from({ length: rows }, (_, i) => <div className="skeleton" key={i} style={{ width: `${86 - i * 8}%`, height: i === 0 ? 19 : 13, margin: 'auto' }} />)}</div>
  </div>;
}
function ErrorState({ message = 'We could not load this data.', retry }: { message?: string; retry: () => void }) {
  return <div className="panel error-state" data-testid="state-error"><div className="empty-mark"><AlertCircle /></div><h3>Something interrupted the signal</h3><p>{message} Check the connection, then try again.</p><button className="btn btn-secondary" onClick={retry} data-testid="button-retry"><RefreshCw /> Try again</button></div>;
}
function EmptyState({ title, description, action, icon: Icon = FileText }: { title: string; description: string; action?: ReactNode; icon?: typeof FileText }) {
  return <div className="empty-state" data-testid="state-empty"><div className="empty-mark"><Icon /></div><h3>{title}</h3><p>{description}</p>{action}</div>;
}
function Field({ label, children, full = false, hint }: { label: string; children: ReactNode; full?: boolean; hint?: string }) {
  return <div className={cx('field', full && 'full')}><label>{label}</label>{children}{hint && <span className="field-hint">{hint}</span>}</div>;
}
function Modal({ title, subtitle, close, children, footer }: { title: string; subtitle?: string; close: () => void; children: ReactNode; footer?: ReactNode }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
    <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
      <header className="modal-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-btn" onClick={close} aria-label="Close" data-testid="button-close-dialog"><X /></button></header>
      <div className="modal-body">{children}</div>{footer && <footer className="modal-foot">{footer}</footer>}
    </section>
  </div>;
}
function PageHead({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle: string; children?: ReactNode }) {
  return <div className="page-head"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p className="page-subtitle">{subtitle}</p></div>{children}</div>;
}
function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 60000 } });
  const routeName = nav.find(item => item.href === location)?.label ?? (location.startsWith('/bugs/') ? 'Bug detail' : location.startsWith('/test-cases/') ? 'Test case detail' : 'Workspace');
  const Links = ({ compact = false }: { compact?: boolean }) => <>{nav.map(({ href, label, Icon }) => <Link href={href} key={href} className={cx('nav-link', location === href && 'active')} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}><Icon /><span>{label}</span></Link>)}</>;
  return <div className="app-shell">
    <aside className="sidebar"><Link href="/" className="brand" data-testid="link-brand"><span className="brand-mark"><ShieldCheck size={18} /></span><span>TestPilot AI<small>QUALITY WORKSPACE</small></span></Link>
      <div className="nav-label">Workspace</div><Links />
      <div className="sidebar-foot"><div className="system-note"><span className="health-dot" style={{ background: health.isError ? '#dc8d71' : undefined }} /><span>{health.isLoading ? 'Checking API' : health.isError ? 'API unavailable' : 'API connected'}</span></div><div className="system-note"><span style={{ fontFamily: 'var(--app-font-mono)', fontSize: 10 }}>QA / FIELD NOTES</span></div></div>
    </aside>
    <div className="workspace">
      <div className="mobile-top"><Link href="/" className="brand"><span className="brand-mark"><ShieldCheck size={17} /></span><span>TestPilot AI</span></Link><div className="avatar">QA</div></div>
      <nav className="mobile-nav"><Links compact /></nav>
      <header className="topbar"><div className="crumb">Workspace <ChevronRight size={13} /> <strong>{routeName}</strong></div><div className="top-right"><span className="top-user">Quality desk</span><div className="avatar">QD</div></div></header>
      <main className="main">{children}</main>
    </div>
  </div>;
}

function Dashboard() {
  const cases = useListTestCases({ query: { queryKey: getListTestCasesQueryKey() } });
  const bugs = useListBugs({ query: { queryKey: getListBugsQueryKey() } });
  const runs = useListTestRuns({ query: { queryKey: getListTestRunsQueryKey() } });
  const retry = () => { void cases.refetch(); void bugs.refetch(); void runs.refetch(); };
  if (cases.isLoading || bugs.isLoading || runs.isLoading) return <><PageHead eyebrow="Quality workspace" title="Good testing starts with a clear picture." subtitle="A live view of your test inventory, open findings, and recent execution." /><LoadingPanel rows={5} /></>;
  if (cases.isError || bugs.isError || runs.isError) return <><PageHead eyebrow="Quality workspace" title="Your overview" subtitle="A live view of your workspace." /><ErrorState retry={retry} /></>;
  const caseData = cases.data ?? [], bugData = bugs.data ?? [], runData = runs.data ?? [];
  const caseStatusCounts = Object.fromEntries(['Pass', 'Fail', 'Blocked', 'Not Run'].map(status => [status, caseData.filter(test => test.status === status).length]));
  const openBugs = bugData.filter(bug => bug.status !== 'Closed' && bug.status !== 'Fixed').length;
  const criticalBugs = bugData.filter(bug => bug.severity === 'Critical' && bug.status !== 'Closed' && bug.status !== 'Fixed').length;
  const recentRuns = [...runData].sort((a, b) => Date.parse(b.executedAt) - Date.parse(a.executedAt)).slice(0, 4);
  const recentBugs = [...bugData].filter(bug => bug.status !== 'Closed' && bug.status !== 'Fixed').sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 3);
  const executedOutcomes = runData.flatMap(run => run.outcomes).filter(outcome => outcome.status === 'Pass' || outcome.status === 'Fail');
  const runPassRate = executedOutcomes.length ? Math.round(executedOutcomes.filter(outcome => outcome.status === 'Pass').length / executedOutcomes.length * 100) : 0;
  const severityCounts = Object.fromEntries(['Critical', 'Major', 'Minor', 'Trivial'].map(severity => [severity, bugData.filter(bug => bug.severity === severity).length]));
  return <>
    <PageHead eyebrow="Quality workspace / Today" title="Good testing starts with a clear picture." subtitle="Your test inventory, open findings, and latest execution activity." />
    <section className="stat-grid">
      <Stat label="Total test cases" value={caseData.length} meta="Across the test library" icon={<BookOpen />} />
      <Stat label="Passed" value={caseStatusCounts.Pass} meta="Current case status" icon={<CheckCircle2 />} />
      <Stat label="Failed" value={caseStatusCounts.Fail} meta="Current case status" icon={<AlertTriangle />} />
      <Stat label="Blocked" value={caseStatusCounts.Blocked} meta="Current case status" icon={<CircleHelp />} />
      <Stat label="Not run" value={caseStatusCounts['Not Run']} meta="Current case status" icon={<Clock3 />} />
      <Stat label="Total bugs" value={bugData.length} meta="All recorded reports" icon={<BugIcon />} />
      <Stat label="Open bugs" value={openBugs} meta="Excludes fixed and closed" icon={<AlertCircle />} />
      <Stat label="Critical bugs" value={criticalBugs} meta="Active critical findings" icon={<AlertTriangle />} />
      <Stat label="Execution pass rate" value={executedOutcomes.length ? `${runPassRate}%` : '—'} meta="Pass ÷ pass and fail outcomes" icon={<Activity />} />
    </section>
    <div className="dash-grid">
      <section className="panel panel-pad"><div className="section-title"><div><h2>Test status distribution</h2><p>Current outcomes across the test library.</p></div><Link className="btn btn-quiet btn-small" href="/test-cases" data-testid="link-all-test-cases">View cases <ChevronRight /></Link></div>
        {caseData.length ? <div className="bar-list">{[['Pass', caseStatusCounts.Pass], ['Fail', caseStatusCounts.Fail], ['Blocked', caseStatusCounts.Blocked], ['Not Run', caseStatusCounts['Not Run']]].map(([status, count]) => <div className="bar-row" key={String(status)} data-testid={`dashboard-status-${String(status).toLowerCase().replaceAll(' ', '-')}`}><span><Badge>{String(status)}</Badge></span><div className="bar-track"><div className="bar-fill" style={{ width: `${Number(count) / caseData.length * 100}%` }} /></div><span className="mono">{count}</span></div>)}</div> : <EmptyState title="No test inventory yet" description="Add a test case and its current status will appear here." icon={BookOpen} action={<Link className="btn btn-primary" href="/test-cases">Add a test case</Link>} />}
      </section>
      <section className="panel panel-pad"><div className="section-title"><div><h2>Bug severity</h2><p>Recorded reports by severity.</p></div><Link className="btn btn-quiet btn-small" href="/bugs">Bug register <ChevronRight /></Link></div>
        {bugData.length ? <div className="bar-list">{[['Critical', severityCounts.Critical], ['Major', severityCounts.Major], ['Minor', severityCounts.Minor], ['Trivial', severityCounts.Trivial]].map(([severity, count]) => <div className="bar-row" key={String(severity)} data-testid={`dashboard-severity-${String(severity).toLowerCase()}`}><span><Badge>{String(severity)}</Badge></span><div className="bar-track"><div className="bar-fill" style={{ width: `${Number(count) / bugData.length * 100}%` }} /></div><span className="mono">{count}</span></div>)}</div> : <EmptyState title="No bug reports yet" description="Severity distribution appears as the team records findings." icon={BugIcon} action={<Link className="btn btn-secondary" href="/bugs">Open bug reports</Link>} />}
      </section>
      <section className="panel panel-pad"><div className="section-title"><div><h2>Recent test runs</h2><p>Most recent execution records.</p></div><Link className="btn btn-quiet btn-small" href="/runs" data-testid="link-all-runs">All runs <ChevronRight /></Link></div>
        {recentRuns.length ? <div className="recent-list">{recentRuns.map(run => <div className="recent-row" key={run.id} data-testid={`recent-run-${run.id}`}><div><div className="recent-name">{run.name}</div><div className="recent-meta">{run.module} · {prettyDate(run.executedAt)}</div></div><Badge>{run.outcomes.some(o => o.status === 'Fail') ? 'Fail' : run.outcomes.some(o => o.status === 'Blocked') ? 'Blocked' : run.outcomes.some(o => o.status === 'Not Run') ? 'Not Run' : 'Pass'}</Badge></div>)}</div> : <EmptyState title="Execution history is empty" description="Run a module's test cases to create a reviewable execution record." icon={ClipboardCheck} action={<Link className="btn btn-secondary" href="/runs">Go to test runs</Link>} />}
      </section>
      <section className="panel panel-pad"><div className="section-title"><div><h2>Signal check</h2><p>Current case outcomes and bug queue.</p></div><Link className="btn btn-quiet btn-small" href="/reports">Open reports <ChevronRight /></Link></div>
        <div className="recent-list">{[{label:'Passing',count:caseStatusCounts.Pass,Icon:Check},{label:'Failing',count:caseStatusCounts.Fail,Icon:AlertTriangle},{label:'Open bugs',count:openBugs,Icon:BugIcon}].map(({label,count,Icon}) => <div className="recent-row" key={label}><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="stat-icon"><Icon /></span><span className="recent-name" style={{ margin: 0 }}>{label}</span></div><strong data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}>{count}</strong></div>)}</div>
      </section>
      <section className="panel panel-pad"><div className="section-title"><div><h2>Open bug reports</h2><p>Recent issues that may need attention.</p></div><Link className="btn btn-quiet btn-small" href="/bugs">Bug register <ChevronRight /></Link></div>
        {recentBugs.length ? <div className="recent-list">{recentBugs.map(bug => <Link href={`/bugs/${bug.id}`} className="recent-row" key={bug.id} data-testid={`dashboard-bug-${bug.id}`}><div><div className="recent-name">{bug.title}</div><div className="recent-meta">{bug.module} · {bug.severity}</div></div><Badge>{bug.status}</Badge></Link>)}</div> : <EmptyState title="No active bug reports" description="New findings will show up here for quick triage." icon={BugIcon} />}
      </section>
    </div>
  </>;
}
function Stat({ label, value, meta, icon }: { label: string; value: string | number; meta: string; icon: ReactNode }) {
  return <div className="panel stat-card" data-testid={`metric-card-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="stat-label"><span className="stat-icon">{icon}</span>{label}</div><div className="stat-value">{value}</div><div className="stat-meta">{meta}</div></div>;
}

function CaseForm({ initial, modules, onSave, onClose, busy }: { initial?: TestCase; modules: string[]; onSave: (data: TestCaseInput) => void; onClose: () => void; busy: boolean }) {
  const [module, setModule] = useState(initial?.module ?? '');
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    onSave({ title: String(f.get('title') ?? '').trim(), module, preconditions: String(f.get('preconditions') ?? ''), steps: String(f.get('steps') ?? ''), testData: String(f.get('testData') ?? ''), expectedResult: String(f.get('expectedResult') ?? ''), actualResult: String(f.get('actualResult') ?? ''), priority: String(f.get('priority') ?? 'Medium') as TestCasePriority, status: String(f.get('status') ?? 'Not Run') as TestCaseStatus });
  }
  const field = (label: string, name: string, value?: string, full = false, required = false) => <Field label={label} full={full}><textarea className="textarea" name={name} defaultValue={value ?? ''} required={required} data-testid={`input-case-${name}`} /></Field>;
  return <Modal title={initial ? 'Edit test case' : 'New test case'} subtitle="Write the steps so another tester can reproduce the check." close={onClose}
    footer={<><button className="btn btn-secondary" onClick={onClose} type="button">Cancel</button><button className="btn btn-primary" form="case-form" disabled={busy} data-testid="button-save-test-case">{busy ? 'Saving…' : initial ? 'Save changes' : 'Create test case'}</button></>}>
    <form id="case-form" onSubmit={submit} className="form-grid">
      <Field label="Title" full><input className="input" name="title" defaultValue={initial?.title} required maxLength={180} data-testid="input-case-title" /></Field>
      <Field label="Module"><input className="input" value={module} placeholder="e.g. Authentication" onChange={e => setModule(e.target.value)} required maxLength={80} data-testid="input-case-module" /></Field>
      <Field label="Priority"><select className="select" style={{ width: '100%' }} name="priority" defaultValue={initial?.priority ?? 'Medium'} data-testid="input-case-priority">{['Low','Medium','High','Critical'].map(x => <option key={x}>{x}</option>)}</select></Field>
      <Field label="Status"><select className="select" style={{ width: '100%' }} name="status" defaultValue={initial?.status ?? 'Not Run'} data-testid="input-case-status">{['Not Run','Pass','Fail','Blocked'].map(x => <option key={x}>{x}</option>)}</select></Field>
      {field('Preconditions', 'preconditions', initial?.preconditions, true)}
      {field('Steps', 'steps', initial?.steps, true, true)}
      {field('Test data', 'testData', initial?.testData, true)}
      {field('Expected result', 'expectedResult', initial?.expectedResult, true, true)}
      {field('Actual result', 'actualResult', initial?.actualResult, true)}
    </form>
  </Modal>;
}
function TestCasesPage() {
  const query = useListTestCases({ query: { queryKey: getListTestCasesQueryKey() } });
  const create = useCreateTestCase(), update = useUpdateTestCase(), remove = useDeleteTestCase();
  const client = useQueryClient(), notify = useNotify();
  const [search, setSearch] = useState(''), [moduleFilter, setModuleFilter] = useState('All modules'), [statusFilter, setStatusFilter] = useState('All statuses'), [priorityFilter, setPriorityFilter] = useState('All priorities');
  const [editing, setEditing] = useState<TestCase | null | false>(false);
  const rows = query.data ?? [];
  const modules = useMemo(() => [...new Set(rows.map(row => row.module))].sort(), [rows]);
  const filtered = rows.filter(row => `${row.title} ${row.module} ${row.id}`.toLowerCase().includes(search.toLowerCase()) && (moduleFilter === 'All modules' || row.module === moduleFilter) && (statusFilter === 'All statuses' || row.status === statusFilter) && (priorityFilter === 'All priorities' || row.priority === priorityFilter));
  const invalidate = () => client.invalidateQueries({ queryKey: getListTestCasesQueryKey() });
  function save(data: TestCaseInput) {
    if (editing) update.mutate({ id: editing.id, data }, { onSuccess: () => { void invalidate(); setEditing(false); notify({ text: 'Test case updated.' }); }, onError: () => notify({ text: 'Could not update the test case.', kind: 'error' }) });
    else create.mutate({ data }, { onSuccess: () => { void invalidate(); setEditing(false); notify({ text: 'Test case added.' }); }, onError: () => notify({ text: 'Could not create the test case.', kind: 'error' }) });
  }
  function setStatus(row: TestCase, status: string) {
    update.mutate({ id: row.id, data: { status: status as TestCaseStatus } }, { onSuccess: () => { void invalidate(); notify({ text: `Status set to ${status}.` }); }, onError: () => notify({ text: 'Could not update the status.', kind: 'error' }) });
  }
  function deleteRow(row: TestCase) {
    if (window.confirm(`Delete “${row.title}”? This cannot be undone.`)) remove.mutate({ id: row.id }, { onSuccess: () => { void invalidate(); notify({ text: 'Test case deleted.' }); }, onError: () => notify({ text: 'Could not delete the test case.', kind: 'error' }) });
  }
  if (query.isLoading) return <><PageHead eyebrow="Quality library" title="Test cases" subtitle="Structured checks, ready to execute and review." /><LoadingPanel /></>;
  if (query.isError) return <><PageHead eyebrow="Quality library" title="Test cases" subtitle="Structured checks, ready to execute and review." /><ErrorState retry={() => void query.refetch()} /></>;
  return <>
    <PageHead eyebrow="Quality library / Test inventory" title="Test cases" subtitle="Keep repeatable checks precise, current, and ready to run."><button className="btn btn-primary" onClick={() => setEditing(null)} data-testid="button-new-test-case"><Plus /> New test case</button></PageHead>
    <div className="toolbar"><div className="search-wrap"><Search /><input className="input" placeholder="Search title, module, or ID" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search test cases" data-testid="input-search-test-cases" /></div><select className="select" value={moduleFilter} onChange={e => setModuleFilter(e.target.value)} aria-label="Filter by module" data-testid="filter-test-case-module"><option>All modules</option>{modules.map(m => <option key={m}>{m}</option>)}</select><select className="select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Filter by status" data-testid="filter-test-case-status"><option>All statuses</option>{['Not Run','Pass','Fail','Blocked'].map(s => <option key={s}>{s}</option>)}</select><select className="select" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} aria-label="Filter by priority" data-testid="filter-test-case-priority"><option>All priorities</option>{['Low','Medium','High','Critical'].map(s => <option key={s}>{s}</option>)}</select><button className="btn btn-secondary" onClick={() => downloadCsv('test-cases.csv', filtered.map(({ id,title,module,priority,status,createdAt,preconditions,steps,testData,expectedResult,actualResult }) => ({ id,title,module,priority,status,createdAt,preconditions,steps,testData,expectedResult,actualResult })))} disabled={!filtered.length} data-testid="button-export-test-cases"><ArrowDownToLine /> Export CSV</button></div>
    <section className="panel table-wrap">{filtered.length ? <table><thead><tr><th>Test case</th><th>Module</th><th>Priority</th><th>Status</th><th>Created</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filtered.map(row => <tr key={row.id} data-testid={`row-test-case-${row.id}`}><td><div className="cell-title">{row.title}</div><div className="cell-sub mono">{row.id}</div></td><td>{row.module}</td><td><Badge>{row.priority}</Badge></td><td><select className="inline-select" value={row.status} onChange={e => setStatus(row,e.target.value)} aria-label={`Update ${row.title} status`} data-testid={`select-case-status-${row.id}`}>{['Not Run','Pass','Fail','Blocked'].map(s => <option key={s}>{s}</option>)}</select></td><td className="mono">{prettyDate(row.createdAt)}</td><td><div className="row-actions"><Link href={`/test-cases/${row.id}`} className="icon-btn" aria-label={`View ${row.title}`} data-testid={`link-view-case-${row.id}`}><ChevronRight /></Link><button className="icon-btn" onClick={() => setEditing(row)} aria-label={`Edit ${row.title}`} data-testid={`button-edit-case-${row.id}`}><Pencil /></button><button className="icon-btn" onClick={() => deleteRow(row)} aria-label={`Delete ${row.title}`} data-testid={`button-delete-case-${row.id}`}><Trash2 /></button></div></td></tr>)}</tbody></table> : <EmptyState title={search || moduleFilter !== 'All modules' || statusFilter !== 'All statuses' || priorityFilter !== 'All priorities' ? 'No matching test cases' : 'Your test library is ready'} description={search || moduleFilter !== 'All modules' || statusFilter !== 'All statuses' || priorityFilter !== 'All priorities' ? 'Try a different search or clear the filters.' : 'Create the first case from a real workflow you need to verify.'} icon={BookOpen} action={!rows.length && <button className="btn btn-primary" onClick={() => setEditing(null)}>Create test case</button>} />}</section>
    {editing !== false && <CaseForm initial={editing || undefined} modules={modules} onSave={save} onClose={() => setEditing(false)} busy={create.isPending || update.isPending} />}
  </>;
}

function CaseDetail() {
  const params = useParams<{ id: string }>(); const id = params.id ?? '';
  const query = useGetTestCase(id, { query: { queryKey: getGetTestCaseQueryKey(id), enabled: !!id } });
  const [location, setLocation] = useLocation();
  if (query.isLoading) return <LoadingPanel />;
  if (query.isError || !query.data) return <><button className="btn btn-secondary" onClick={() => setLocation('/test-cases')}><ArrowLeft /> Test cases</button><ErrorState retry={() => void query.refetch()} /></>;
  const item = query.data;
  return <><button className="btn btn-secondary" onClick={() => setLocation('/test-cases')} style={{ marginBottom: 22 }} data-testid="button-back-cases"><ArrowLeft /> Test cases</button><PageHead eyebrow={`Test case / ${item.module}`} title={item.title} subtitle={`Created ${prettyDate(item.createdAt)} · ${item.id}`} /><div className="detail-layout"><section className="panel detail-content">{[['Preconditions',item.preconditions],['Steps',item.steps],['Test data',item.testData],['Expected result',item.expectedResult],['Actual result',item.actualResult]].map(([title,value]) => <div className="detail-block" key={title as string}><h3>{title as string}</h3><p data-testid={`case-detail-${String(title).toLowerCase().replaceAll(' ','-')}`}>{value as string || 'Not recorded.'}</p></div>)}</section><aside className="panel detail-aside"><div className="section-title"><h2>Case properties</h2></div><div className="meta-line"><span>Module</span><strong>{item.module}</strong></div><div className="meta-line"><span>Priority</span><Badge>{item.priority}</Badge></div><div className="meta-line"><span>Status</span><Badge>{item.status}</Badge></div><div className="meta-line"><span>Created</span><strong>{prettyDate(item.createdAt)}</strong></div></aside></div></>;
}

function BugForm({ initial, modules, onSave, onClose, busy }: { initial?: Bug; modules: string[]; onSave: (data: BugInput) => void; onClose: () => void; busy: boolean }) {
  const [module, setModule] = useState(initial?.module ?? '');
  function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const f = new FormData(e.currentTarget); onSave({ title: String(f.get('title') ?? '').trim(), description: String(f.get('description') ?? ''), stepsToReproduce: String(f.get('stepsToReproduce') ?? ''), expectedResult: String(f.get('expectedResult') ?? ''), actualResult: String(f.get('actualResult') ?? ''), environment: String(f.get('environment') ?? ''), module, severity: String(f.get('severity') ?? 'Minor') as BugSeverity, priority: String(f.get('priority') ?? 'Medium') as BugPriority, status: String(f.get('status') ?? 'Open') as BugStatus, assignee: String(f.get('assignee') ?? '') }); }
  const area = (label: string, name: string, value?: string, full = true) => <Field label={label} full><textarea className="textarea" name={name} defaultValue={value ?? ''} required data-testid={`input-bug-${name}`} /></Field>;
  return <Modal title={initial ? 'Edit bug report' : 'New bug report'} subtitle="Capture the observed behavior and enough context to verify it." close={onClose} footer={<><button className="btn btn-secondary" onClick={onClose} type="button">Cancel</button><button className="btn btn-primary" form="bug-form" disabled={busy} data-testid="button-save-bug">{busy ? 'Saving…' : initial ? 'Save changes' : 'Create report'}</button></>}>
    <form id="bug-form" onSubmit={submit} className="form-grid">
      <Field label="Title" full><input className="input" name="title" defaultValue={initial?.title} required maxLength={180} data-testid="input-bug-title" /></Field>
      <Field label="Module"><input className="input" value={module} placeholder="e.g. Authentication" onChange={e=>setModule(e.target.value)} required maxLength={80} data-testid="input-bug-module" /></Field>
      <Field label="Environment"><input className="input" name="environment" defaultValue={initial?.environment} placeholder="Observed environment" required data-testid="input-bug-environment" /></Field>
      <Field label="Severity"><select name="severity" className="select" style={{width:'100%'}} defaultValue={initial?.severity ?? 'Minor'} data-testid="input-bug-severity">{['Critical','Major','Minor','Trivial'].map(x=><option key={x}>{x}</option>)}</select></Field>
      <Field label="Priority"><select name="priority" className="select" style={{width:'100%'}} defaultValue={initial?.priority ?? 'Medium'} data-testid="input-bug-priority">{['High','Medium','Low'].map(x=><option key={x}>{x}</option>)}</select></Field>
      <Field label="Status"><select name="status" className="select" style={{width:'100%'}} defaultValue={initial?.status ?? 'Open'} data-testid="input-bug-status">{['Open','In Progress','Fixed','Retest','Closed','Reopened'].map(x=><option key={x}>{x}</option>)}</select></Field>
      <Field label="Assignee"><input name="assignee" className="input" defaultValue={initial?.assignee} data-testid="input-bug-assignee" /></Field>
      {area('Description','description',initial?.description)}
      {area('Steps to reproduce','stepsToReproduce',initial?.stepsToReproduce)}
      {area('Expected result','expectedResult',initial?.expectedResult)}
      {area('Actual result','actualResult',initial?.actualResult)}
    </form>
  </Modal>;
}
function BugsPage() {
  const query = useListBugs({ query: { queryKey: getListBugsQueryKey() } });
  const create = useCreateBug(), update = useUpdateBug(), remove = useDeleteBug();
  const client = useQueryClient(), notify = useNotify();
  const cases = useListTestCases({ query: { queryKey: getListTestCasesQueryKey() } });
  const [search,setSearch] = useState(''),[moduleFilter,setModuleFilter] = useState('All modules'),[statusFilter,setStatusFilter] = useState('All statuses'),[severityFilter,setSeverityFilter] = useState('All severities'),[priorityFilter,setPriorityFilter] = useState('All priorities');
  const [editing,setEditing] = useState<Bug|null|false>(false);
  const rows = query.data ?? [];
  const modules = useMemo(() => [...new Set([...(cases.data ?? []).map(x=>x.module),...rows.map(x=>x.module)])].sort(),[cases.data,rows]);
  const filtered = rows.filter(b=>`${b.title} ${b.module} ${b.id} ${b.description}`.toLowerCase().includes(search.toLowerCase()) && (moduleFilter==='All modules'||b.module===moduleFilter) && (statusFilter==='All statuses'||b.status===statusFilter) && (severityFilter==='All severities'||b.severity===severityFilter) && (priorityFilter==='All priorities'||b.priority===priorityFilter));
  const invalidate = () => client.invalidateQueries({queryKey:getListBugsQueryKey()});
  function save(data:BugInput) {
    if(editing) update.mutate({id:editing.id,data},{onSuccess:()=>{void invalidate();void client.invalidateQueries({queryKey:getGetBugQueryKey(editing.id)});setEditing(false);notify({text:'Bug report updated.'});},onError:()=>notify({text:'Could not update the report.',kind:'error'})});
    else create.mutate({data},{onSuccess:()=>{void invalidate();setEditing(false);notify({text:'Bug report added.'});},onError:()=>notify({text:'Could not create the report.',kind:'error'})});
  }
  function updateStatus(bug:Bug,status:string){update.mutate({id:bug.id,data:{status:status as BugStatus}},{onSuccess:()=>{void invalidate();void client.invalidateQueries({queryKey:getGetBugQueryKey(bug.id)});notify({text:`Status set to ${status}.`});},onError:()=>notify({text:'Could not update the status.',kind:'error'})});}
  function deleteRow(bug:Bug){if(window.confirm(`Delete “${bug.title}”? This cannot be undone.`))remove.mutate({id:bug.id},{onSuccess:()=>{void invalidate();notify({text:'Bug report deleted.'});},onError:()=>notify({text:'Could not delete the report.',kind:'error'})});}
  if(query.isLoading) return <><PageHead eyebrow="Quality library" title="Bug reports" subtitle="Triage observed behavior with evidence your team can reproduce."/><LoadingPanel/></>;
  if(query.isError)return <><PageHead eyebrow="Quality library" title="Bug reports" subtitle="Triage observed behavior with evidence your team can reproduce."/><ErrorState retry={()=>void query.refetch()}/></>;
  return <>
    <PageHead eyebrow="Quality library / Findings" title="Bug reports" subtitle="Triage observed behavior with evidence your team can reproduce."><button className="btn btn-primary" onClick={()=>setEditing(null)} data-testid="button-new-bug"><Plus/> New report</button></PageHead>
     <div className="toolbar"><div className="search-wrap"><Search/><input className="input" placeholder="Search reports, module, or ID" value={search} onChange={e=>setSearch(e.target.value)} data-testid="input-search-bugs"/></div><select className="select" value={moduleFilter} onChange={e=>setModuleFilter(e.target.value)} data-testid="filter-bug-module"><option>All modules</option>{modules.map(m=><option key={m}>{m}</option>)}</select><select className="select" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} data-testid="filter-bug-status"><option>All statuses</option>{['Open','In Progress','Fixed','Retest','Closed','Reopened'].map(x=><option key={x}>{x}</option>)}</select><select className="select" value={severityFilter} onChange={e=>setSeverityFilter(e.target.value)} data-testid="filter-bug-severity"><option>All severities</option>{['Critical','Major','Minor','Trivial'].map(x=><option key={x}>{x}</option>)}</select><select className="select" value={priorityFilter} onChange={e=>setPriorityFilter(e.target.value)} data-testid="filter-bug-priority"><option>All priorities</option>{['High','Medium','Low'].map(x=><option key={x}>{x}</option>)}</select><button className="btn btn-secondary" disabled={!filtered.length} onClick={()=>downloadCsv('bug-reports.csv',filtered)} data-testid="button-export-bugs"><ArrowDownToLine/> Export CSV</button></div>
    <section className="panel table-wrap">{filtered.length?<table><thead><tr><th>Report</th><th>Module</th><th>Severity</th><th>Status</th><th>Assignee</th><th>Updated</th><th></th></tr></thead><tbody>{filtered.map(b=><tr key={b.id} data-testid={`row-bug-${b.id}`}><td><Link href={`/bugs/${b.id}`} style={{textDecoration:'none'}} data-testid={`link-bug-${b.id}`}><div className="cell-title">{b.title}</div><div className="cell-sub mono">{b.id}</div></Link></td><td>{b.module}</td><td><Badge>{b.severity}</Badge></td><td><select className="inline-select" value={b.status} onChange={e=>updateStatus(b,e.target.value)} aria-label={`Update ${b.title} status`} data-testid={`select-bug-status-${b.id}`}>{['Open','In Progress','Fixed','Retest','Closed','Reopened'].map(x=><option key={x}>{x}</option>)}</select></td><td>{b.assignee||<span className="cell-sub">Unassigned</span>}</td><td className="mono">{prettyDate(b.updatedAt)}</td><td><div className="row-actions"><Link href={`/bugs/${b.id}`} className="icon-btn" aria-label={`View ${b.title}`}><ChevronRight/></Link><button className="icon-btn" onClick={()=>setEditing(b)} aria-label={`Edit ${b.title}`} data-testid={`button-edit-bug-${b.id}`}><Pencil/></button><button className="icon-btn" onClick={()=>deleteRow(b)} aria-label={`Delete ${b.title}`} data-testid={`button-delete-bug-${b.id}`}><Trash2/></button></div></td></tr>)}</tbody></table>:<EmptyState title={search||moduleFilter!=='All modules'||statusFilter!=='All statuses'||severityFilter!=='All severities'||priorityFilter!=='All priorities'?'No matching reports':'No bug reports yet'} description={rows.length?'Adjust your search or filters to see more reports.':'Record a real defect with reproduction steps and observed results.'} icon={BugIcon} action={!rows.length&&<button className="btn btn-primary" onClick={()=>setEditing(null)}>Create a bug report</button>}/>}</section>
    {editing!==false&&<BugForm initial={editing||undefined} modules={modules} onSave={save} onClose={()=>setEditing(false)} busy={create.isPending||update.isPending}/>}
  </>;
}
function BugDetail() {
  const params=useParams<{id:string}>(), id=params.id??'';
  const query=useGetBug(id,{query:{queryKey:getGetBugQueryKey(id),enabled:!!id}});
  const [location,setLocation]=useLocation();
  if(query.isLoading)return <LoadingPanel/>;
  if(query.isError||!query.data)return <><button className="btn btn-secondary" onClick={()=>setLocation('/bugs')}><ArrowLeft/> Bug reports</button><ErrorState retry={()=>void query.refetch()}/></>;
  const bug=query.data;
  return <><button className="btn btn-secondary" onClick={()=>setLocation('/bugs')} style={{marginBottom:22}} data-testid="button-back-bugs"><ArrowLeft/> Bug reports</button><PageHead eyebrow={`Bug report / ${bug.module}`} title={bug.title} subtitle={`${bug.id} · Reported ${prettyDate(bug.createdAt)}`}><Badge>{bug.status}</Badge></PageHead><div className="detail-layout"><section className="panel detail-content">{[['Description',bug.description],['Steps to reproduce',bug.stepsToReproduce],['Expected result',bug.expectedResult],['Actual result',bug.actualResult],['Environment',bug.environment]].map(([title,value])=><div className="detail-block" key={title as string}><h3>{title as string}</h3><p data-testid={`bug-detail-${String(title).toLowerCase().replaceAll(' ','-')}`}>{value as string||'Not recorded.'}</p></div>)}</section><aside className="panel detail-aside"><div className="section-title"><h2>Report properties</h2></div><div className="meta-line"><span>Severity</span><Badge>{bug.severity}</Badge></div><div className="meta-line"><span>Priority</span><Badge>{bug.priority}</Badge></div><div className="meta-line"><span>Module</span><strong>{bug.module}</strong></div><div className="meta-line"><span>Assignee</span><strong>{bug.assignee||'Unassigned'}</strong></div><div className="meta-line"><span>Updated</span><strong>{prettyDate(bug.updatedAt)}</strong></div></aside></div></>;
}

function RunsPage() {
  const caseQuery=useListTestCases({query:{queryKey:getListTestCasesQueryKey()}}), runsQuery=useListTestRuns({query:{queryKey:getListTestRunsQueryKey()}}), bugsQuery=useListBugs({query:{queryKey:getListBugsQueryKey()}});
  const create=useCreateTestRun(), client=useQueryClient(), notify=useNotify();
  const [module,setModule]=useState(''),[runName,setRunName]=useState(''),[statuses,setStatuses]=useState<Record<string,RunOutcomeStatus>>({}),[actual,setActual]=useState<Record<string,string>>({}),[notes,setNotes]=useState<Record<string,string>>({}),[bugLinks,setBugLinks]=useState<Record<string,string>>({});
  if(caseQuery.isLoading||runsQuery.isLoading||bugsQuery.isLoading)return <><PageHead eyebrow="Execution" title="Test runs" subtitle="Execute existing cases module by module and preserve the outcome."/><LoadingPanel rows={5}/></>;
  if(caseQuery.isError||runsQuery.isError||bugsQuery.isError)return <><PageHead eyebrow="Execution" title="Test runs" subtitle="Execute existing cases module by module and preserve the outcome."/><ErrorState retry={()=>{void caseQuery.refetch();void runsQuery.refetch();void bugsQuery.refetch();}}/></>;
  const cases=caseQuery.data??[], runs=runsQuery.data??[], bugData=bugsQuery.data??[];
  const modules=[...new Set(cases.map(c=>c.module))].sort();
  const moduleCases=cases.filter(c=>c.module===module);
  function chooseModule(value:string){setModule(value);setStatuses({});setActual({});setNotes({});setBugLinks({});}
  function recordRun(e:FormEvent){e.preventDefault();if(!moduleCases.length)return;const outcomes:RunOutcome[]=moduleCases.map(item=>({testCaseId:item.id,status:statuses[item.id]??'Not Run',actualResult:actual[item.id]??'',notes:notes[item.id]??'',bugId:(statuses[item.id]??'Not Run')==='Fail'?(bugLinks[item.id]||null):null}));const payload:TestRunInput={module,name:runName.trim()||`${module} execution`,outcomes};create.mutate({data:payload},{onSuccess:()=>{void client.invalidateQueries({queryKey:getListTestRunsQueryKey()});void client.invalidateQueries({queryKey:getListTestCasesQueryKey()});setRunName('');setStatuses({});setActual({});setNotes({});setBugLinks({});notify({text:'Execution recorded; case statuses and run history updated.'});},onError:()=>notify({text:'Could not record this test run.',kind:'error'})});}
  const sorted=[...runs].sort((a,b)=>Date.parse(b.executedAt)-Date.parse(a.executedAt));
  return <>
    <PageHead eyebrow="Execution / Module runs" title="Test runs" subtitle="Execute the existing test inventory and preserve what happened.">
      <button className="btn btn-secondary" disabled={!runs.length} onClick={()=>downloadCsv('test-run-history.csv',runs.flatMap(r=>r.outcomes.map(o=>({runId:r.id,runName:r.name,module:r.module,executedAt:r.executedAt,testCaseId:o.testCaseId,status:o.status,actualResult:o.actualResult,notes:o.notes,bugId:o.bugId}))))} data-testid="button-export-runs"><ArrowDownToLine/> Export history</button>
    </PageHead>
    <div className="notice"><CircleHelp/><span>Each run records an outcome for every existing case in the selected module. Saving the run also updates each case's current status and actual result; the run history remains preserved separately.</span></div>
    <section className="panel run-card"><div className="section-title"><div><h2>Start a module execution</h2><p>Choose from modules already present in your test case library.</p></div><span className="stat-icon"><FlaskConical/></span></div>
      {!modules.length?<EmptyState title="No modules to execute" description="Create a test case first. Its module will be available for execution here." icon={ClipboardCheck} action={<Link href="/test-cases" className="btn btn-secondary">Open test cases</Link>}/>:<form onSubmit={recordRun}>
        <div className="toolbar"><select className="select" value={module} onChange={e=>chooseModule(e.target.value)} aria-label="Select module" data-testid="select-run-module"><option value="">Choose module</option>{modules.map(m=><option key={m}>{m}</option>)}</select><input className="input" style={{maxWidth:280}} value={runName} onChange={e=>setRunName(e.target.value)} placeholder={module?`${module} execution`: 'Run name (optional)'} aria-label="Run name" data-testid="input-run-name"/>{module&&<span className="cell-sub">{moduleCases.length} existing {moduleCases.length===1?'case':'cases'}</span>}</div>
        {module&&<><div className="run-cases">{moduleCases.map(item=><div className="run-case" key={item.id} data-testid={`run-case-${item.id}`}><div><div className="run-case-name">{item.title}</div><div className="run-case-module mono">{item.id}</div></div><select className="select" style={{width:'100%',minWidth:0}} value={statuses[item.id]??'Not Run'} onChange={e=>setStatuses({...statuses,[item.id]:e.target.value as RunOutcomeStatus})} aria-label={`${item.title} outcome`} data-testid={`select-outcome-${item.id}`}>{['Not Run','Pass','Fail','Blocked'].map(s=><option key={s}>{s}</option>)}</select><textarea className="textarea" value={actual[item.id]??''} onChange={e=>setActual({...actual,[item.id]:e.target.value})} placeholder="Actual result" aria-label={`${item.title} actual result`} data-testid={`input-outcome-actual-${item.id}`}/><textarea className="textarea" value={notes[item.id]??''} onChange={e=>setNotes({...notes,[item.id]:e.target.value})} placeholder="Execution notes (optional)" aria-label={`${item.title} notes`} data-testid={`input-outcome-notes-${item.id}`}/><select className="select" style={{width:'100%',minWidth:0}} value={bugLinks[item.id]??''} disabled={(statuses[item.id]??'Not Run')!=='Fail'} onChange={e=>setBugLinks({...bugLinks,[item.id]:e.target.value})} aria-label={`${item.title} linked bug`} data-testid={`select-outcome-bug-${item.id}`}><option value="">No linked bug</option>{bugData.map(bug=><option key={bug.id} value={bug.id}>{bug.id} · {bug.title}</option>)}</select></div>)}</div><div style={{display:'flex',justifyContent:'flex-end',paddingTop:15}}><button className="btn btn-primary" disabled={create.isPending} data-testid="button-record-run"><Check/> {create.isPending?'Recording…':'Record execution'}</button></div></>}
      </form>}
    </section>
    <div className="section-title" style={{marginTop:29}}><div><h2>Execution history</h2><p>{runs.length} recorded {runs.length===1?'run':'runs'}, newest first.</p></div></div>
    {sorted.length?sorted.map(run=><RunHistory key={run.id} run={run} cases={cases}/>):<section className="panel"><EmptyState title="No execution history" description="Recorded module runs appear here with a full outcome breakdown." icon={Clock3}/></section>}
  </>;
}
function RunHistory({run,cases}:{run:TestRun;cases:TestCase[]}) {
  const [open,setOpen]=useState(false);
  const tally=(status:string)=>run.outcomes.filter(o=>o.status===status).length;
  return <section className="panel run-card" data-testid={`run-history-${run.id}`}><div className="run-card-head"><div><div className="cell-title" style={{fontSize:14}}>{run.name}</div><div className="cell-sub">{run.module} · {prettyDate(run.executedAt)} · <span className="mono">{run.id}</span></div></div><div style={{display:'flex',alignItems:'center',gap:8}}><Badge>{tally('Fail')?'Fail':tally('Blocked')?'Blocked':tally('Not Run')?'Not Run':'Pass'}</Badge><button className="btn btn-secondary btn-small" onClick={()=>setOpen(!open)} data-testid={`button-toggle-run-${run.id}`}>{open?'Hide outcomes':'View outcomes'}</button></div></div>
    <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>{['Pass','Fail','Blocked','Not Run'].map(s=><span key={s} className="cell-sub"><Badge>{s}</Badge> {tally(s)}</span>)}</div>
    {open&&<div className="run-cases" style={{marginTop:15}}>{run.outcomes.map((o,i)=><div className="recent-row" key={`${o.testCaseId}-${i}`} data-testid={`run-outcome-${run.id}-${o.testCaseId}`}><div><div className="recent-name">{cases.find(c=>c.id===o.testCaseId)?.title??o.testCaseId}</div><div className="recent-meta">{o.actualResult||o.notes||'No observation recorded'}{o.bugId&&<> · <Link href={`/bugs/${o.bugId}`} data-testid={`link-run-bug-${o.bugId}`}>{o.bugId}</Link></>}</div></div><Badge>{o.status}</Badge></div>)}</div>}
  </section>;
}

function LegacyGeneratorPage() {
  const query=useListTestCases({query:{queryKey:getListTestCasesQueryKey()}});
  const create=useCreateTestCase(), client=useQueryClient(), notify=useNotify();
  const [sourceId,setSourceId]=useState(''),[rule,setRule]=useState('Boundary review'),[draft,setDraft]=useState<TestCaseInput|null>(null);
  const cases=query.data??[];
  const source=cases.find(c=>c.id===sourceId)??cases[0];
  const rules=[
    {name:'Boundary review',description:'Re-check the documented flow at the edge of its stated test data.'},
    {name:'Negative input review',description:'Re-check the documented flow with an invalid or incomplete value.'},
    {name:'Repeatability review',description:'Repeat the same documented steps and compare the observed result.'},
  ];
  function generate(){if(!source)return;const selected=rules.find(r=>r.name===rule)!;const phrasing=selected.name==='Boundary review'?'at the boundary of the documented test data':selected.name==='Negative input review'?'with an invalid or incomplete value':'a second time to confirm repeatability';setDraft({title:`${selected.name}: ${source.title}`,module:source.module,preconditions:source.preconditions,steps:`Use the existing steps as the baseline. Repeat ${phrasing}. Record the value used and any difference from the baseline.\\n\\nBaseline steps:\\n${source.steps}`,testData:source.testData,expectedResult:`The documented expected result remains consistent when the check is repeated ${phrasing}.`,actualResult:'',priority:source.priority,status:'Not Run'});}
  function save(e:FormEvent){e.preventDefault();if(!draft)return;create.mutate({data:draft},{onSuccess:()=>{void client.invalidateQueries({queryKey:getListTestCasesQueryKey()});setDraft(null);notify({text:'Suggestion saved as a test case.'});},onError:()=>notify({text:'Could not save this suggestion.',kind:'error'})});}
  if(query.isLoading)return <><PageHead eyebrow="Authoring / Rule-based" title="Suggestion generator" subtitle="Turn existing case structure into an editable check."/><LoadingPanel/></>;
  if(query.isError)return <><PageHead eyebrow="Authoring / Rule-based" title="Suggestion generator" subtitle="Suggestions are deterministic prompts, not AI-generated or validated tests."/><ErrorState retry={()=>void query.refetch()}/></>;
  return <>
    <PageHead eyebrow="Authoring / Rule-based" title="Suggestion generator" subtitle="A transparent rule-based starting point, grounded in one of your existing cases."/>
    <div className="notice"><Sparkles/><span><strong>Rule-based, not AI-generated.</strong> Suggestions use only an existing case's module, data, and steps plus the selected transformation. Review and edit every field before saving.</span></div>
    {!cases.length?<section className="panel"><EmptyState title="Nothing to build from yet" description="Create a real test case first. The generator only uses case data already in this workspace." icon={Sparkles} action={<Link href="/test-cases" className="btn btn-primary">Open test cases</Link>}/></section>:<div className="generator-grid">
      <section className="panel panel-pad"><div className="section-title"><div><h2>Choose a source</h2><p>One actual case, one explicit rule.</p></div></div>
        <Field label="Existing test case"><select className="select" style={{width:'100%'}} value={sourceId||source?.id||''} onChange={e=>{setSourceId(e.target.value);setDraft(null);}} data-testid="select-generator-source">{cases.map(c=><option value={c.id} key={c.id}>{c.title}</option>)}</select></Field>
        <div style={{height:14}}/><Field label="Suggestion rule"><select className="select" style={{width:'100%'}} value={rule} onChange={e=>{setRule(e.target.value);setDraft(null);}} data-testid="select-generator-rule">{rules.map(r=><option key={r.name}>{r.name}</option>)}</select></Field>
        <div style={{marginTop:13}} className="rule-item"><span className="rule-number">RULE</span><span>{rules.find(r=>r.name===rule)?.description}</span></div>
        <button className="btn btn-primary" style={{width:'100%',marginTop:18}} onClick={generate} data-testid="button-generate-suggestion"><Sparkles/> Generate editable suggestion</button>
      </section>
      <section className="panel panel-pad"><div className="section-title"><div><h2>Suggestion preview</h2><p>Nothing is saved until you choose to save it.</p></div></div>
        {!draft?<EmptyState title="Pick a source and rule" description="Generate a proposal, then revise the wording and expected result before adding it to the library." icon={FilePlus2}/>:<form onSubmit={save} className="form-grid">
          <Field label="Title" full><input className="input" value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} required data-testid="input-suggestion-title"/></Field>
          <Field label="Module"><input className="input" value={draft.module} readOnly aria-label="Source module (preserved)" data-testid="input-suggestion-module"/></Field>
          <Field label="Priority"><select className="select" style={{width:'100%'}} value={draft.priority} onChange={e=>setDraft({...draft,priority:e.target.value as TestCasePriority})} data-testid="input-suggestion-priority">{['Low','Medium','High','Critical'].map(x=><option key={x}>{x}</option>)}</select></Field>
          {([['Preconditions','preconditions'],['Steps','steps'],['Test data','testData'],['Expected result','expectedResult'],['Actual result','actualResult']] as const).map(([label,key])=><Field label={label} full key={key}><textarea className="textarea" value={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.value})} data-testid={`input-suggestion-${key}`}/></Field>)}
          <div className="field full" style={{display:'flex',justifyContent:'flex-end'}}><button className="btn btn-primary" disabled={create.isPending} data-testid="button-save-suggestion"><Check/> {create.isPending?'Saving…':'Save as test case'}</button></div>
        </form>}
      </section>
    </div>}
  </>;
}

function GeneratorPage() {
  const create=useCreateTestCase(), client=useQueryClient(), notify=useNotify();
  const [feature,setFeature]=useState(''),[requirement,setRequirement]=useState(''),[drafts,setDrafts]=useState<TestCaseInput[]>([]);
  const templates=[
    {kind:'Positive',priority:'High' as TestCasePriority,testData:'Valid input at the documented standard value.',steps:'1. Open the relevant feature.\n2. Enter valid, supported data.\n3. Submit the action and observe the result.',expected:'The feature completes the requested action and shows the expected success state.'},
    {kind:'Negative',priority:'High' as TestCasePriority,testData:'Invalid, unauthorized, or unsupported input.',steps:'1. Open the relevant feature.\n2. Enter an invalid or unauthorized value.\n3. Submit the action and inspect the response.',expected:'The input is rejected safely, the user receives a clear message, and no unintended data is saved.'},
    {kind:'Boundary value',priority:'Medium' as TestCasePriority,testData:'Values at the documented minimum, maximum, and immediately outside each limit.',steps:'1. Identify the feature limits from the requirement.\n2. Test the minimum and maximum allowed values.\n3. Test one value just below and above the limits.',expected:'Values within the specified range are handled correctly; values outside the range are rejected or safely constrained.'},
    {kind:'Input validation',priority:'High' as TestCasePriority,testData:'Empty required value, malformed value, whitespace-only value, and valid control value.',steps:'1. Leave each required input empty and submit.\n2. Enter a malformed value and submit.\n3. Enter whitespace-only data and submit.\n4. Repeat with a valid control value.',expected:'Invalid values are identified at the appropriate fields; valid data can proceed and no malformed record is created.'},
    {kind:'Error handling',priority:'Medium' as TestCasePriority,testData:'Simulated service failure, timeout, or unavailable dependency.',steps:'1. Open the feature with the service unavailable or request timed out.\n2. Perform the requested action.\n3. Observe the message, page state, and retry behavior.',expected:'A useful, non-sensitive error is shown; the page stays stable and the user can retry without duplicate or partial changes.'},
  ];
  function generate(e:FormEvent){e.preventDefault();const featureName=feature.trim(),requirementText=requirement.trim();if(!featureName||!requirementText)return;setDrafts(templates.map(template=>({title:`${featureName}: ${template.kind} scenario`,module:featureName,preconditions:`Requirement: ${requirementText}`,steps:template.steps,testData:template.testData,expectedResult:`${template.expected}\n\nRequirement under test: ${requirementText}`,actualResult:'',priority:template.priority,status:'Not Run'})));}
  function updateDraft(index:number,key:keyof TestCaseInput,value:string){setDrafts(current=>current.map((draft,i)=>i===index?{...draft,[key]:value}:draft));}
  function saveDraft(index:number){const draft=drafts[index];if(!draft)return;create.mutate({data:draft},{onSuccess:()=>{void client.invalidateQueries({queryKey:getListTestCasesQueryKey()});setDrafts(current=>current.filter((_,i)=>i!==index));notify({text:'Suggestion saved as a test case.'});},onError:()=>notify({text:'Could not save this suggestion.',kind:'error'})});}
  return <>
    <PageHead eyebrow="Authoring / Rule-based" title="Test case generator" subtitle="Turn a feature requirement into a reviewable set of test scenarios."/>
    <div className="notice"><Sparkles/><span><strong>Rule-based generator, not an AI API.</strong> It applies reusable QA templates to your feature name and requirement text. Review each suggestion carefully; nothing is saved until you choose.</span></div>
    <div className="generator-grid">
      <section className="panel panel-pad"><div className="section-title"><div><h2>Describe the feature</h2><p>Use a specific requirement to ground the suggestions.</p></div></div>
        <form onSubmit={generate} className="form-grid">
          <Field label="Feature name" full><input className="input" value={feature} onChange={e=>setFeature(e.target.value)} placeholder="e.g. Password reset" required maxLength={80} data-testid="input-generator-feature"/></Field>
          <Field label="Software requirement" full hint="Paste the relevant requirement or acceptance criterion."><textarea className="textarea" value={requirement} onChange={e=>setRequirement(e.target.value)} placeholder="What should this feature do, and what limits or errors should it handle?" required minLength={8} maxLength={2000} data-testid="input-generator-requirement"/></Field>
          <div className="field full"><button className="btn btn-primary" type="submit" data-testid="button-generate-suggestion"><Sparkles/> Generate 5 scenarios</button></div>
        </form>
        <div style={{marginTop:16}}>{templates.map(template=><div className="rule-item" key={template.kind}><span className="rule-number">{template.kind.toUpperCase()}</span><span>{template.testData}</span></div>)}</div>
      </section>
      <section className="panel panel-pad"><div className="section-title"><div><h2>Editable suggestions</h2><p>{drafts.length?`${drafts.length} unsaved scenarios`:'Generated cases remain drafts until saved.'}</p></div></div>
        {!drafts.length?<EmptyState title="No suggestions yet" description="Enter a feature and requirement, then generate positive, negative, boundary, validation, and error-handling scenarios." icon={FilePlus2}/>:<div className="suggestion-list">{drafts.map((draft,index)=><section className="suggestion-card" key={`${draft.title}-${index}`} data-testid={`card-suggestion-${index}`}>
          <div className="suggestion-heading"><div><span className="eyebrow">{templates[index]?.kind ?? 'Scenario'} scenario</span><h3>{draft.title}</h3></div><Badge>{draft.priority}</Badge></div>
          <div className="form-grid">
            <Field label="Title" full><input className="input" value={draft.title} onChange={e=>updateDraft(index,'title',e.target.value)} required data-testid={`input-suggestion-title-${index}`}/></Field>
            <Field label="Module"><input className="input" value={draft.module} onChange={e=>updateDraft(index,'module',e.target.value)} required data-testid={`input-suggestion-module-${index}`}/></Field>
            <Field label="Priority"><select className="select" style={{width:'100%'}} value={draft.priority} onChange={e=>updateDraft(index,'priority',e.target.value as TestCasePriority)} data-testid={`input-suggestion-priority-${index}`}>{['Low','Medium','High','Critical'].map(x=><option key={x}>{x}</option>)}</select></Field>
            {([['Preconditions','preconditions'],['Steps','steps'],['Test data','testData'],['Expected result','expectedResult']] as const).map(([label,key])=><Field label={label} full key={key}><textarea className="textarea" value={draft[key]} onChange={e=>updateDraft(index,key,e.target.value)} required={key==='steps'||key==='expectedResult'} data-testid={`input-suggestion-${key}-${index}`}/></Field>)}
            <div className="field full" style={{display:'flex',justifyContent:'flex-end'}}><button className="btn btn-primary" type="button" disabled={create.isPending} onClick={()=>saveDraft(index)} data-testid={`button-save-suggestion-${index}`}><Check/> Save as test case</button></div>
          </div>
        </section>)}</div>}
      </section>
    </div>
  </>;
}

function ReportsPage() {
  const runsQuery=useListTestRuns({query:{queryKey:getListTestRunsQueryKey()}});
  const casesQuery=useListTestCases({query:{queryKey:getListTestCasesQueryKey()}});
  const bugsQuery=useListBugs({query:{queryKey:getListBugsQueryKey()}});
  if(runsQuery.isLoading||casesQuery.isLoading||bugsQuery.isLoading)return <><PageHead eyebrow="Quality signals" title="Execution reports" subtitle="A review-ready summary built from recorded test run outcomes."/><LoadingPanel rows={5}/></>;
  if(runsQuery.isError||casesQuery.isError||bugsQuery.isError)return <><PageHead eyebrow="Quality signals" title="Execution reports" subtitle="A review-ready summary built from recorded test run outcomes."/><ErrorState retry={()=>{void runsQuery.refetch();void casesQuery.refetch();void bugsQuery.refetch();}}/></>;
  const runs=runsQuery.data??[], cases=casesQuery.data??[], bugs=bugsQuery.data??[];
  const outcomes=runs.flatMap(r=>r.outcomes), pass=outcomes.filter(o=>o.status==='Pass').length, fail=outcomes.filter(o=>o.status==='Fail').length, blocked=outcomes.filter(o=>o.status==='Blocked').length, notRun=outcomes.filter(o=>o.status==='Not Run').length;
  const denominator=pass+fail;
  const passRate=denominator?Math.round(pass/denominator*100):0;
  const issueOpen=bugs.filter(b=>b.status!=='Closed'&&b.status!=='Fixed').length;
  function exportOutcomes(){downloadCsv('testpilot-execution-summary.csv',runs.flatMap(r=>r.outcomes.map(o=>({run:r.name,runId:r.id,module:r.module,executedAt:r.executedAt,testCaseId:o.testCaseId,status:o.status,actualResult:o.actualResult,notes:o.notes,bugId:o.bugId}))))}
  return <>
    <PageHead eyebrow="Quality signals / Reporting" title="Execution reports" subtitle="A review-ready summary based on recorded outcomes, not assumptions."><div className="report-toolbar no-print"><button className="btn btn-secondary" onClick={exportOutcomes} disabled={!outcomes.length} data-testid="button-export-report"><ArrowDownToLine/> Export CSV</button><button className="btn btn-primary" onClick={()=>window.print()} data-testid="button-print-report"><Printer/> Print report</button></div></PageHead>
    <div className="notice"><BarChart3/><span>Summary includes recorded test-run outcomes only. Untested cases are not counted as passes; the library count is shown separately.</span></div>
    <div className="report-overview">
      <div className="panel report-kpi" data-testid="report-metric-pass-rate"><span>Pass rate · executed only</span><strong>{denominator?`${passRate}%`:'—'}</strong></div>
      <div className="panel report-kpi" data-testid="report-metric-executions"><span>Recorded outcomes</span><strong>{outcomes.length}</strong></div>
      <div className="panel report-kpi" data-testid="report-metric-open-bugs"><span>Active bug reports</span><strong>{issueOpen}</strong></div>
      <div className="panel report-kpi" data-testid="report-metric-cases"><span>Library cases</span><strong>{cases.length}</strong></div>
    </div>
    <div className="dash-grid">
      <section className="panel panel-pad"><div className="section-title"><div><h2>Outcome distribution</h2><p>Every outcome recorded across all runs.</p></div></div>
        {outcomes.length?<div className="bar-list">{[['Pass',pass],['Fail',fail],['Blocked',blocked],['Not Run',notRun]].map(([label,count])=><div className="bar-row" key={String(label)}><span><Badge>{String(label)}</Badge></span><div className="bar-track"><div className="bar-fill" style={{width:`${Number(count)/outcomes.length*100}%`}}/></div><span className="mono">{count}</span></div>)}</div>:<EmptyState title="No outcomes to summarize" description="Once you record a module execution, this report will show its outcomes." icon={BarChart3} action={<Link className="btn btn-secondary" href="/runs">Start a test run</Link>}/>}
      </section>
      <section className="panel panel-pad"><div className="section-title"><div><h2>Report scope</h2><p>Current inventory alongside execution signal.</p></div></div><div className="recent-list">{[['Recorded runs',runs.length],['Executed passes',pass],['Executed failures',fail],['Blocked outcomes',blocked],['Not run outcomes',notRun],['Cases in library',cases.length],['Open bug reports',issueOpen]].map(([label,value])=><div className="recent-row" key={String(label)}><span className="recent-meta" style={{fontSize:11}}>{label}</span><strong data-testid={`report-count-${String(label).toLowerCase().replaceAll(' ','-')}`}>{value}</strong></div>)}</div></section>
    </div>
    <section className="panel panel-pad"><div className="section-title"><div><h2>Active bugs by severity</h2><p>Open, in-progress, retest, and reopened reports.</p></div></div><div className="bar-list">{['Critical','Major','Minor','Trivial'].map(severity=>{const count=bugs.filter(b=>b.severity===severity&&b.status!=='Closed'&&b.status!=='Fixed').length;return <div className="bar-row" key={severity} data-testid={`report-bugs-${severity.toLowerCase()}`}><span><Badge>{severity}</Badge></span><div className="bar-track"><div className="bar-fill" style={{width:`${issueOpen?count/issueOpen*100:0}%`}}/></div><span className="mono">{count}</span></div>;})}</div></section>
    <section className="panel panel-pad" style={{marginTop:17}}><div className="section-title"><div><h2>Run history</h2><p>Latest executions with their recorded signal.</p></div></div>
      {runs.length?<div className="table-wrap"><table><thead><tr><th>Run</th><th>Module</th><th>Executed</th><th>Pass</th><th>Fail</th><th>Blocked</th></tr></thead><tbody>{[...runs].sort((a,b)=>Date.parse(b.executedAt)-Date.parse(a.executedAt)).map(r=><tr key={r.id} data-testid={`report-run-${r.id}`}><td><div className="cell-title">{r.name}</div><div className="mono">{r.id}</div></td><td>{r.module}</td><td className="mono">{prettyDate(r.executedAt)}</td><td>{r.outcomes.filter(o=>o.status==='Pass').length}</td><td>{r.outcomes.filter(o=>o.status==='Fail').length}</td><td>{r.outcomes.filter(o=>o.status==='Blocked').length}</td></tr>)}</tbody></table></div>:<EmptyState title="No runs to list" description="Run history will appear when test cases have been executed." icon={Clock3}/>}
    </section>
  </>;
}

function AdminReset() {
  const reset=useResetDemoData(), client=useQueryClient(), notify=useNotify();
  function resetData(){if(!window.confirm('Reset the workspace demo data? This replaces the current demo data.'))return;reset.mutate(undefined,{onSuccess:()=>{void client.invalidateQueries({queryKey:getListTestCasesQueryKey()});void client.invalidateQueries({queryKey:getListBugsQueryKey()});void client.invalidateQueries({queryKey:getListTestRunsQueryKey()});notify({text:'Demo data reset.'});},onError:()=>notify({text:'Could not reset demo data.',kind:'error'})});}
  return <button className="btn btn-quiet btn-small" onClick={resetData} disabled={reset.isPending} title="Reset demo data" data-testid="button-reset-demo"><RotateCcw/> {reset.isPending?'Resetting…':'Reset demo data'}</button>;
}
function RoutedApp() {
  const [location]=useLocation();
  return <ErrorBoundary resetKey={location}><Shell><Switch>
    <Route path="/" component={Dashboard}/>
    <Route path="/test-cases" component={TestCasesPage}/>
    <Route path="/test-cases/:id" component={CaseDetail}/>
    <Route path="/bugs" component={BugsPage}/>
    <Route path="/bugs/:id" component={BugDetail}/>
    <Route path="/runs" component={RunsPage}/>
    <Route path="/generator" component={GeneratorPage}/>
    <Route path="/reports" component={ReportsPage}/>
    <Route component={NotFound}/>
  </Switch><div style={{display:'flex',justifyContent:'flex-end',marginTop:30}} className="no-print"><AdminReset/></div></Shell></ErrorBoundary>;
}
function App() {
  const [toast,setToast]=useState<ToastMessage>(null);
  return <QueryClientProvider client={queryClient}><TooltipProvider><ToastContext.Provider value={setToast}><RoutedApp/>{toast&&<div className="toast-stack" role="status"><div className={cx('toast',toast.kind)} data-testid="toast-message">{toast.text}<button className="icon-btn" onClick={()=>setToast(null)} aria-label="Dismiss notification" style={{float:'right',marginTop:-6,marginRight:-7}}><X/></button></div></div>}</ToastContext.Provider><Toaster/></TooltipProvider></QueryClientProvider>;
}

export default App;

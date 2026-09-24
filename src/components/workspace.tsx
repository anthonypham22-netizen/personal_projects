"use client";
import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  LayoutDashboard,
  BriefcaseBusiness,
  Compass,
  FolderLock,
  MessagesSquare,
  ListTodo,
  Users,
  Settings,
  LogOut,
  ChevronRight,
  Building2,
  MapPin,
  Search,
  Check,
  FileText,
  Download,
  X,
  ShieldCheck,
  Clock3,
  CircleHelp,
  LockKeyhole,
  CircleCheck,
  Send,
  Upload,
  SlidersHorizontal,
  Handshake,
  LoaderCircle,
} from "lucide-react";
import { Brand } from "./brand";
import { cn } from "@/lib/utils";
import {
  money,
  PROVINCES,
  SECTORS,
  STAGES,
  ORGANIZATION_TYPE_LABELS,
  BUYER_ORGANIZATION_TYPES,
  BUYER_PROJECT_STATUSES,
  BUYER_PROJECT_TRANSACTION_TYPES,
  BUYER_PROJECT_OWNERSHIP_PREFERENCES,
  type WorkspaceData,
  type Deal,
  type BuyerProject,
  type Task,
  type Document,
  type Access,
} from "@/lib/types";

const buyerOrganizationTypes = new Set<string>(BUYER_ORGANIZATION_TYPES);
const projectTransactionLabel = (value: string) =>
  ({
    full_acquisition: "Full acquisition",
    majority_acquisition: "Majority acquisition",
    minority_investment: "Minority investment",
    add_on: "Add-on acquisition",
    recapitalization: "Recapitalization",
    other: "Other",
  })[value] || statusText(value);
const projectOwnershipLabel = (value: string) =>
  ({
    "100_percent": "100% ownership",
    majority: "Majority ownership",
    minority: "Minority ownership",
    flexible: "Flexible ownership",
  })[value] || statusText(value);

type Result = { id?: string; message: string };
type ContextValue = {
  data: WorkspaceData;
  busy: boolean;
  act: (
    action: string,
    values: Record<string, unknown>,
  ) => Promise<Result | undefined>;
  refresh: () => Promise<void>;
  notify: (message: string, error?: boolean) => void;
};
const WorkspaceContext = createContext<ContextValue>(null!);
const useWorkspace = () => useContext(WorkspaceContext);
const initials = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
const dateLabel = (date: string) =>
  new Date(
    date.includes("T")
      ? date
      : date.length === 10
        ? `${date}T12:00:00Z`
        : `${date.replace(" ", "T")}Z`,
  ).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "America/Toronto",
  });
const statusText = (value: string) =>
  value.replaceAll("_", " ").replace(/^./, (v) => v.toUpperCase());
function Status({ value }: { value: string }) {
  return (
    <span
      className={cn(
        "badge",
        [
          "approved",
          "verified",
          "done",
          "Closed",
          "Due diligence",
          "Shortlisted",
        ].includes(value)
          ? "badge-green"
          : ["requested", "nda_pending", "LOI review", "Under review"].includes(
                value,
              )
            ? "badge-amber"
            : ["revoked", "denied", "Not proceeding"].includes(value)
              ? "badge-red"
              : "badge-blue",
      )}
    >
      {statusText(value)}
    </span>
  );
}
function Empty({
  title,
  body,
  href,
  label = "View opportunities",
}: {
  title: string;
  body: string;
  href?: string;
  label?: string;
}) {
  return (
    <div className="empty">
      <FolderLock size={30} strokeWidth={1.4} />
      <h3>{title}</h3>
      <p>{body}</p>
      {href && (
        <Link className="button button-quiet" href={href}>
          {label}
          <ArrowRight size={16} />
        </Link>
      )}
    </div>
  );
}
function Heading({
  title,
  description,
  eyebrow,
  children,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
function Panel({
  title,
  children,
  link,
  label = "View all",
  className = "",
}: {
  title: string;
  children: ReactNode;
  link?: string;
  label?: string;
  className?: string;
}) {
  return (
    <section className={cn("panel", className)}>
      <div className="panel-header">
        <h2>{title}</h2>
        {link && (
          <Link href={link}>
            {label}
            <ArrowUpRight size={14} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
function Field({
  label,
  name,
  value,
  type = "text",
  required = true,
  min,
  max,
  help,
}: {
  label: string;
  name: string;
  value?: string | number;
  type?: string;
  required?: boolean;
  min?: number;
  max?: number;
  help?: string;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        min={min}
        max={max}
        maxLength={type === "text" ? 200 : undefined}
      />
      {help && <span className="field-hint">{help}</span>}
    </label>
  );
}
function SelectField({
  label,
  name,
  options,
  value,
  empty,
}: {
  label: string;
  name: string;
  options: readonly string[];
  value?: string;
  empty?: string;
}) {
  return (
    <label>
      {label}
      <select
        name={name}
        defaultValue={value || ""}
        required={empty === undefined}
      >
        {empty !== undefined && <option value="">{empty}</option>}
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
function MultiSelectField({
  label,
  name,
  options,
  values = [],
  help,
}: {
  label: string;
  name: string;
  options: string[];
  values?: string[];
  help?: string;
}) {
  return (
    <label>
      {label}
      <select name={name} multiple defaultValue={values} size={4}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {help && <span className="field-hint">{help}</span>}
    </label>
  );
}
function MutationForm({
  action,
  extra = {},
  children,
  label = "Save changes",
  onSuccess,
  reset = false,
}: {
  action: string;
  extra?: Record<string, unknown>;
  children: ReactNode;
  label?: string;
  onSuccess?: (result: Result) => void;
  reset?: boolean;
}) {
  const { act, busy } = useWorkspace();
  const [error, setError] = useState("");
  return (
    <form
      className="inline-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        const form = e.currentTarget;
        const data: Record<string, unknown> = {
          ...Object.fromEntries(new FormData(form)),
          ...extra,
        };
        for (const checkbox of form.querySelectorAll<HTMLInputElement>(
          'input[type="checkbox"]',
        ))
          data[checkbox.name] = checkbox.checked;
        for (const select of form.querySelectorAll<HTMLSelectElement>(
          "select[multiple]",
        ))
          data[select.name] = Array.from(
            select.selectedOptions,
            (option) => option.value,
          );
        const keywords = form.querySelector<HTMLInputElement>(
          'input[name="keywords"]',
        );
        if (keywords)
          data.keywords = keywords.value
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean);
        const result = await act(action, data);
        if (result) {
          if (reset) form.reset();
          onSuccess?.(result);
        } else
          setError(
            "Changes were not saved. See the message above and try again.",
          );
      }}
    >
      {children}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button className="button button-green" disabled={busy}>
          {busy ? <LoaderCircle size={16} /> : <Check size={16} />} {label}
        </button>
      </div>
    </form>
  );
}

export function Workspace({
  initial,
  section,
  dealId,
}: {
  initial: WorkspaceData;
  section: string;
  dealId?: string;
}) {
  const [data, setData] = useState(initial),
    [busy, setBusy] = useState(false),
    [feedback, setFeedback] = useState<{
      message: string;
      error: boolean;
    } | null>(null);
  const router = useRouter();
  const notify = (message: string, error = false) =>
    setFeedback({ message, error });
  const refresh = async () => {
    const response = await fetch("/api/workspace", { cache: "no-store" });
    if (response.status === 401) {
      window.location.assign("/login");
      return;
    }
    if (!response.ok) throw new Error("Unable to refresh your workspace.");
    setData(await response.json());
  };
  const act = async (action: string, values: Record<string, unknown>) => {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, data: values }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Unable to save.");
      if (action === "password") {
        window.location.assign("/login");
        return json as Result;
      }
      try {
        await refresh();
        notify(json.message);
      } catch {
        notify(
          "Saved, but the workspace could not refresh. Reload the page to see the latest changes.",
          true,
        );
      }
      return json as Result;
    } catch (e) {
      notify(e instanceof Error ? e.message : "Unable to save.", true);
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  const nav = [
    { id: "overview", label: "Overview", Icon: LayoutDashboard },
    { id: "opportunities", label: "Opportunities", Icon: Compass },
    ...(buyerOrganizationTypes.has(data.organization.organization_type)
      ? [
          {
            id: "projects",
            label: "Acquisition Projects",
            Icon: SlidersHorizontal,
          },
        ]
      : []),
    {
      id: "deals",
      label: data.user.role === "buyer" ? "My pipeline" : "My mandates",
      Icon: BriefcaseBusiness,
    },
    { id: "documents", label: "Documents", Icon: FolderLock },
    { id: "messages", label: "Messages", Icon: MessagesSquare },
    { id: "tasks", label: "Tasks", Icon: ListTodo },
    { id: "network", label: "Advisor network", Icon: Users },
    { id: "settings", label: "Settings", Icon: Settings },
  ];
  const current = nav.find((n) => n.id === section)?.label || "Workspace";
  const deal = dealId ? data.deals.find((d) => d.id === dealId) : undefined;
  const logout = async () => {
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      if (!res.ok) throw new Error();
      window.location.assign("/login");
    } catch {
      notify("Could not sign out. Please try again.", true);
    }
  };
  return (
    <WorkspaceContext.Provider value={{ data, busy, act, refresh, notify }}>
      <div className="app-shell">
        <aside className="sidebar">
          <Brand href="/app" />
          <div className="firm-switch">
            <div className="firm-avatar">
              {initials(data.organization.name)}
            </div>
            <div>
              <strong>{data.organization.name}</strong>
              <span>
                {ORGANIZATION_TYPE_LABELS[data.organization.organization_type]}
              </span>
            </div>
          </div>
          <p className="nav-label">WORKSPACE</p>
          <nav aria-label="Workspace navigation">
            {nav.map(({ id, label, Icon }) => (
              <Link
                href={id === "overview" ? "/app" : `/app/${id}`}
                key={id}
                className={cn(section === id && "active")}
                aria-current={section === id ? "page" : undefined}
              >
                <Icon size={18} strokeWidth={1.7} />
                {label}
                {id === "tasks" &&
                  data.tasks.filter((t) => t.status === "open").length > 0 && (
                    <span className="nav-count">
                      {data.tasks.filter((t) => t.status === "open").length}
                    </span>
                  )}
              </Link>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="workspace-note">
              <strong className="flex items-center gap-1">
                <ShieldCheck size={14} /> Your deal. Your permissions.
              </strong>
              Confidential files stay within approved deal teams.
              <Link href="/about-this-release" className="mt-2 block underline">
                About this release
              </Link>
            </div>
            <div className="user-summary">
              <span className="avatar">{initials(data.user.name)}</span>
              <div className="min-w-0 flex-1">
                <strong className="truncate">{data.user.name}</strong>
                <small>
                  {data.user.role} · {data.organization.membership_role}
                </small>
              </div>
              <button
                className="icon-button"
                onClick={() => void logout()}
                aria-label="Sign out"
              >
                <LogOut size={17} />
              </button>
            </div>
          </div>
        </aside>
        <div className="app-body">
          <header className="topbar">
            <div className="mobile-brand">
              <Brand href="/app" />
            </div>
            <div className="breadcrumbs">
              <span>Workspace</span>
              <ChevronRight size={14} />
              <strong>{current}</strong>
              {deal && (
                <>
                  <ChevronRight size={14} />
                  <span>{deal.title}</span>
                </>
              )}
            </div>
            <div className="topbar-right">
              {busy && <span role="status">Saving…</span>}
              <span className="hidden md:block">
                {data.demo
                  ? "Fictional demonstration workspace"
                  : "Private workspace"}
              </span>
              {data.demo ? (
                <Link href="/login" className="badge badge-amber">
                  Switch demo role <ChevronRight size={13} />
                </Link>
              ) : (
                <Link href="/app/settings" className="badge">
                  Account
                </Link>
              )}
              <button
                className="icon-button lg:hidden"
                onClick={() => void logout()}
                aria-label="Sign out"
              >
                <LogOut size={17} />
              </button>
            </div>
          </header>
          <nav className="mobile-nav" aria-label="Mobile workspace navigation">
            {nav.map((n) => (
              <Link
                key={n.id}
                href={n.id === "overview" ? "/app" : `/app/${n.id}`}
                className={cn(section === n.id && "active")}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <main className="app-main">
            {feedback && (
              <div
                className={cn("feedback", feedback.error && "error")}
                role={feedback.error ? "alert" : "status"}
              >
                <span>{feedback.message}</span>
                <button
                  aria-label="Dismiss message"
                  onClick={() => setFeedback(null)}
                >
                  <X size={17} />
                </button>
              </div>
            )}
            {section === "overview" ? (
              <Overview />
            ) : section === "opportunities" ? (
              <Opportunities />
            ) : section === "projects" ? (
              <AcquisitionProjects />
            ) : section === "new" ? (
              <NewDeal onCreated={(id) => router.push(`/app/deals/${id}`)} />
            ) : section === "deals" && dealId ? (
              deal ? (
                <DealDetail deal={deal} />
              ) : (
                <Empty
                  title="This deal is not available"
                  body="The link may be incorrect or you may not have access."
                  href="/app/deals"
                  label="Back to your deals"
                />
              )
            ) : section === "deals" ? (
              <Pipeline />
            ) : section === "documents" ? (
              <DocumentsPage />
            ) : section === "messages" ? (
              <MessagesPage />
            ) : section === "tasks" ? (
              <TasksPage />
            ) : section === "network" ? (
              <Network />
            ) : section === "settings" ? (
              <SettingsPage />
            ) : (
              <Empty
                title="Page not found"
                body="Return to your workspace to continue."
                href="/app"
                label="Return to overview"
              />
            )}
          </main>
        </div>
      </div>
    </WorkspaceContext.Provider>
  );
}

function Overview() {
  const { data } = useWorkspace(),
    { user } = data;
  const canCreateMandates =
    user.role !== "buyer" && data.organization.membership_role !== "viewer";
  const pipeline = data.deals.filter(
    (d) =>
      d.can_manage ||
      ["approved", "nda_pending", "requested"].includes(d.access_status || ""),
  );
  const open = data.tasks.filter((t) => t.status === "open");
  const pending = data.access.filter((a) => a.status === "requested");
  const stats =
    user.role === "buyer"
      ? [
          {
            label: "Your pipeline",
            value: pipeline.length,
            note: "Opportunities you’re exploring",
            Icon: BriefcaseBusiness,
          },
          {
            label: "Approved deal rooms",
            value: data.deals.filter((d) => d.has_access).length,
            note: "Confidential access granted",
            Icon: FolderLock,
          },
          {
            label: "Open tasks",
            value: open.length,
            note: "Your next steps",
            Icon: ListTodo,
          },
          {
            label: "LOIs submitted",
            value: data.offers.length,
            note: "Indicative offers",
            Icon: FileText,
          },
        ]
      : [
          {
            label: "Active mandates",
            value: pipeline.filter((d) => d.stage !== "Closed").length,
            note: "Across your deal workspace",
            Icon: BriefcaseBusiness,
          },
          {
            label: "Indicative deal value",
            value: money(
              pipeline
                .filter((d) => d.stage !== "Closed")
                .reduce((s, d) => s + d.asking_price, 0),
            ),
            note: "Total asking prices · CAD",
            Icon: Building2,
          },
          {
            label: "Buyer requests",
            value: pending.length,
            note: "Waiting for your review",
            Icon: Users,
          },
          {
            label: "Open tasks",
            value: open.length,
            note: "Keep your deals moving",
            Icon: ListTodo,
          },
        ];
  return (
    <>
      <Heading
        title={`Welcome back, ${user.name.split(" ")[0]}.`}
        description="Here’s where your next chapter stands."
        eyebrow="YOUR WORKSPACE, AT A GLANCE"
      >
        {canCreateMandates ? (
          <Link className="button button-green" href="/app/new">
            <Plus size={17} />
            New mandate
          </Link>
        ) : user.role === "buyer" ? (
          <Link className="button button-green" href="/app/opportunities">
            Explore opportunities
            <ArrowUpRight size={17} />
          </Link>
        ) : null}
      </Heading>
      <div className="stats-grid">
        {stats.map(({ label, value, note, Icon }) => (
          <div className="stat" key={label}>
            <div className="stat-label">
              {label}
              <Icon size={17} />
            </div>
            <div className="stat-value">{value}</div>
            <div className="stat-note">{note}</div>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <div className="dashboard-primary">
          <Panel title="Your transaction pipeline" link="/app/deals">
            <div className="pipeline-strip">
              {STAGES.map((stage) => (
                <div key={stage}>
                  <span>{stage}</span>
                  <strong>
                    {pipeline.filter((d) => d.stage === stage).length}
                  </strong>
                </div>
              ))}
            </div>
          </Panel>
          {user.role === "buyer" &&
            buyerOrganizationTypes.has(data.organization.organization_type) && (
              <Panel
                title="Acquisition projects"
                link="/app/projects"
                label="Open projects"
              >
                <div className="project-overview">
                  <div>
                    <strong>
                      {data.buyer_projects.length
                        ? `${data.buyer_projects.length} acquisition ${data.buyer_projects.length === 1 ? "project" : "projects"}`
                        : "Set your acquisition direction"}
                    </strong>
                    <p>
                      Keep each thesis, financial range, and preferred market
                      organized for future matching.
                    </p>
                  </div>
                  <Link
                    className="button button-quiet button-small"
                    href="/app/projects"
                  >
                    Manage criteria <ArrowRight size={15} />
                  </Link>
                </div>
              </Panel>
            )}
          <Panel
            title={
              user.role === "buyer"
                ? "Opportunities in motion"
                : "Mandates in motion"
            }
            link="/app/deals"
          >
            {pipeline.length ? (
              <DealTable deals={pipeline.slice(0, 5)} />
            ) : (
              <Empty
                title="Your first deal starts here"
                body={
                  user.role === "buyer"
                    ? "Explore opportunities and request access to start your pipeline."
                    : "Create a private mandate and bring your deal team together."
                }
                href={user.role === "buyer" ? "/app/opportunities" : "/app/new"}
                label={
                  user.role === "buyer"
                    ? "Explore opportunities"
                    : "Create a mandate"
                }
              />
            )}
          </Panel>
          <Panel title="Recent activity">
            <div className="panel-body">
              {data.activity.slice(0, 4).map((a) => (
                <div className="activity-item" key={a.id}>
                  <span className="activity-dot" />
                  <div>
                    <p>
                      <strong>{a.actor_name}</strong> · {a.action}
                    </p>
                    <small>
                      {a.deal_title} · {dateLabel(a.created_at)}
                    </small>
                  </div>
                </div>
              ))}
              {!data.activity.length && (
                <p className="muted">
                  Your transaction activity will appear here.
                </p>
              )}
            </div>
          </Panel>
        </div>
        <div className="space-y-6">
          <Panel title="Up next" link="/app/tasks">
            <div className="px-5">
              {open.slice(0, 5).map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
              {!open.length && (
                <Empty
                  title="You’re all caught up"
                  body="New diligence tasks will appear here."
                />
              )}
            </div>
          </Panel>
          <Panel
            title={
              user.role === "buyer"
                ? "Make your criteria count"
                : "Buyer requests"
            }
            link={user.role === "buyer" ? "/app/settings" : "/app/deals"}
            label={user.role === "buyer" ? "Edit criteria" : "Open mandates"}
          >
            <div className="panel-body">
              {user.role === "buyer" ? (
                <>
                  <SlidersHorizontal
                    size={24}
                    className="mb-3 text-emerald-800"
                  />
                  <p className="text-sm leading-relaxed text-slate-600">
                    Relevant opportunities start with clear criteria. Add your
                    industries, revenue range, and preferred province.
                  </p>
                </>
              ) : pending.length ? (
                pending.slice(0, 3).map((a) => (
                  <Link
                    key={a.id}
                    className="mb-4 flex items-center gap-3 last:mb-0"
                    href={`/app/deals/${a.deal_id}`}
                  >
                    <span className="avatar">{initials(a.name)}</span>
                    <div className="flex-1">
                      <strong className="block text-sm">{a.company}</strong>
                      <span className="muted">
                        {data.deals.find((d) => d.id === a.deal_id)?.title}
                      </span>
                    </div>
                    <ArrowUpRight size={16} />
                  </Link>
                ))
              ) : (
                <p className="muted">No requests waiting for review.</p>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
const projectRange = (minimum: number | null, maximum: number | null) => {
  if (minimum === null && maximum === null) return "Not specified";
  if (minimum === null) return `Up to ${money(maximum ?? 0)}`;
  if (maximum === null) return `From ${money(minimum)}`;
  return `${money(minimum)} – ${money(maximum)}`;
};
const projectMarginRange = (minimum: number | null, maximum: number | null) => {
  if (minimum === null && maximum === null) return "Not specified";
  if (minimum === null) return `Up to ${maximum}%`;
  if (maximum === null) return `From ${minimum}%`;
  return `${minimum}% – ${maximum}%`;
};
function ProjectForm({ project }: { project?: BuyerProject }) {
  const editing = Boolean(project);
  return (
    <MutationForm
      action={editing ? "updateBuyerProject" : "createBuyerProject"}
      extra={editing ? { buyer_project_id: project?.id } : {}}
      label={editing ? "Save project" : "Create project"}
      reset={!editing}
    >
      <div className="form-grid">
        <Field
          label="Project name"
          name="name"
          value={project?.name}
          help="Use a clear internal name for your acquisition thesis."
        />
        {editing && (
          <SelectField
            label="Project status"
            name="status"
            options={BUYER_PROJECT_STATUSES}
            value={project?.status}
          />
        )}
        <label className="full">
          Acquisition thesis
          <textarea
            name="thesis"
            defaultValue={project?.thesis}
            maxLength={5000}
            required
            placeholder="Describe the businesses, owners, and situations your firm is looking to acquire."
          />
          <span className="field-hint">
            This stays within your organization until you choose to share an
            opportunity later.
          </span>
        </label>
        <MultiSelectField
          label="Preferred sectors"
          name="sectors"
          options={SECTORS}
          values={project?.sectors}
          help="Select one or more. Hold Command or Control to select multiple."
        />
        <MultiSelectField
          label="Preferred provinces or territories"
          name="provinces"
          options={PROVINCES}
          values={project?.provinces}
          help="Leave blank when your mandate is Canada-wide."
        />
        <Field
          label="Keywords"
          name="keywords"
          required={false}
          value={project?.keywords.join(", ")}
          help="Separate keywords with commas; duplicates are removed."
        />
        <SelectField
          label="Ownership preference"
          name="ownership_preference"
          options={BUYER_PROJECT_OWNERSHIP_PREFERENCES}
          value={project?.ownership_preference || "flexible"}
        />
        <SelectField
          label="Transaction type"
          name="transaction_type"
          options={BUYER_PROJECT_TRANSACTION_TYPES}
          value={project?.transaction_type || "full_acquisition"}
        />
        <Field
          label="Minimum annual revenue (CAD)"
          name="min_revenue"
          type="number"
          required={false}
          min={0}
          value={project?.min_revenue ?? undefined}
        />
        <Field
          label="Maximum annual revenue (CAD)"
          name="max_revenue"
          type="number"
          required={false}
          min={0}
          value={project?.max_revenue ?? undefined}
        />
        <Field
          label="Minimum EBITDA (CAD)"
          name="min_ebitda"
          type="number"
          required={false}
          min={0}
          value={project?.min_ebitda ?? undefined}
        />
        <Field
          label="Maximum EBITDA (CAD)"
          name="max_ebitda"
          type="number"
          required={false}
          min={0}
          value={project?.max_ebitda ?? undefined}
        />
        <Field
          label="Minimum EBITDA margin (%)"
          name="min_ebitda_margin"
          type="number"
          required={false}
          min={0}
          max={100}
          value={project?.min_ebitda_margin ?? undefined}
        />
        <Field
          label="Maximum EBITDA margin (%)"
          name="max_ebitda_margin"
          type="number"
          required={false}
          min={0}
          max={100}
          value={project?.max_ebitda_margin ?? undefined}
        />
        <Field
          label="Minimum enterprise value (CAD)"
          name="min_enterprise_value"
          type="number"
          required={false}
          min={0}
          value={project?.min_enterprise_value ?? undefined}
        />
        <Field
          label="Maximum enterprise value (CAD)"
          name="max_enterprise_value"
          type="number"
          required={false}
          min={0}
          value={project?.max_enterprise_value ?? undefined}
        />
        <Field
          label="Minimum equity check (CAD)"
          name="min_equity_check"
          type="number"
          required={false}
          min={0}
          value={project?.min_equity_check ?? undefined}
        />
        <Field
          label="Maximum equity check (CAD)"
          name="max_equity_check"
          type="number"
          required={false}
          min={0}
          value={project?.max_equity_check ?? undefined}
        />
      </div>
    </MutationForm>
  );
}
function ProjectCard({ project }: { project: BuyerProject }) {
  const nextStatus = project.status === "active" ? "paused" : "active";
  const nextLabel =
    project.status === "active" ? "Pause project" : "Activate project";
  return (
    <article className="project-card">
      <div className="project-card-header">
        <div>
          <div className="project-card-title-row">
            <h2>{project.name}</h2>
            <Status value={project.status} />
          </div>
          <p className="muted">
            {projectTransactionLabel(project.transaction_type)} ·{" "}
            {projectOwnershipLabel(project.ownership_preference)}
          </p>
        </div>
        <span className="icon-tile" aria-hidden="true">
          <BriefcaseBusiness size={20} />
        </span>
      </div>
      <p className="project-thesis">
        {project.thesis || "No thesis added yet."}
      </p>
      <div className="project-criteria">
        <div>
          <span>Revenue</span>
          <strong>
            {projectRange(project.min_revenue, project.max_revenue)}
          </strong>
        </div>
        <div>
          <span>EBITDA</span>
          <strong>
            {projectRange(project.min_ebitda, project.max_ebitda)}
          </strong>
        </div>
        <div>
          <span>EBITDA margin</span>
          <strong>
            {projectMarginRange(
              project.min_ebitda_margin,
              project.max_ebitda_margin,
            )}
          </strong>
        </div>
        <div>
          <span>Enterprise value</span>
          <strong>
            {projectRange(
              project.min_enterprise_value,
              project.max_enterprise_value,
            )}
          </strong>
        </div>
        <div>
          <span>Equity check</span>
          <strong>
            {projectRange(project.min_equity_check, project.max_equity_check)}
          </strong>
        </div>
      </div>
      <dl className="project-filters">
        <div>
          <dt>Sectors</dt>
          <dd>
            {project.sectors.length ? project.sectors.join(", ") : "Any sector"}
          </dd>
        </div>
        <div>
          <dt>Provinces</dt>
          <dd>
            {project.provinces.length
              ? project.provinces.join(", ")
              : "Canada-wide"}
          </dd>
        </div>
        <div>
          <dt>Keywords</dt>
          <dd>
            {project.keywords.length
              ? project.keywords.join(", ")
              : "None added"}
          </dd>
        </div>
      </dl>
      {project.can_manage ? (
        <>
          <div className="project-actions">
            <MutationForm
              action="setBuyerProjectStatus"
              extra={{ buyer_project_id: project.id, status: nextStatus }}
              label={nextLabel}
            >
              <span className="sr-only">
                Change the status of {project.name}
              </span>
            </MutationForm>
            {project.status !== "archived" && (
              <MutationForm
                action="setBuyerProjectStatus"
                extra={{ buyer_project_id: project.id, status: "archived" }}
                label="Archive project"
              >
                <span className="sr-only">Archive {project.name}</span>
              </MutationForm>
            )}
          </div>
          <details className="disclosure project-editor">
            <summary>Edit project</summary>
            <div>
              <ProjectForm
                key={`${project.id}:${project.updated_at}`}
                project={project}
              />
            </div>
          </details>
        </>
      ) : (
        <p className="project-readonly">
          Read-only view. Ask an organization owner or administrator to update
          this project.
        </p>
      )}
    </article>
  );
}
function AcquisitionProjects() {
  const { data } = useWorkspace();
  const eligible = buyerOrganizationTypes.has(
    data.organization.organization_type,
  );
  if (!eligible)
    return (
      <>
        <Heading
          title="Acquisition projects"
          description="Buyer organizations use projects to organize acquisition mandates."
          eyebrow="BUYER WORKSPACE"
        />
        <div className="panel panel-body project-access-state">
          <ShieldCheck size={28} />
          <h2>Buyer organization required</h2>
          <p>
            This workspace is set up for owners and advisors. Switch to an
            eligible buyer organization to create or view acquisition projects.
          </p>
          <Link className="button button-quiet" href="/app/settings">
            View organization settings <ArrowRight size={16} />
          </Link>
        </div>
      </>
    );
  return (
    <>
      <Heading
        title="Acquisition projects"
        description="Keep each acquisition thesis and its search criteria in one private workspace. Matching will be introduced in a later phase."
        eyebrow="BUYER WORKSPACE"
      >
        {data.can_manage_buyer_projects && (
          <a className="button button-green" href="#new-project">
            <Plus size={17} /> New project
          </a>
        )}
      </Heading>
      {!data.can_manage_buyer_projects && (
        <div className="notice mb-6">
          You have read-only access to this organization. You can review its
          projects, but only an owner, administrator, or member can make
          changes.
        </div>
      )}
      {data.buyer_projects.length ? (
        <div className="project-grid">
          {data.buyer_projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      ) : (
        <div className="panel">
          <Empty
            title="No acquisition projects yet"
            body="Create a project to capture the size, sector, geography, and ownership profile your organization is pursuing."
            href={data.can_manage_buyer_projects ? "#new-project" : undefined}
            label="Create your first project"
          />
        </div>
      )}
      {data.can_manage_buyer_projects && (
        <section className="panel project-create-panel" id="new-project">
          <div className="panel-header">
            <div>
              <h2>New acquisition project</h2>
              <p className="muted">
                Start with a draft. You can refine the criteria before making it
                active for future matching.
              </p>
            </div>
          </div>
          <div className="panel-body">
            <ProjectForm />
          </div>
        </section>
      )}
    </>
  );
}
function DealTable({ deals }: { deals: Deal[] }) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Opportunity</th>
            <th>Revenue</th>
            <th>EBITDA</th>
            <th>Stage</th>
            <th>
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {deals.map((d) => (
            <tr key={d.id}>
              <td>
                <Link href={`/app/deals/${d.id}`} className="deal-cell">
                  <span className="icon-tile">
                    <Building2 size={18} />
                  </span>
                  <div>
                    <strong>{d.title}</strong>
                    <small>
                      {d.sector} · {d.province}
                    </small>
                  </div>
                </Link>
              </td>
              <td className="numeric">{money(d.revenue)}</td>
              <td className="numeric">{money(d.ebitda)}</td>
              <td>
                <Status value={d.stage} />
              </td>
              <td>
                <Link
                  href={`/app/deals/${d.id}`}
                  className="icon-button"
                  aria-label={`Open ${d.title}`}
                >
                  <ArrowUpRight size={17} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Opportunities() {
  const { data } = useWorkspace();
  const [q, setQ] = useState(""),
    [province, setProvince] = useState(""),
    [sector, setSector] = useState("");
  const deals = data.deals
    .filter(
      (d) =>
        d.published &&
        (!q ||
          `${d.title} ${d.description} ${d.sector}`
            .toLowerCase()
            .includes(q.toLowerCase())) &&
        (!province || d.province === province) &&
        (!sector || d.sector === sector),
    )
    .sort((a, b) => (b.match_score || 0) - (a.match_score || 0));
  return (
    <>
      <Heading
        title="Find your next opportunity."
        description={
          data.user.role === "buyer"
            ? "Confidential Canadian businesses, ranked against your acquisition criteria."
            : "Published teasers from your mandates. Buyer discovery is available in the buyer portal."
        }
        eyebrow="PRIVATE DEAL NETWORK"
      >
        <Link className="button button-quiet" href="/app/settings">
          <SlidersHorizontal size={16} />
          Acquisition criteria
        </Link>
      </Heading>
      <div className="filters">
        <label className="search-field">
          <span className="sr-only">Search opportunities</span>
          <Search size={17} />
          <input
            placeholder="Search by project or industry…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter by province"
          value={province}
          onChange={(e) => setProvince(e.target.value)}
        >
          <option value="">All provinces</option>
          {PROVINCES.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select
          aria-label="Filter by industry"
          value={sector}
          onChange={(e) => setSector(e.target.value)}
        >
          <option value="">All industries</option>
          {SECTORS.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </div>
      <p className="muted mb-5">
        {deals.length} {deals.length === 1 ? "opportunity" : "opportunities"} ·
        All financial figures in CAD
      </p>
      <div className="deal-grid">
        {deals.map((d) => (
          <Link className="deal-card" key={d.id} href={`/app/deals/${d.id}`}>
            <div className="deal-card-top">
              <span className="icon-tile">
                <Building2 size={23} />
              </span>
              {data.user.role === "buyer" ? (
                d.preview_only ? (
                  <span className="badge badge-amber">Preview only</span>
                ) : (
                  <span
                    className="badge badge-green"
                    title={d.match_reasons?.join(",")}
                  >
                    {d.match_score}% criteria fit
                  </span>
                )
              ) : (
                <Status value={d.stage} />
              )}
            </div>
            <h2>{d.title}</h2>
            <p className="muted flex items-center gap-1">
              <MapPin size={13} />
              {d.province} · {d.sector}
            </p>
            <p className="description">{d.description}</p>
            <div className="deal-card-metrics">
              <div>
                <span>Annual revenue</span>
                <strong>{money(d.revenue)}</strong>
              </div>
              <div>
                <span>EBITDA</span>
                <strong>{money(d.ebitda)}</strong>
              </div>
            </div>
            <div className="deal-card-footer">
              <span>
                {d.has_access
                  ? "Open deal room"
                  : d.preview_only
                    ? "Preview teaser"
                    : "View opportunity"}
              </span>
              <ArrowUpRight size={18} />
            </div>
          </Link>
        ))}
      </div>
      {!deals.length && (
        <Empty
          title="No opportunities match yet"
          body="Try another industry, province, or search term."
        />
      )}
    </>
  );
}
function Pipeline() {
  const { data } = useWorkspace();
  const [view, setView] = useState<"board" | "list">("list");
  const canCreateMandates =
    data.user.role !== "buyer" &&
    data.organization.membership_role !== "viewer";
  const deals = data.deals.filter(
    (d) =>
      d.can_manage ||
      (d.access_status !== "none" &&
        !["revoked", "denied"].includes(d.access_status || "")),
  );
  return (
    <>
      <Heading
        title={
          data.user.role === "buyer"
            ? "Your acquisition pipeline."
            : "Every mandate. One clear view."
        }
        description="From first conversation to the next milestone."
      >
        {canCreateMandates && (
          <Link className="button button-green" href="/app/new">
            <Plus size={17} />
            New mandate
          </Link>
        )}
      </Heading>
      <div className="mb-5 flex items-center justify-between">
        <span className="muted">{deals.length} active workspace records</span>
        <div className="view-toggle" aria-label="Pipeline view">
          <button
            className={cn(view === "list" && "selected")}
            onClick={() => setView("list")}
          >
            List
          </button>
          <button
            className={cn(view === "board" && "selected")}
            onClick={() => setView("board")}
          >
            Board
          </button>
        </div>
      </div>
      {!deals.length ? (
        <Empty
          title="Build your pipeline"
          body="Add a mandate or request access to an opportunity to get started."
          href={
            data.user.role === "buyer"
              ? "/app/opportunities"
              : canCreateMandates
                ? "/app/new"
                : undefined
          }
          label="Get started"
        />
      ) : view === "list" ? (
        <div className="panel">
          <DealTable deals={deals} />
        </div>
      ) : (
        <div className="board">
          {STAGES.map((stage) => (
            <section className="board-column" key={stage}>
              <h2>
                {stage}
                <span className="badge">
                  {deals.filter((d) => d.stage === stage).length}
                </span>
              </h2>
              {deals
                .filter((d) => d.stage === stage)
                .map((d) => (
                  <Link
                    key={d.id}
                    className="board-card"
                    href={`/app/deals/${d.id}`}
                  >
                    <strong>{d.title}</strong>
                    <p>
                      {d.sector} · {d.province}
                    </p>
                    <span>{money(d.revenue)} revenue</span>
                  </Link>
                ))}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
function NewDeal({ onCreated }: { onCreated: (id: string) => void }) {
  const { data } = useWorkspace();
  if (data.user.role === "buyer")
    return (
      <Empty
        title="Explore acquisition opportunities"
        body="Owners and advisors create mandates. Your buyer account can discover and request access to them."
        href="/app/opportunities"
      />
    );
  if (data.organization.membership_role === "viewer")
    return (
      <Empty
        title="Read-only firm access"
        body="Your firm role lets you review mandates but not create them. Ask a firm owner or administrator if you need editing access."
        href="/app/deals"
        label="Return to mandates"
      />
    );
  return (
    <>
      <Heading
        title="Create a private mandate."
        description="Start with the essentials. Your teaser stays private until you publish it."
      />
      <Panel title="Business profile">
        <div className="panel-body">
          <MutationForm
            action="createDeal"
            label="Create private mandate"
            onSuccess={(r) => r.id && onCreated(r.id)}
          >
            <div className="form-grid">
              <Field
                label="Project name (shown in teaser)"
                name="title"
                help="Use a code name, e.g. Project Cedar."
              />
              <Field
                label="Legal company name (confidential)"
                name="company_name"
              />
              <SelectField
                label="Industry"
                name="sector"
                options={SECTORS}
                value={SECTORS[0]}
              />
              <SelectField
                label="Province or territory"
                name="province"
                options={PROVINCES}
                value="Ontario"
              />
              <Field label="City (confidential)" name="city" />
              <Field
                label="Year founded"
                name="founded"
                type="number"
                value={2010}
                min={1800}
                max={new Date().getFullYear()}
              />
              <Field
                label="Annual revenue (CAD)"
                name="revenue"
                type="number"
                min={0}
              />
              <Field label="EBITDA (CAD)" name="ebitda" type="number" min={0} />
              <Field
                label="Indicative asking price (CAD)"
                name="asking_price"
                type="number"
                min={0}
              />
              <Field
                label="Employees (confidential)"
                name="employees"
                type="number"
                min={0}
              />
              <label className="full">
                Anonymous teaser
                <textarea
                  name="description"
                  minLength={30}
                  maxLength={1200}
                  required
                  placeholder="Describe the opportunity without identifying the company, its customers, or its employees."
                />
                <span className="field-hint">
                  Visible to signed-in buyers once published. Financial figures
                  and province will also be visible.
                </span>
              </label>
              <label className="full">
                Confidential business summary
                <textarea
                  name="confidential_summary"
                  maxLength={5000}
                  placeholder="Details available only to the deal team and approved buyers."
                />
              </label>
            </div>
            {data.user.role === "advisor" && (
              <p className="notice">
                Only create mandates you are authorized to represent. After
                creating the mandate, you can connect its registered business
                owner from the Overview tab.
              </p>
            )}
          </MutationForm>
        </div>
      </Panel>
    </>
  );
}

function BuyerNextStep({
  deal,
  access,
  onOpenDataRoom,
}: {
  deal: Deal;
  access?: Access;
  onOpenDataRoom: () => void;
}) {
  let content: ReactNode;
  if (!access) {
    content = deal.preview_only ? (
      <>
        <span className="badge badge-amber">Preview only</span>
        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          This shared preview account can view published teasers but cannot
          contact active deal teams. Create or sign in with your own buyer
          account to request confidential access.
        </p>
        <Link
          href="/register?role=buyer"
          className="button button-green mt-5 w-full"
        >
          Create a buyer account
          <ArrowRight size={16} />
        </Link>
      </>
    ) : (
      <MutationForm
        action="requestAccess"
        extra={{ deal_id: deal.id }}
        label="Request confidential access"
      >
        <p className="muted">Introduce yourself to the deal team.</p>
        <label>
          Your interest
          <textarea
            name="notes"
            maxLength={2000}
            placeholder="Tell the owner or advisor why this opportunity fits."
          />
        </label>
      </MutationForm>
    );
  } else {
    content = (
      <>
        <Status value={access.status} />
        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          {access.status === "approved"
            ? "You have access to the documents shared with your team. Review the data room and coordinate your next steps."
            : access.status === "nda_pending"
              ? "The deal team has invited you to exchange an NDA. Upload your externally executed agreement in the data room for their review."
              : access.status === "requested"
                ? "Your request is with the deal team. You can introduce yourself in Messages while they review it."
                : "The deal team has restricted your access to this opportunity."}
        </p>
        {access.status === "approved" && (
          <button
            className="button button-green mt-5 w-full"
            onClick={onOpenDataRoom}
          >
            Open data room
            <ArrowRight size={16} />
          </button>
        )}
      </>
    );
  }
  return (
    <Panel title="Your next step">
      <div className="panel-body">{content}</div>
    </Panel>
  );
}

function DealDetail({ deal }: { deal: Deal }) {
  const { data, act, busy } = useWorkspace();
  const [tab, setTab] = useState("Overview");
  const access = data.access.filter((a) => a.deal_id === deal.id);
  const myAccess = access.find((a) => a.buyer_id === data.user.id);
  const tabs = deal.has_access
    ? [
        "Overview",
        "Data room",
        "Messages",
        "Tasks",
        "LOIs",
        ...(deal.can_manage ? ["Buyer access"] : []),
      ]
    : [
        "Overview",
        ...(myAccess && !["revoked", "denied"].includes(myAccess.status)
          ? ["Data room", "Messages"]
          : []),
      ];
  return (
    <>
      <Link
        className="mb-5 inline-block text-sm text-slate-500"
        href="/app/deals"
      >
        ← Back to {data.user.role === "buyer" ? "pipeline" : "mandates"}
      </Link>
      <Heading
        title={deal.title}
        description={`${deal.sector} · ${deal.province}`}
        eyebrow={
          deal.has_access ? deal.company_name : "CONFIDENTIAL OPPORTUNITY"
        }
      >
        <div className="flex items-center gap-2">
          <Status value={deal.stage} />
          {!deal.published && (
            <span className="badge">
              <LockKeyhole size={12} />
              Private teaser
            </span>
          )}
        </div>
      </Heading>
      <div className="tabs" role="group" aria-label="Deal sections">
        {tabs.map((t) => (
          <button
            className={cn(t === tab && "selected")}
            key={t}
            aria-pressed={t === tab}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Overview" ? (
        <div className="detail-grid">
          <div className="detail-main">
            <Panel title="The opportunity">
              <div className="panel-body">
                <p className="mb-6 leading-relaxed text-slate-600">
                  {deal.description}
                </p>
                <dl className="detail-metrics">
                  {[
                    ["Annual revenue", money(deal.revenue, false)],
                    ["EBITDA", money(deal.ebitda, false)],
                    [
                      "Indicative asking price",
                      money(deal.asking_price, false),
                    ],
                    [
                      "EBITDA margin",
                      deal.revenue
                        ? `${Math.round((deal.ebitda / deal.revenue) * 100)}%`
                        : "—",
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </Panel>
            {deal.has_access ? (
              <Panel title="Behind the business">
                <div className="panel-body">
                  <p className="mb-5 whitespace-pre-wrap leading-relaxed text-slate-600">
                    {deal.confidential_summary ||
                      "No additional summary has been added."}
                  </p>
                  <dl className="detail-metrics">
                    <div>
                      <dt>Location</dt>
                      <dd>{deal.city}</dd>
                    </div>
                    <div>
                      <dt>Year founded</dt>
                      <dd>{deal.founded}</dd>
                    </div>
                    <div>
                      <dt>Employees</dt>
                      <dd>{deal.employees}</dd>
                    </div>
                    <div>
                      <dt>Currency</dt>
                      <dd>CAD</dd>
                    </div>
                  </dl>
                </div>
              </Panel>
            ) : (
              <Panel title="Confidential details">
                <div className="panel-body">
                  <LockKeyhole className="mb-3 text-emerald-800" size={25} />
                  <p className="text-sm leading-relaxed text-slate-600">
                    The company’s identity and confidential documents are
                    available after the deal team reviews your request and
                    verifies an externally signed NDA.
                  </p>
                </div>
              </Panel>
            )}
          </div>
          <aside className="detail-sidebar">
            {deal.can_manage ? (
              <>
                <Panel title="Manage this mandate">
                  <div className="panel-body">
                    <MutationForm
                      action="updateDeal"
                      extra={{ deal_id: deal.id }}
                    >
                      <SelectField
                        name="stage"
                        label="Transaction stage"
                        options={STAGES}
                        value={deal.stage}
                      />
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          name="published"
                          defaultChecked={!!deal.published}
                        />
                        Publish the anonymous teaser to signed-in buyers
                      </label>
                      <p className="field-hint">
                        Review the teaser carefully for identifying information
                        before publishing.
                      </p>
                    </MutationForm>
                  </div>
                </Panel>
                <Panel title="Deal team">
                  <div className="panel-body">
                    <p className="muted mb-4">
                      Authorized members of the owner and advisor firms can
                      manage documents, buyer access, and transaction activity.
                    </p>
                    {deal.can_manage_owner_side ? (
                      <MutationForm
                        action="appointAdvisor"
                        extra={{ deal_id: deal.id }}
                        label="Appoint advisor"
                      >
                        <label>
                          Advisor
                          <select
                            name="advisor_id"
                            defaultValue={deal.advisor_id || ""}
                            required
                          >
                            <option value="">Select advisor</option>
                            {data.advisors.map((a) => (
                              <option value={a.id} key={a.id}>
                                {a.name} · {a.company}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="checkbox-label">
                          <input type="checkbox" required />I authorize this
                          advisor to access and manage this mandate.
                        </label>
                      </MutationForm>
                    ) : (
                      <p className="muted">
                        You have deal-team access through your organization.
                      </p>
                    )}
                  </div>
                </Panel>
              </>
            ) : data.user.role === "buyer" ? (
              <BuyerNextStep
                deal={deal}
                access={myAccess}
                onOpenDataRoom={() => setTab("Data room")}
              />
            ) : (
              <Panel title="Read-only deal access">
                <div className="panel-body">
                  <p className="muted">
                    You can review this mandate through your firm. A firm owner,
                    administrator, or member must make changes.
                  </p>
                </div>
              </Panel>
            )}{" "}
            {data.user.role === "buyer" && (
              <Panel title="Why this could fit">
                <div className="panel-body">
                  <strong className="text-2xl tabular-nums text-emerald-800">
                    {deal.match_score}%
                  </strong>
                  <p className="muted mb-4">Rules-based criteria match</p>
                  {deal.match_reasons?.map((r) => (
                    <p className="my-2 flex items-center gap-2 text-sm" key={r}>
                      <Check size={15} className="text-emerald-700" />
                      {r}
                    </p>
                  ))}
                  <Link
                    href="/app/settings"
                    className="mt-4 inline-block text-sm text-emerald-800 underline"
                  >
                    Edit your criteria
                  </Link>
                </div>
              </Panel>
            )}
          </aside>
        </div>
      ) : tab === "Data room" ? (
        <>
          <DocumentTable
            documents={data.documents.filter((d) => d.deal_id === deal.id)}
          />
          {(deal.can_manage ||
            (data.user.role === "buyer" &&
              (deal.has_access || myAccess?.status === "nda_pending"))) && (
            <UploadForm deal={deal} />
          )}
        </>
      ) : tab === "Messages" ? (
        <ConversationArea dealId={deal.id} />
      ) : tab === "Tasks" ? (
        <>
          <Panel title="Diligence checklist">
            <div className="px-5">
              {data.tasks
                .filter((t) => t.deal_id === deal.id)
                .map((t) => (
                  <TaskRow task={t} key={t.id} />
                ))}
              {!data.tasks.some((t) => t.deal_id === deal.id) && (
                <Empty
                  title="No tasks yet"
                  body="Shared diligence requests and deadlines will appear here."
                />
              )}
            </div>
          </Panel>
          {deal.can_manage && <TaskForm deal={deal} />}
        </>
      ) : tab === "LOIs" ? (
        <Offers deal={deal} />
      ) : (
        <BuyerAccess deal={deal} />
      )}
      {tab === "Overview" &&
        deal.can_manage &&
        data.user.role === "advisor" &&
        deal.owner_id === data.user.id &&
        deal.advisor_id === data.user.id && (
          <details className="disclosure">
            <summary>Connect the business owner</summary>
            <div>
              <MutationForm
                action="connectOwner"
                extra={{ deal_id: deal.id }}
                label="Connect owner"
              >
                <Field label="Owner account email" name="email" type="email" />
                <p className="muted">
                  Ask the owner to register first. Connecting them gives them
                  control of the mandate while retaining you as its advisor.
                </p>
                <label className="checkbox-label">
                  <input type="checkbox" name="confirm_authority" required />I
                  am authorized to share this mandate with the named owner and
                  give them control.
                </label>
              </MutationForm>
            </div>
          </details>
        )}
    </>
  );
}

function DocumentTable({ documents }: { documents: Document[] }) {
  return (
    <div className="panel">
      {documents.length ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Category</th>
                <th>Visibility</th>
                <th>Added</th>
                <th>
                  <span className="sr-only">Download</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d.id}>
                  <td>
                    <div className="document-name">
                      <FileText size={21} />
                      <div>
                        <span title={d.name}>{d.name}</span>
                        <small>
                          {d.deal_title} · v{d.version} ·{" "}
                          {d.size < 1024
                            ? `${d.size} B`
                            : `${Math.round(d.size / 1024)} KB`}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="badge">{d.category}</span>
                  </td>
                  <td className="text-slate-500">
                    {d.audience === "team"
                      ? "Deal team only"
                      : d.audience === "buyer"
                        ? "Specific buyer"
                        : "Approved buyers"}
                  </td>
                  <td className="whitespace-nowrap text-slate-500">
                    {dateLabel(d.created_at)}
                  </td>
                  <td>
                    <a
                      href={`/api/documents/${d.id}`}
                      className="icon-button"
                      aria-label={`Download ${d.name}`}
                    >
                      <Download size={17} />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="A place for every document"
          body="Documents shared with your account will appear here. Open an approved deal room to upload files."
        />
      )}
    </div>
  );
}
function UploadForm({ deal }: { deal: Deal }) {
  const { data, refresh, notify } = useWorkspace();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const buyers = data.access.filter(
    (a) => a.deal_id === deal.id && !["denied", "revoked"].includes(a.status),
  );
  return (
    <details className="disclosure">
      <summary>
        <Upload size={16} className="mr-2 inline" />
        Upload a document
      </summary>
      <div>
        <form
          className="inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const form = e.currentTarget;
            try {
              const body = new FormData(form);
              body.set("deal_id", deal.id);
              const response = await fetch("/api/documents", {
                method: "POST",
                body,
              });
              const json = await response.json();
              if (!response.ok) throw new Error(json.error);
              await refresh();
              notify(json.message);
              form.reset();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Upload failed.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="form-grid">
            <label className="full">
              Choose file
              <input
                name="file"
                type="file"
                accept=".pdf,.docx,.xlsx,.csv,.txt"
                required
              />
              <span className="field-hint">
                PDF, DOCX, XLSX, CSV or TXT · Up to 10 MB. Uploading the same
                name and visibility creates a new version.
              </span>
            </label>
            <SelectField
              label="Category"
              name="category"
              options={
                deal.has_access
                  ? [
                      "Financials",
                      "Company overview",
                      "NDA",
                      "LOI",
                      "Legal",
                      "Other",
                    ]
                  : ["NDA"]
              }
              value={deal.has_access ? "Financials" : "NDA"}
            />
            {deal.can_manage && (
              <>
                <label>
                  Visibility
                  <select name="audience" defaultValue="team">
                    <option value="team">Internal deal team only</option>
                    <option value="approved">All approved buyers</option>
                    <option value="buyer">One specific buyer</option>
                  </select>
                </label>
                <label>
                  Buyer (required for NDA or LOI)
                  <select name="buyer_id" defaultValue="">
                    <option value="">Select a buyer</option>
                    {buyers.map((a) => (
                      <option key={a.id} value={a.buyer_id}>
                        {a.company}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>
          <p className="field-hint">
            NDAs and LOIs are always restricted to the selected buyer and the
            deal team. Buyer uploads are never shared with other buyers.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button button-green" disabled={busy}>
            {busy ? "Uploading…" : "Upload document"}
            <Upload size={16} />
          </button>
        </form>
      </div>
    </details>
  );
}
function DocumentsPage() {
  const { data } = useWorkspace();
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("");
  const documents = data.documents.filter(
    (d) =>
      (!query ||
        `${d.name} ${d.deal_title}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (!category || d.category === category),
  );
  return (
    <>
      <Heading
        title="Your deal library."
        description="Every shared document, organized and permissioned by transaction."
      />
      <div className="filters">
        <label className="search-field">
          <span className="sr-only">Search documents</span>
          <Search size={17} />
          <input
            placeholder="Search documents or projects…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Document category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All categories</option>
          {[
            "Financials",
            "Company overview",
            "NDA",
            "LOI",
            "Legal",
            "Other",
          ].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <DocumentTable documents={documents} />
      <p className="muted mt-5">
        To upload a document, open its deal room and select Data room.
      </p>
    </>
  );
}

function BuyerAccess({ deal }: { deal: Deal }) {
  const { data, act, busy } = useWorkspace();
  const entries = data.access.filter((a) => a.deal_id === deal.id);
  if (!deal.can_manage) return null;
  return (
    <>
      <Panel title="Buyer access & NDA review">
        {entries.map((a) => (
          <AccessCard key={a.id} access={a} deal={deal} />
        ))}
        {!entries.length && (
          <Empty
            title="Bring buyers into the process"
            body="Publish your teaser to receive requests, or invite an existing buyer below."
          />
        )}
      </Panel>
      <details className="disclosure">
        <summary>Invite an existing buyer</summary>
        <div>
          <MutationForm
            action="inviteBuyer"
            extra={{ deal_id: deal.id }}
            label="Invite buyer"
            reset
          >
            <Field label="Buyer account email" name="email" type="email" />
            <p className="field-hint">
              The buyer must already have a Succera account. They’ll see the
              invitation in their pipeline. Email notifications are not
              connected.
            </p>
          </MutationForm>
        </div>
      </details>
    </>
  );
}
function AccessCard({ access: a, deal }: { access: Access; deal: Deal }) {
  const { data, act, busy } = useWorkspace();
  const docs = data.documents.filter(
    (d) =>
      d.deal_id === deal.id &&
      d.category === "NDA" &&
      d.buyer_id === a.buyer_id,
  );
  return (
    <article className="access-card">
      <div className="access-card-heading">
        <div>
          <h3>{a.company}</h3>
          <p>
            {a.name} · {a.email}
          </p>
        </div>
        <Status value={a.status} />
      </div>
      {a.notes && <p className="muted mb-4">{a.notes}</p>}
      {a.status === "requested" && (
        <div className="inline-buttons">
          <button
            className="button button-green button-small"
            disabled={busy}
            onClick={() =>
              void act("reviewAccess", {
                deal_id: deal.id,
                buyer_id: a.buyer_id,
                status: "nda_pending",
              })
            }
          >
            Proceed to NDA
          </button>
          <button
            className="button button-quiet button-small"
            disabled={busy}
            onClick={() =>
              void act("reviewAccess", {
                deal_id: deal.id,
                buyer_id: a.buyer_id,
                status: "denied",
              })
            }
          >
            Decline request
          </button>
        </div>
      )}
      {a.status === "nda_pending" && (
        <div>
          <p className="muted mb-4">
            Exchange and sign the NDA outside Succera, then upload the executed
            copy with this buyer selected.
          </p>
          {docs.length ? (
            <MutationForm
              action="reviewAccess"
              extra={{
                deal_id: deal.id,
                buyer_id: a.buyer_id,
                status: "approved",
              }}
              label="Verify NDA & grant access"
            >
              <label>
                Executed NDA document
                <select name="nda_document_id" required>
                  {docs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} · v{d.version}
                    </option>
                  ))}
                </select>
              </label>
              <label className="checkbox-label">
                <input name="confirm_reviewed" type="checkbox" required />I
                reviewed this document and confirm the required parties have
                signed it externally.
              </label>
            </MutationForm>
          ) : (
            <p className="notice">
              No NDA document uploaded for this buyer yet. Add it in the Data
              room tab.
            </p>
          )}
        </div>
      )}
      {a.status === "approved" && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-slate-500">
            Manage access
          </summary>
          <div className="mt-3">
            <p className="muted mb-3">
              Revocation blocks future document access. Previously downloaded
              copies cannot be recalled.
            </p>
            <MutationForm
              action="reviewAccess"
              extra={{
                deal_id: deal.id,
                buyer_id: a.buyer_id,
                status: "revoked",
              }}
              label="Revoke portal access"
            >
              <label className="checkbox-label">
                <input type="checkbox" required />
                Revoke this buyer’s confidential access
              </label>
            </MutationForm>
          </div>
        </details>
      )}
      {["revoked", "denied"].includes(a.status) && (
        <button
          className="button button-quiet button-small"
          disabled={busy}
          onClick={() =>
            void act("reviewAccess", {
              deal_id: deal.id,
              buyer_id: a.buyer_id,
              status: "nda_pending",
            })
          }
        >
          Reopen NDA review
        </button>
      )}
    </article>
  );
}

function TaskRow({ task }: { task: Task }) {
  const { data, act, busy } = useWorkspace();
  const deal = data.deals.find((candidate) => candidate.id === task.deal_id);
  const canToggle =
    !!deal &&
    (deal.can_manage ||
      (data.user.role === "buyer" &&
        deal.has_access &&
        task.buyer_id === data.user.id));
  return (
    <div className="task-row">
      <button
        disabled={busy || !canToggle}
        aria-label={`${task.status === "done" ? "Reopen" : "Complete"} ${task.title}`}
        aria-pressed={task.status === "done"}
        className={cn(task.status === "done" && "checked")}
        onClick={() =>
          void act("toggleTask", { deal_id: task.deal_id, task_id: task.id })
        }
      >
        {task.status === "done" && <Check size={13} />}
      </button>
      <div>
        <strong
          className={cn(
            task.status === "done" && "text-slate-400 line-through",
          )}
        >
          {task.title}
        </strong>
        <small>
          <Link className="hover:underline" href={`/app/deals/${task.deal_id}`}>
            {task.deal_title}
          </Link>{" "}
          · Due {dateLabel(task.due_date)} ·{" "}
          {task.buyer_id ? "Shared with buyer" : "Internal"}
        </small>
      </div>
    </div>
  );
}
function TaskForm({ deal }: { deal: Deal }) {
  const { data } = useWorkspace();
  return (
    <details className="disclosure">
      <summary>Add a diligence task</summary>
      <div>
        <MutationForm
          action="createTask"
          extra={{ deal_id: deal.id }}
          label="Add task"
          reset
        >
          <Field label="Task" name="title" />
          <div className="form-grid">
            <Field label="Due date" name="due_date" type="date" />
            <label>
              Share with
              <select name="buyer_id" defaultValue="">
                <option value="">Internal deal team only</option>
                {data.access
                  .filter(
                    (a) => a.deal_id === deal.id && a.status === "approved",
                  )
                  .map((a) => (
                    <option key={a.id} value={a.buyer_id}>
                      {a.company}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        </MutationForm>
      </div>
    </details>
  );
}
function TasksPage() {
  const { data } = useWorkspace();
  const [filter, setFilter] = useState("open");
  const tasks = data.tasks.filter(
    (t) => filter === "all" || t.status === filter,
  );
  return (
    <>
      <Heading
        title="The next steps, in focus."
        description="Keep diligence moving with a clear owner, deadline, and status."
      />
      <div className="mb-5 view-toggle">
        {["open", "done", "all"].map((f) => (
          <button
            className={cn(filter === f && "selected")}
            key={f}
            onClick={() => setFilter(f)}
          >
            {statusText(f)}
          </button>
        ))}
      </div>
      <Panel
        title={`${tasks.length} ${filter === "all" ? "total" : filter} tasks`}
      >
        <div className="px-5">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
          {!tasks.length && (
            <Empty
              title="Nothing outstanding here"
              body="Create and manage diligence tasks from the Tasks tab in a deal room."
              href="/app/deals"
              label="Open your pipeline"
            />
          )}
        </div>
      </Panel>
    </>
  );
}

function MessagesPage() {
  return (
    <>
      <Heading
        title="Keep the conversation together."
        description="Private threads between each buyer and the seller’s deal team."
      />
      <ConversationArea />
    </>
  );
}
function ConversationArea({ dealId }: { dealId?: string }) {
  const { data } = useWorkspace();
  const access = data.access.filter(
    (a) =>
      (!dealId || a.deal_id === dealId) &&
      !["denied", "revoked"].includes(a.status),
  );
  const [selected, setSelected] = useState(access[0]?.id || "");
  const thread = access.find((a) => a.id === selected) || access[0];
  if (!thread)
    return (
      <Empty
        title="Start a deal conversation"
        body="Request access to an opportunity, or invite a buyer to create a private conversation."
        href="/app/deals"
        label="Open your pipeline"
      />
    );
  const messages = data.messages.filter(
    (m) => m.deal_id === thread.deal_id && m.buyer_id === thread.buyer_id,
  );
  const deal = data.deals.find((d) => d.id === thread.deal_id);
  const title = deal?.title;
  const canMessage =
    !!deal &&
    (deal.can_manage ||
      (data.user.role === "buyer" && thread.buyer_id === data.user.id));
  return (
    <div className="message-layout">
      <div className="thread-list">
        {access.map((a) => (
          <button
            key={a.id}
            className={cn(thread.id === a.id && "selected")}
            onClick={() => setSelected(a.id)}
          >
            <strong>{data.deals.find((d) => d.id === a.deal_id)?.title}</strong>
            <span>{a.company} · Private thread</span>
          </button>
        ))}
      </div>
      <section className="conversation">
        <div className="panel-header">
          <div>
            <h2>{title}</h2>
            <p className="muted">{thread.company} + seller’s deal team</p>
          </div>
          <LockKeyhole size={17} className="text-slate-400" />
        </div>
        <div className="message-list">
          {messages.map((m) => (
            <div
              className={cn("message", m.sender_id === data.user.id && "own")}
              key={m.id}
            >
              <small>
                {m.sender_name} · {dateLabel(m.created_at)}
              </small>
              <p>{m.body}</p>
            </div>
          ))}
          {!messages.length && (
            <p className="muted">
              No messages yet. Make the first introduction.
            </p>
          )}
        </div>
        {canMessage ? (
          <div className="message-composer">
            <MutationForm
              key={thread.id}
              action="message"
              extra={{ deal_id: thread.deal_id, buyer_id: thread.buyer_id }}
              label="Send message"
              reset
            >
              <label>
                <span className="sr-only">Your message</span>
                <textarea
                  name="body"
                  required
                  maxLength={5000}
                  placeholder="Write to this deal team…"
                />
              </label>
            </MutationForm>
          </div>
        ) : (
          <p className="notice mx-5 mb-5">
            Your firm role provides read-only access to this conversation.
          </p>
        )}
      </section>
    </div>
  );
}

function Offers({ deal }: { deal: Deal }) {
  const { data, act, busy } = useWorkspace();
  const offers = data.offers.filter((o) => o.deal_id === deal.id);
  const documents = data.documents.filter(
    (d) =>
      d.deal_id === deal.id &&
      d.category === "LOI" &&
      d.uploaded_by === data.user.id,
  );
  return (
    <>
      <Panel title="Letters of intent">
        {offers.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Buyer</th>
                  <th>Indicative value</th>
                  <th>Structure</th>
                  <th>Status</th>
                  <th>Document</th>
                </tr>
              </thead>
              <tbody>
                {offers.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <strong>{o.buyer_name}</strong>
                      <p className="muted mt-1 max-w-xs">{o.notes}</p>
                    </td>
                    <td className="numeric">{money(o.amount, false)}</td>
                    <td>{o.structure}</td>
                    <td>
                      {deal.can_manage ? (
                        <select
                          aria-label={`Review status for ${o.buyer_name}`}
                          value={o.status}
                          disabled={busy}
                          onChange={(e) =>
                            void act("reviewOffer", {
                              deal_id: deal.id,
                              offer_id: o.id,
                              status: e.target.value,
                            })
                          }
                        >
                          <option disabled>Submitted</option>
                          <option>Under review</option>
                          <option>Shortlisted</option>
                          <option>Not proceeding</option>
                        </select>
                      ) : (
                        <Status value={o.status} />
                      )}
                    </td>
                    <td>
                      <a
                        href={`/api/documents/${o.document_id}`}
                        className="icon-button"
                        aria-label={`Download ${o.buyer_name} LOI`}
                      >
                        <Download size={17} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Offers will appear here"
            body="Buyers with approved access can upload an LOI and submit its key terms for review."
          />
        )}
      </Panel>
      <p className="muted mt-4">
        Review statuses organize the process. They do not execute, countersign,
        or legally accept an offer.
      </p>
      {data.user.role === "buyer" && (
        <details className="disclosure">
          <summary>Submit a letter of intent</summary>
          <div>
            {documents.length ? (
              <MutationForm
                action="submitOffer"
                extra={{ deal_id: deal.id }}
                label="Submit indicative LOI"
                reset
              >
                <div className="form-grid">
                  <Field
                    label="Indicative purchase price (CAD)"
                    name="amount"
                    type="number"
                    min={1}
                  />
                  <SelectField
                    label="Transaction structure"
                    name="structure"
                    options={[
                      "Share purchase",
                      "Asset purchase",
                      "To be negotiated",
                    ]}
                    value="Share purchase"
                  />
                </div>
                <label>
                  LOI document
                  <select name="document_id" required>
                    {documents.map((d) => (
                      <option value={d.id} key={d.id}>
                        {d.name} · v{d.version}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Key terms and conditions
                  <textarea name="notes" maxLength={5000} />
                </label>
              </MutationForm>
            ) : (
              <p className="notice">
                Upload your LOI under the Data room tab first, using the LOI
                category.
              </p>
            )}
          </div>
        </details>
      )}
    </>
  );
}
function Network() {
  const { data } = useWorkspace();
  const [query, setQuery] = useState("");
  const advisors = data.advisors.filter((a) =>
    `${a.name} ${a.company} ${a.province}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <>
      <Heading
        title="Find your transaction partner."
        description="Discover advisors on Succera. Profiles are self-reported, not independently verified."
      />
      <div className="filters">
        <label className="search-field">
          <span className="sr-only">Search advisors</span>
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by advisor, firm, or province…"
          />
        </label>
      </div>
      <div className="member-grid">
        {advisors.map((a) => (
          <article className="member-card" key={a.id}>
            <div className="avatar">{initials(a.name)}</div>
            <h2>{a.name}</h2>
            <small>{a.company}</small>
            <p className="flex items-center gap-1">
              <MapPin size={14} />
              {a.province || "Canada"}
            </p>
            <p>{a.bio || "This advisor has not added an introduction yet."}</p>
            {data.user.role !== "buyer" && (
              <Link className="button button-quiet mt-5" href="/app/deals">
                Appoint from a mandate <ArrowUpRight size={15} />
              </Link>
            )}
          </article>
        ))}
      </div>
      {!advisors.length && (
        <Empty
          title="No advisors found"
          body="Try a different name, firm, or province."
        />
      )}
    </>
  );
}
function SettingsPage() {
  const { data } = useWorkspace(),
    { user, organization } = data;
  return (
    <>
      <Heading
        title="Make the workspace yours."
        description="Manage your personal profile, firm details, and acquisition criteria."
      />
      <div className="settings-grid">
        <div className="settings-main">
          <Panel title="Personal profile & acquisition criteria">
            <div className="panel-body">
              <MutationForm action="profile">
                <div className="form-grid">
                  <Field label="Full name" name="name" value={user.name} />
                  <SelectField
                    label="Preferred province"
                    name="province"
                    options={PROVINCES}
                    value={user.province}
                    empty="All provinces and territories"
                  />
                  <label className="full">
                    Email address
                    <input value={user.email} disabled />
                    <span className="field-hint">
                      Contact your administrator to change your account email.
                    </span>
                  </label>
                  <label className="full">
                    Introduction
                    <textarea
                      name="bio"
                      maxLength={2000}
                      defaultValue={user.bio}
                    />
                  </label>
                  <label className="full">
                    Target industries
                    <select name="sectors" defaultValue={user.sectors}>
                      <option value="">All industries</option>
                      {SECTORS.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                      {user.sectors.includes(",") && (
                        <option value={user.sectors}>
                          {user.sectors.replaceAll(",", ", ")}
                        </option>
                      )}
                    </select>
                  </label>
                  <Field
                    label="Minimum annual revenue (CAD)"
                    name="min_revenue"
                    type="number"
                    min={0}
                    value={user.min_revenue}
                  />
                  <Field
                    label="Maximum annual revenue (CAD)"
                    name="max_revenue"
                    type="number"
                    min={0}
                    value={user.max_revenue}
                  />
                </div>
              </MutationForm>
            </div>
          </Panel>
          <Panel title="Firm profile">
            <div className="panel-body">
              {organization.can_manage ? (
                <MutationForm action="organization" label="Save firm profile">
                  <div className="form-grid">
                    <Field
                      label="Organization name"
                      name="name"
                      value={organization.name}
                    />
                    <label>
                      Organization type
                      <select
                        name="organization_type"
                        defaultValue={organization.organization_type}
                        required
                      >
                        {Object.entries(ORGANIZATION_TYPE_LABELS).map(
                          ([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <Field
                      label="Website"
                      name="website"
                      type="url"
                      value={organization.website}
                      required={false}
                      help="Optional · include https://"
                    />
                    <SelectField
                      label="Head office province"
                      name="province"
                      options={PROVINCES}
                      value={organization.province}
                      empty="Not specified"
                    />
                    <label className="full">
                      Firm description
                      <textarea
                        name="description"
                        maxLength={2000}
                        defaultValue={organization.description}
                      />
                    </label>
                  </div>
                </MutationForm>
              ) : (
                <div className="firm-details">
                  <div>
                    <span>Organization</span>
                    <strong>{organization.name}</strong>
                  </div>
                  <div>
                    <span>Type</span>
                    <strong>
                      {ORGANIZATION_TYPE_LABELS[organization.organization_type]}
                    </strong>
                  </div>
                  <div>
                    <span>Province</span>
                    <strong>{organization.province || "Not specified"}</strong>
                  </div>
                  {organization.website && (
                    <div>
                      <span>Website</span>
                      <a
                        href={organization.website}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {organization.website}
                      </a>
                    </div>
                  )}
                  <p>
                    {organization.description ||
                      "No firm description has been added."}
                  </p>
                  <p className="notice">
                    Only organization owners and administrators can edit firm
                    settings.
                  </p>
                </div>
              )}
            </div>
          </Panel>
          <Panel title={`Team · ${data.organization_members.length}`}>
            <div className="team-list">
              {data.organization_members.map((member) => (
                <div className="team-row" key={member.id}>
                  <span className="avatar">{initials(member.name)}</span>
                  <div>
                    <strong>
                      {member.name}
                      {member.user_id === user.id && " · You"}
                    </strong>
                    <small>{member.email}</small>
                  </div>
                  <div>
                    <span className="badge">{statusText(member.role)}</span>
                    {member.status !== "active" && (
                      <span className="badge badge-amber">
                        {statusText(member.status)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="panel-body team-note">
              <p className="muted">
                Team invitations and membership changes are intentionally
                deferred. Phase 1 establishes firm membership and role-aware
                access without adding an invitation workflow.
              </p>
            </div>
          </Panel>
          {!user.is_demo && (
            <Panel title="Change password">
              <div className="panel-body">
                <MutationForm
                  action="password"
                  label="Change password & sign out"
                >
                  <label>
                    Current password
                    <input
                      name="current"
                      type="password"
                      autoComplete="current-password"
                      required
                      maxLength={128}
                    />
                  </label>
                  <label>
                    New password
                    <input
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={12}
                      maxLength={128}
                    />
                    <span className="field-hint">
                      At least 12 characters. All sessions will be signed out.
                    </span>
                  </label>
                </MutationForm>
              </div>
            </Panel>
          )}
        </div>
        <aside className="space-y-5">
          <Panel title="Your account">
            <div className="panel-body">
              <div className="account-roles">
                <div>
                  <span>Persona</span>
                  <strong>{statusText(user.role)}</strong>
                </div>
                <div>
                  <span>Firm role</span>
                  <strong>{statusText(organization.membership_role)}</strong>
                </div>
              </div>
              <p className="muted mt-4">
                Your persona controls the type of workspace you use. Your firm
                role controls what you can change for {organization.name}.
              </p>
              {data.demo && (
                <p className="notice mt-4">
                  This account is shared demo data. Use a new account and a
                  separate deployment before starting a real pilot.
                </p>
              )}
            </div>
          </Panel>
          <Panel title="Early-access release">
            <div className="panel-body">
              <p className="muted">
                Billing, email delivery, identity verification, team
                invitations, and electronic signatures are not connected in this
                release.
              </p>
              <Link
                href="/about-this-release"
                className="mt-4 inline-block text-sm font-semibold text-emerald-800"
              >
                Read release details{" "}
                <ArrowUpRight size={14} className="inline" />
              </Link>
            </div>
          </Panel>
        </aside>
      </div>
    </>
  );
}

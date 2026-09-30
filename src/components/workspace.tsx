"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  Fragment,
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
  RotateCcw,
  Bell,
  Mail,
  ScanSearch,
  ShieldAlert,
  FileCheck2,
} from "lucide-react";
import { Brand } from "./brand";
import { cn } from "@/lib/utils";
import { verificationStatusMeets } from "@/lib/verification";
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
  DEAL_TRANSACTION_TYPES,
  DEAL_DISTRIBUTION_MODES,
  DEAL_FINANCIAL_PERIOD_TYPES,
  BUYER_FUNNEL_STAGES,
  NOTIFICATION_TYPES,
  NOTIFICATION_FREQUENCIES,
  BUYER_VERIFICATION_STATUSES,
  BUYER_VERIFICATION_STATUS_LABELS,
  type WorkspaceData,
  type Deal,
  type BuyerProject,
  type Task,
  type Document,
  type Access,
  type DealMatch,
  type DealOutreachRecipient,
  type IntroductionRequest,
  type BuyerFunnelEntry,
  type DealBuyerEventType,
  type NotificationFrequency,
  type NotificationPreferences,
  type NotificationType,
  type BuyerVerificationStatus,
  type ClosedTransaction,
  type SellerVisibleClosedTransaction,
  type TeaserSafetyReview,
} from "@/lib/types";

const buyerOrganizationTypes = new Set<string>(BUYER_ORGANIZATION_TYPES);
const buyerVerificationStatusLabel = (value: BuyerVerificationStatus) =>
  BUYER_VERIFICATION_STATUS_LABELS[value];
const isFirmVerified = (value: BuyerVerificationStatus) =>
  verificationStatusMeets(value, "firm_verified");
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
const distributionModeLabel = (value: string) =>
  ({
    invite_only: "Invite only",
    private_outreach: "Private outreach",
    qualified_discovery: "Qualified Discovery",
  })[value] || statusText(value);
const financialPeriodLabel = (value: string) =>
  ({
    annual: "Fiscal year",
    trailing_twelve_months: "Trailing 12 months",
    year_to_date: "Year to date",
  })[value] || statusText(value);
const matchDimensionLabel = (value: string) =>
  ({
    industry: "Industry",
    revenue: "Revenue",
    ebitda: "EBITDA",
    geography: "Geography",
    transaction: "Transaction type",
    enterprise_value: "Enterprise value",
    ownership: "Ownership",
    keywords: "Thesis signals",
  })[value] || statusText(value);
const expectedValueLabel = (deal: Deal) => {
  if (deal.min_expected_value === null && deal.max_expected_value === null)
    return "Not specified";
  if (deal.min_expected_value === null)
    return `Up to ${money(deal.max_expected_value!, false)}`;
  if (deal.max_expected_value === null)
    return `${money(deal.min_expected_value, false)}+`;
  return `${money(deal.min_expected_value, false)} – ${money(deal.max_expected_value, false)}`;
};

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
const dateTimeLabel = (date: string) =>
  new Date(
    date.includes("T") ? date : `${date.replace(" ", "T")}Z`,
  ).toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Toronto",
  });
const closedDateLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-CA", {
    month: "short",
    year: "numeric",
    timeZone: "America/Toronto",
  });
const statusText = (value: string) =>
  value.replaceAll("_", " ").replace(/^./, (v) => v.toUpperCase());
const buyerAccessMessage = (access: Access) => {
  if (access.status === "approved")
    return access.nda_method === "electronic_signature"
      ? "You have access to the documents shared with your team. Your executed NDA was verified by the signing provider."
      : "You have access to the documents shared with your team. Your externally executed NDA was approved by the deal team.";
  if (access.status === "nda_pending")
    return access.nda_method === "electronic_signature"
      ? "The deal team sent your NDA through its signing provider. Check the provider email and complete its signing steps; access opens automatically only after verified completion."
      : "The deal team has invited you to exchange an NDA. Upload your externally executed agreement in the data room for their review.";
  if (access.status === "requested")
    return "Your request is with the deal team. You can introduce yourself in Messages while they review it.";
  return "The deal team has restricted your access to this opportunity.";
};
const electronicNdaHeading = (status?: string) => {
  if (status === "buyer_signed") return "Buyer signed — awaiting completion";
  if (status === "sent") return "Awaiting buyer signature";
  if (status === "failed") return "Electronic request failed";
  return "Electronic NDA in progress";
};
function Status({ value }: { value: string }) {
  return (
    <span
      className={cn(
        "badge",
        [
          "approved",
          "firm_verified",
          "capital_reviewed",
          "verified_acquirer",
          "done",
          "Closed",
          "Due diligence",
          "Shortlisted",
          "selected",
          "contacted",
          "completed",
          "Succera verified",
        ].includes(value)
          ? "badge-green"
          : [
                "requested",
                "pending",
                "nda_pending",
                "LOI review",
                "Under review",
                "Self-reported",
                "sent",
                "buyer_signed",
              ].includes(value)
            ? "badge-amber"
            : [
                  "revoked",
                  "denied",
                  "rejected",
                  "Not proceeding",
                  "excluded",
                  "declined",
                  "voided",
                  "failed",
                ].includes(value)
              ? "badge-red"
              : "badge-blue",
      )}
    >
      {statusText(value)}
    </span>
  );
}
function TransactionTombstones({
  transactions,
  className,
}: {
  transactions: SellerVisibleClosedTransaction[];
  className?: string;
}) {
  return (
    <div className={cn("transaction-tombstones", className)} role="list">
      {transactions.map((transaction) => (
        <article key={transaction.id} role="listitem">
          <header>
            <div>
              <strong>{transaction.industry}</strong>
              <span>
                {transaction.province} · Closed{" "}
                {closedDateLabel(transaction.closed_date)}
              </span>
            </div>
            <Status value={transaction.verification_label} />
          </header>
          <p>{transaction.description}</p>
          <small>
            {transaction.enterprise_value === null
              ? "Enterprise value not disclosed"
              : `${money(transaction.enterprise_value, false)} enterprise value`}
          </small>
        </article>
      ))}
    </div>
  );
}

function BuyerTransactionTombstones({
  transactions,
  canManage,
}: {
  transactions: ClosedTransaction[];
  canManage: boolean;
}) {
  const { data } = useWorkspace();
  const publicProfile = data.public_network_profile;
  const canPublish = Boolean(
    publicProfile?.is_public && publicProfile.show_verified_transactions,
  );
  return (
    <div
      className="transaction-tombstones transaction-tombstones-own"
      role="list"
    >
      {transactions.map((transaction) => (
        <article key={transaction.id} role="listitem">
          <header>
            <div>
              <strong>{transaction.industry}</strong>
              <span>
                {transaction.province} · Closed{" "}
                {closedDateLabel(transaction.closed_date)}
              </span>
            </div>
            <Status value={transaction.verification_label} />
          </header>
          <p>{transaction.description}</p>
          <small>
            {transaction.enterprise_value === null
              ? "Enterprise value not disclosed"
              : `${money(transaction.enterprise_value, false)} enterprise value`}
          </small>
          {transaction.verified ? (
            <div className="public-transaction-controls">
              <div>
                <strong>
                  {transaction.public_opt_in
                    ? "Published to the public network"
                    : "Private transaction record"}
                </strong>
                <span>
                  {transaction.public_opt_in
                    ? "Only this anonymized record is visible."
                    : "Publishing is always an explicit organization decision."}
                </span>
              </div>
              {canManage && (transaction.public_opt_in || canPublish) ? (
                <MutationForm
                  action="setClosedTransactionPublic"
                  extra={{
                    transaction_id: transaction.id,
                    public_opt_in: !Boolean(transaction.public_opt_in),
                  }}
                  label={
                    transaction.public_opt_in
                      ? "Remove from network"
                      : "Publish verified record"
                  }
                >
                  <span className="field-hint">
                    {transaction.public_opt_in
                      ? "This is reversible."
                      : "No company identity or confidential materials are published."}
                  </span>
                </MutationForm>
              ) : null}
            </div>
          ) : (
            <p className="field-hint public-transaction-pending">
              Publish controls appear after Succera independently verifies this
              record.
            </p>
          )}
        </article>
      ))}
    </div>
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

const notificationTypeLabels: Record<NotificationType, string> = {
  new_match: "New buyer matches",
  opportunity_shared: "Private opportunities shared",
  introduction_requested: "Introduction requests",
  introduction_approved: "Approved introductions",
  buyer_pursued: "Buyer interest",
  nda_requested: "NDA requests",
  nda_approved: "NDA approvals",
  new_message: "New messages",
  new_task: "New tasks",
  document_shared: "Documents shared",
  ioi_received: "IOIs received",
  loi_received: "LOIs received",
  access_revoked: "Access changes",
};

const notificationTypeDescriptions: Record<NotificationType, string> = {
  new_match: "When a buyer mandate becomes a strong match",
  opportunity_shared: "When a sell-side team shares an opportunity",
  introduction_requested: "When a qualified buyer requests an introduction",
  introduction_approved: "When a seller approves an introduction",
  buyer_pursued: "When a buyer elects to pursue an opportunity",
  nda_requested: "When an NDA review is requested",
  nda_approved: "When NDA access is approved",
  new_message: "When someone sends you a deal message",
  new_task: "When a diligence task is assigned",
  document_shared: "When a deal-room document is shared",
  ioi_received: "When an indication of interest is recorded",
  loi_received: "When a letter of intent is submitted",
  access_revoked: "When deal-room access changes",
};

const notificationFrequencyLabels: Record<NotificationFrequency, string> = {
  immediate: "Immediate",
  daily_digest: "Daily digest",
  weekly_digest: "Weekly digest",
  disabled: "Email off",
};

function NotificationBell() {
  const { data, busy, act } = useWorkspace();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  const unread = data.notification_unread_count;

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      const details = detailsRef.current;
      if (details && !details.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        detailsRef.current?.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <details
      className="notification-menu"
      ref={detailsRef}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary
        className="icon-button notification-trigger"
        role="button"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
      >
        <Bell size={18} strokeWidth={1.7} />
        {unread > 0 && (
          <span className="notification-badge" aria-hidden="true">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </summary>
      {open && (
        <section
          className="notification-popover"
          aria-label="Notifications"
          role="region"
        >
          <div className="notification-popover-header">
            <div>
              <p className="eyebrow">ACTIVITY</p>
              <h2>Notifications</h2>
            </div>
            {unread > 0 && (
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => void act("markAllNotificationsRead", {})}
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="notification-list">
            {data.notifications.length ? (
              data.notifications.map((notification) => (
                <article
                  className={cn(
                    "notification-item",
                    !notification.read_at && "unread",
                  )}
                  key={notification.id}
                >
                  <span className="notification-dot" aria-hidden="true" />
                  <div>
                    <Link
                      href={notification.href}
                      onClick={() => setOpen(false)}
                    >
                      <strong>{notification.title}</strong>
                      <span>{notification.body}</span>
                    </Link>
                    <small>{dateTimeLabel(notification.created_at)}</small>
                  </div>
                  <button
                    type="button"
                    className="notification-read-toggle"
                    disabled={busy}
                    aria-label={
                      notification.read_at ? "Mark as unread" : "Mark as read"
                    }
                    onClick={() =>
                      void act("setNotificationRead", {
                        notification_id: notification.id,
                        read: !notification.read_at,
                      })
                    }
                  >
                    {notification.read_at ? "Unread" : "Read"}
                  </button>
                </article>
              ))
            ) : (
              <div className="notification-empty">
                <Bell size={24} strokeWidth={1.5} />
                <strong>You’re caught up</strong>
                <span>Transaction updates will appear here.</span>
              </div>
            )}
          </div>
          <Link
            className="notification-settings-link"
            href="/app/settings"
            onClick={() => setOpen(false)}
          >
            Notification preferences <ChevronRight size={14} />
          </Link>
        </section>
      )}
    </details>
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
function OptionSelectField({
  label,
  name,
  options,
  value,
  help,
}: {
  label: string;
  name: string;
  options: readonly { value: string; label: string }[];
  value?: string;
  help?: string;
}) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={value || options[0]?.value} required>
        {options.map((option) => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {help && <span className="field-hint">{help}</span>}
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
      const endpoint =
        action === "requestElectronicNda"
          ? "/api/signatures"
          : "/api/workspace";
      const response = await fetch(endpoint, {
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
      if (action === "setNotificationRead") {
        const notificationId = String(values.notification_id);
        const read = Boolean(values.read);
        setData((current) => {
          const selected = current.notifications.find(
            (notification) => notification.id === notificationId,
          );
          const wasUnread = selected ? !selected.read_at : false;
          const willBeUnread = !read;
          return {
            ...current,
            notifications: current.notifications.map((notification) =>
              notification.id === notificationId
                ? {
                    ...notification,
                    read_at: read ? new Date().toISOString() : null,
                  }
                : notification,
            ),
            notification_unread_count: Math.max(
              0,
              current.notification_unread_count +
                Number(willBeUnread) -
                Number(wasUnread),
            ),
          };
        });
        notify(json.message);
        return json as Result;
      }
      if (action === "markAllNotificationsRead") {
        const readAt = new Date().toISOString();
        setData((current) => ({
          ...current,
          notifications: current.notifications.map((notification) => ({
            ...notification,
            read_at: notification.read_at ?? readAt,
          })),
          notification_unread_count: 0,
        }));
        notify(json.message);
        return json as Result;
      }
      if (action === "notificationPreferences") {
        setData((current) => ({
          ...current,
          notification_preferences: {
            ...current.notification_preferences,
            ...(values.preferences as Partial<NotificationPreferences>),
          },
        }));
        notify(json.message);
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
    { id: "opportunities", label: "Discover", Icon: Compass },
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
    ...(buyerOrganizationTypes.has(data.organization.organization_type) ||
    data.is_platform_admin
      ? [
          {
            id: "verification",
            label:
              data.is_platform_admin && data.user.role !== "buyer"
                ? "Buyer reviews"
                : "Verification",
            Icon: ShieldCheck,
          },
        ]
      : []),
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
              <NotificationBell />
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
            ) : section === "verification" ? (
              <VerificationPage />
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
        description="Keep each acquisition thesis and its search criteria in one private workspace. Match results remain private until the recommended-buyer workflow is introduced."
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
function IntroductionRequestControl({
  deal,
  request,
}: {
  deal: Deal;
  request?: IntroductionRequest;
}) {
  const { data, act, busy } = useWorkspace();
  const [open, setOpen] = useState(false);
  if (request) {
    return (
      <div className="introduction-state">
        <div>
          <Status value={request.status} />
          <p>
            {request.status === "pending"
              ? "The deal team is reviewing your introduction."
              : request.status === "approved"
                ? request.requested_by_user_id === data.user.id
                  ? "Approved. Continue in My pipeline to begin the access workflow."
                  : `Approved for ${request.requested_by_user_name}, who can continue in My pipeline.`
                : request.status === "declined"
                  ? "The deal team is not proceeding with your organization."
                  : "Your organization withdrew this request."}
          </p>
        </div>
        {request.status === "pending" && (
          <button
            className="button button-quiet button-small"
            disabled={busy}
            onClick={() =>
              void act("withdrawIntroduction", {
                deal_id: deal.id,
                introduction_request_id: request.id,
              })
            }
          >
            Withdraw
          </button>
        )}
      </div>
    );
  }
  if (!deal.matched_project_id) return null;
  return open ? (
    <div className="introduction-form">
      <MutationForm
        action="requestIntroduction"
        extra={{
          deal_id: deal.id,
          buyer_project_id: deal.matched_project_id,
        }}
        label="Send request"
        onSuccess={() => setOpen(false)}
      >
        <label>
          Why are you interested, and why are you a credible acquirer?
          <textarea
            name="message"
            minLength={20}
            maxLength={3000}
            required
            placeholder="Share your relevant acquisition or operating experience and capital readiness."
          />
        </label>
        <button
          className="text-link request-cancel"
          type="button"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </MutationForm>
    </div>
  ) : (
    <button
      className="button button-green w-full"
      onClick={() => setOpen(true)}
    >
      Request introduction
      <Handshake size={16} />
    </button>
  );
}

function Opportunities() {
  const { data } = useWorkspace();
  const [q, setQ] = useState(""),
    [province, setProvince] = useState(""),
    [sector, setSector] = useState("");
  const privateOutreachByDeal = new Map<string, DealOutreachRecipient>();
  for (const recipient of data.deal_outreach)
    if (!privateOutreachByDeal.has(recipient.deal_id))
      privateOutreachByDeal.set(recipient.deal_id, recipient);
  const introductionByDeal = new Map(
    data.introduction_requests.map((request) => [request.deal_id, request]),
  );
  const deals = data.deals
    .filter(
      (d) =>
        (data.user.role !== "buyer"
          ? !!d.published
          : privateOutreachByDeal.has(d.id) ||
            (d.published &&
              d.distribution_mode === "qualified_discovery" &&
              !!d.matched_project_id)) &&
        (!q ||
          `${d.title} ${d.description} ${d.sector}`
            .toLowerCase()
            .includes(q.toLowerCase())) &&
        (!province || d.province === province) &&
        (!sector || d.sector === sector),
    )
    .sort((a, b) => (b.match_score || 0) - (a.match_score || 0));
  const privateDeals =
    data.user.role === "buyer"
      ? deals.filter((deal) => privateOutreachByDeal.has(deal.id))
      : [];
  const discoveryDeals =
    data.user.role === "buyer"
      ? deals.filter((deal) => !privateOutreachByDeal.has(deal.id))
      : deals;
  const discoveryVerificationRequired =
    data.user.role === "buyer" &&
    !verificationStatusMeets(
      data.organization.verification_status,
      data.qualified_discovery_min_verification_status,
    );
  const cards = (items: Deal[]) => (
    <div className="deal-grid">
      {items.map((d) => {
        const privateOutreach = privateOutreachByDeal.get(d.id);
        const introduction = introductionByDeal.get(d.id);
        return (
          <article className="deal-card" key={d.id}>
            <Link className="deal-card-link" href={`/app/deals/${d.id}`}>
              <div className="deal-card-top">
                <span className="icon-tile">
                  <Building2 size={23} />
                </span>
                {data.user.role === "buyer" ? (
                  privateOutreach ? (
                    ["pursued", "passed"].includes(privateOutreach.status) ? (
                      <Status value={privateOutreach.status} />
                    ) : (
                      <span className="badge badge-green">
                        Private invitation
                      </span>
                    )
                  ) : (
                    <span className="match-badge">
                      <strong>{d.match_score}%</strong>
                      <span>match</span>
                    </span>
                  )
                ) : (
                  <Status value={d.stage} />
                )}
              </div>
              {d.matched_project_name && (
                <p className="project-kicker">{d.matched_project_name}</p>
              )}
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
              {d.matched_project_id && d.match_reasons?.length ? (
                <div className="match-ledger">
                  <strong>Why this matches you</strong>
                  <div>
                    {d.match_reasons.slice(0, 4).map((reason) => (
                      <span key={reason}>
                        <Check size={13} />
                        {matchDimensionLabel(reason)}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="deal-card-footer">
                <span>
                  {d.has_access
                    ? "Open deal room"
                    : privateOutreach
                      ? "Review private invitation"
                      : "Review anonymized teaser"}
                </span>
                <ArrowUpRight size={18} />
              </div>
            </Link>
            {!privateOutreach && data.user.role === "buyer" && (
              <IntroductionRequestControl deal={d} request={introduction} />
            )}
          </article>
        );
      })}
    </div>
  );
  return (
    <>
      <Heading
        title="Discover qualified opportunities."
        description={
          data.user.role === "buyer"
            ? `Only anonymized Canadian mandates matched to an active acquisition project at ${data.qualified_discovery_min_score}% or higher.`
            : "Published teasers from your mandates. Buyer discovery is available in the buyer portal."
        }
        eyebrow="PRIVATE DEAL NETWORK"
      >
        <Link className="button button-quiet" href="/app/projects">
          <SlidersHorizontal size={16} />
          Acquisition criteria
        </Link>
      </Heading>
      {discoveryVerificationRequired && (
        <div className="notice mb-5" role="status">
          <strong>Complete buyer verification for Qualified Discovery.</strong>{" "}
          Your firm must reach at least{" "}
          {buyerVerificationStatusLabel(
            data.qualified_discovery_min_verification_status,
          ).toLowerCase()}{" "}
          before matched public-network teasers appear. Private invitations from
          sellers remain available.{" "}
          <Link href="/app/verification">Review verification requirements</Link>
        </div>
      )}
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
      {privateDeals.length > 0 && (
        <section className="discovery-section" aria-labelledby="private-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">SELLER SELECTED</p>
              <h2 id="private-title">Private invitations</h2>
            </div>
            <span>{privateDeals.length}</span>
          </div>
          {cards(privateDeals)}
        </section>
      )}
      {discoveryDeals.length > 0 && (
        <section
          className="discovery-section"
          aria-labelledby="discovery-title"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                {data.user.role === "buyer"
                  ? "QUALIFIED DISCOVERY"
                  : "PUBLISHED TEASERS"}
              </p>
              <h2 id="discovery-title">
                {data.user.role === "buyer"
                  ? "Matched to your mandates"
                  : "Your published mandates"}
              </h2>
            </div>
            <span>{discoveryDeals.length}</span>
          </div>
          {cards(discoveryDeals)}
        </section>
      )}
      {!deals.length && (
        <Empty
          title={
            discoveryVerificationRequired
              ? "Qualified Discovery is not active yet"
              : "No qualified matches yet"
          }
          body={
            discoveryVerificationRequired
              ? "Submit your firm profile for internal review. Once the required trust level is approved, eligible matches will appear here automatically."
              : "Activate an acquisition project or refine its criteria. New opportunities appear only when they meet the discovery threshold."
          }
          href={
            data.user.role === "buyer"
              ? discoveryVerificationRequired
                ? "/app/verification"
                : "/app/projects"
              : undefined
          }
          label={
            discoveryVerificationRequired
              ? "Open buyer verification"
              : "Review acquisition projects"
          }
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

const transactionOptions = DEAL_TRANSACTION_TYPES.map((value) => ({
  value,
  label: projectTransactionLabel(value),
}));
const distributionOptions = DEAL_DISTRIBUTION_MODES.map((value) => ({
  value,
  label: distributionModeLabel(value),
}));
const financialPeriodOptions = DEAL_FINANCIAL_PERIOD_TYPES.map((value) => ({
  value,
  label: financialPeriodLabel(value),
}));

function MandateDetailFields({
  deal,
  includeInitialFinancial = false,
}: {
  deal?: Deal;
  includeInitialFinancial?: boolean;
}) {
  return (
    <div className="mandate-form">
      <fieldset className="mandate-section">
        <legend>Company profile</legend>
        <p>
          Identity details remain restricted to the deal team and approved
          buyers.
        </p>
        <div className="form-grid">
          <Field
            label="Project name (shown in teaser)"
            name="title"
            value={deal?.title}
            help="Use a code name, e.g. Project Cedar."
          />
          <Field
            label="Legal company name (confidential)"
            name="company_name"
            value={deal?.company_name}
          />
          <Field
            label="Year founded"
            name="founded"
            type="number"
            value={deal?.founded ?? 2010}
            min={1800}
            max={new Date().getFullYear()}
          />
          <Field
            label="Employees (confidential)"
            name="employees"
            type="number"
            value={deal?.employees}
            min={0}
          />
        </div>
      </fieldset>

      <fieldset className="mandate-section">
        <legend>Financials</legend>
        <p>
          Enter Canadian-dollar amounts. A historical period is created with
          every new mandate.
        </p>
        <div className="form-grid">
          <Field
            label="Annual revenue (CAD)"
            name="revenue"
            type="number"
            value={deal?.revenue}
            min={0}
          />
          <Field
            label="EBITDA (CAD)"
            name="ebitda"
            type="number"
            value={deal?.ebitda}
            min={0}
          />
          <Field
            label="Indicative asking price (CAD)"
            name="asking_price"
            type="number"
            value={deal?.asking_price}
            min={0}
          />
          {includeInitialFinancial && (
            <>
              <Field
                label="Gross profit (CAD, optional)"
                name="gross_profit"
                type="number"
                required={false}
              />
              <Field
                label="Financial year"
                name="financial_year"
                type="number"
                value={new Date().getFullYear() - 1}
                min={1800}
                max={2200}
              />
              <label className="checkbox-label financial-projection">
                <input type="checkbox" name="financial_is_projected" />
                This period is projected
              </label>
            </>
          )}
        </div>
      </fieldset>

      <fieldset className="mandate-section">
        <legend>Transaction objectives</legend>
        <p>
          Capture the structure and outcomes the seller is prepared to consider.
        </p>
        <div className="form-grid">
          <OptionSelectField
            label="Transaction type"
            name="transaction_type"
            options={transactionOptions}
            value={deal?.transaction_type ?? "full_acquisition"}
          />
          <Field
            label="Ownership available (%)"
            name="ownership_percentage_available"
            type="number"
            value={deal?.ownership_percentage_available ?? 100}
            min={0}
            max={100}
          />
          <Field
            label="Minimum expected value (CAD, optional)"
            name="min_expected_value"
            type="number"
            value={deal?.min_expected_value ?? ""}
            min={0}
            required={false}
          />
          <Field
            label="Maximum expected value (CAD, optional)"
            name="max_expected_value"
            type="number"
            value={deal?.max_expected_value ?? ""}
            min={0}
            required={false}
          />
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="seller_rollover_possible"
              defaultChecked={Boolean(deal?.seller_rollover_possible)}
            />
            Seller rollover may be considered
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="seller_financing_possible"
              defaultChecked={Boolean(deal?.seller_financing_possible)}
            />
            Seller financing may be considered
          </label>
          <label className="full">
            Management transition
            <textarea
              name="management_transition"
              maxLength={2000}
              defaultValue={deal?.management_transition}
              placeholder="Describe the founder and management team's expected role after closing."
            />
          </label>
          <label className="full">
            Reason for transaction
            <textarea
              name="reason_for_transaction"
              maxLength={2000}
              defaultValue={deal?.reason_for_transaction}
              placeholder="Summarize the seller's objectives without exposing identifying details."
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="mandate-section">
        <legend>Geography and industry</legend>
        <div className="form-grid">
          <SelectField
            label="Industry"
            name="sector"
            options={SECTORS}
            value={deal?.sector ?? SECTORS[0]}
          />
          <SelectField
            label="Province or territory"
            name="province"
            options={PROVINCES}
            value={deal?.province ?? "Ontario"}
          />
          <Field label="City (confidential)" name="city" value={deal?.city} />
        </div>
      </fieldset>

      <fieldset className="mandate-section">
        <legend>Confidential teaser</legend>
        <p>
          The anonymous teaser can be shared only according to the distribution
          strategy below.
        </p>
        <div className="form-grid">
          <label className="full">
            Anonymous teaser
            <textarea
              name="description"
              minLength={30}
              maxLength={1200}
              required
              defaultValue={deal?.description}
              placeholder="Describe the opportunity without identifying the company, its customers, or its employees."
            />
            <span className="field-hint">
              Never include the company name, website, owner identity, customer
              names, or employee names.
            </span>
          </label>
          <label className="full">
            Confidential business summary
            <textarea
              name="confidential_summary"
              maxLength={5000}
              defaultValue={deal?.confidential_summary}
              placeholder="Details available only to the deal team and approved buyers."
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="mandate-section distribution-section">
        <legend>Distribution strategy</legend>
        <OptionSelectField
          label="Distribution strategy"
          name="distribution_mode"
          options={distributionOptions}
          value={deal?.distribution_mode ?? "private_outreach"}
        />
        <div className="distribution-guide">
          <p>
            <strong>Invite only</strong>
            <span>Only buyers explicitly invited by the deal team.</span>
          </p>
          <p>
            <strong>Private outreach</strong>
            <span>
              Controlled outreach managed by the seller or advisor. This is the
              default.
            </span>
          </p>
          <p>
            <strong>Qualified Discovery</strong>
            <span>
              Signed-in buyers may see the anonymous teaser and request access.
            </span>
          </p>
        </div>
      </fieldset>
    </div>
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
      <Panel title="Sell-side mandate">
        <div className="panel-body">
          <MutationForm
            action="createDeal"
            label="Create private mandate"
            onSuccess={(r) => r.id && onCreated(r.id)}
          >
            <MandateDetailFields includeInitialFinancial />
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
  const { data } = useWorkspace();
  const introduction = data.introduction_requests.find(
    (request) => request.deal_id === deal.id,
  );
  let content: ReactNode;
  if (!access) {
    content = deal.matched_project_id ? (
      <>
        <p className="muted mb-4">
          Introductions are reviewed by the seller before the NDA and deal-room
          workflow begins.
        </p>
        <IntroductionRequestControl deal={deal} request={introduction} />
      </>
    ) : (
      <p className="muted">
        This opportunity is not currently eligible for your active acquisition
        projects.
      </p>
    );
  } else {
    content = (
      <>
        <Status value={access.status} />
        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          {buyerAccessMessage(access)}
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

function FinancialHistory({
  deal,
  manage = false,
}: {
  deal: Deal;
  manage?: boolean;
}) {
  const { data } = useWorkspace();
  const financials = data.deal_financials.filter(
    (financial) => financial.deal_id === deal.id,
  );
  return (
    <Panel title="Historical financials">
      {financials.length ? (
        <div className="table-scroll">
          <table className="data-table financial-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Revenue</th>
                <th>Gross profit</th>
                <th>EBITDA</th>
                <th>Margin</th>
              </tr>
            </thead>
            <tbody>
              {financials.map((financial) => (
                <tr key={financial.id}>
                  <td>
                    <strong>
                      {financial.period_type === "annual" ? "FY" : ""}
                      {financial.fiscal_year}
                    </strong>
                    <small>
                      {financialPeriodLabel(financial.period_type)}
                      {financial.is_projected ? " · Projected" : ""}
                    </small>
                  </td>
                  <td className="numeric">{money(financial.revenue, false)}</td>
                  <td className="numeric">
                    {financial.gross_profit === null
                      ? "—"
                      : money(financial.gross_profit, false)}
                  </td>
                  <td className="numeric">{money(financial.ebitda, false)}</td>
                  <td className="numeric">
                    {financial.revenue
                      ? `${((financial.ebitda / financial.revenue) * 100).toFixed(1)}%`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="No financial history yet"
          body="Add the first financial period to give qualified buyers a clearer view of the opportunity."
        />
      )}
      {manage && (
        <div className="financial-editor">
          <h3>Add or update a period</h3>
          <p className="muted">
            Saving the same year and period type updates the existing record.
          </p>
          <MutationForm
            action="upsertDealFinancial"
            extra={{ deal_id: deal.id }}
            label="Save financial period"
            reset
          >
            <div className="form-grid">
              <Field
                label="Financial year"
                name="fiscal_year"
                type="number"
                value={new Date().getFullYear()}
                min={1800}
                max={2200}
              />
              <OptionSelectField
                label="Period type"
                name="period_type"
                options={financialPeriodOptions}
                value="annual"
              />
              <Field
                label="Revenue (CAD)"
                name="revenue"
                type="number"
                min={0}
              />
              <Field label="EBITDA (CAD)" name="ebitda" type="number" />
              <Field
                label="Gross profit (CAD, optional)"
                name="gross_profit"
                type="number"
                required={false}
              />
              <label className="checkbox-label financial-projection">
                <input type="checkbox" name="is_projected" />
                This period is projected
              </label>
            </div>
          </MutationForm>
        </div>
      )}
    </Panel>
  );
}

function MandateSettings({ deal }: { deal: Deal }) {
  return (
    <div className="mandate-settings">
      <Panel title="Mandate details">
        <div className="panel-body">
          <p className="notice mandate-notice">
            Company identity and the confidential summary are restricted to the
            deal team and approved buyers. Review the anonymous teaser before
            enabling Qualified Discovery.
          </p>
          <MutationForm
            action="updateDealDetails"
            extra={{ deal_id: deal.id }}
            label="Save mandate details"
          >
            <MandateDetailFields deal={deal} />
          </MutationForm>
        </div>
      </Panel>
      <FinancialHistory deal={deal} manage />
    </div>
  );
}

const teaserFindingLabel = (value: string) =>
  ({
    company_name: "Business name",
    domain: "Domain or email",
    customer_name: "Customer name",
    precise_location: "Precise location",
    revealing_detail: "Revealing detail",
    missing_financial: "Missing financial",
  })[value] || statusText(value);

const teaserReviewStatus = (value: TeaserSafetyReview["status"]) =>
  ({
    ready: "Ready for human review",
    attention: "Review recommended",
    high_risk: "Identifying details found",
  })[value];

function TeaserSafetyAssistant({ deal }: { deal: Deal }) {
  const { data, act, busy, refresh, notify } = useWorkspace();
  const storedReviews = (data.teaser_safety_reviews ?? []).filter(
    (review) => review.deal_id === deal.id,
  );
  const [review, setReview] = useState<TeaserSafetyReview | undefined>(
    storedReviews[0],
  );
  const [running, setRunning] = useState(false);
  const capability = data.teaser_safety;
  const reviewCount =
    review?.review_count ?? storedReviews[0]?.review_count ?? (review ? 1 : 0);
  const runReview = async () => {
    setRunning(true);
    try {
      const response = await fetch("/api/teaser-safety", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal_id: deal.id }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Unable to review this teaser.");
      setReview(result.review as TeaserSafetyReview);
      notify(result.message);
      await refresh();
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Unable to review this teaser.",
        true,
      );
    } finally {
      setRunning(false);
    }
  };
  const applySuggestion = async () => {
    if (!review) return;
    const result = await act("applyTeaserSafetySuggestion", {
      deal_id: deal.id,
      review_id: review.id,
    });
    if (result)
      setReview((current) =>
        current
          ? { ...current, applied_at: new Date().toISOString() }
          : current,
      );
  };
  return (
    <div className="teaser-safety-layout">
      <Panel title="Teaser safety review">
        <div className="panel-body teaser-safety-intro">
          <div>
            <p className="eyebrow">HUMAN-CONTROLLED REVIEW</p>
            <h3>Check what the teaser could reveal.</h3>
            <p>
              Scan for business names, domains, customers, precise locations,
              revealing combinations and missing financial context. The review
              never changes or publishes your teaser automatically.
            </p>
          </div>
          <button
            className="button button-green"
            type="button"
            onClick={runReview}
            disabled={running || !capability.available}
          >
            {running ? <LoaderCircle size={16} /> : <ScanSearch size={16} />}
            {running ? "Reviewing teaser…" : "Run safety review"}
          </button>
        </div>
        <div
          className={cn(
            "teaser-provider-notice",
            capability.external_data_processing && "external",
          )}
        >
          <ShieldCheck size={18} />
          <div>
            <strong>
              {capability.provider_name || "Provider not configured"}
            </strong>
            <p>{capability.notice}</p>
          </div>
        </div>
      </Panel>

      <section
        className="teaser-current-draft"
        aria-labelledby="current-teaser"
      >
        <div className="teaser-section-heading">
          <div>
            <p className="eyebrow">CURRENT PRIVATE DRAFT</p>
            <h3 id="current-teaser">What buyers would read</h3>
          </div>
          <span className="badge">{deal.description.length}/1200</span>
        </div>
        <p>{deal.description}</p>
      </section>

      {review ? (
        <>
          <section
            className={cn("teaser-review-summary", review.status)}
            aria-labelledby="teaser-review-result"
          >
            <div className="teaser-review-heading">
              <span className="teaser-review-icon">
                {review.status === "ready" ? (
                  <FileCheck2 size={22} />
                ) : (
                  <ShieldAlert size={22} />
                )}
              </span>
              <div>
                <p className="eyebrow">LATEST REVIEW</p>
                <h3 id="teaser-review-result">
                  {teaserReviewStatus(review.status)}
                </h3>
                <p>
                  {review.findings.length} disclosure finding
                  {review.findings.length === 1 ? "" : "s"} · Reviewed by{" "}
                  {review.requested_by_name} on{" "}
                  {dateTimeLabel(review.created_at)}
                </p>
                <p>
                  Provider: {review.provider_name}
                  {review.provider.startsWith("local-fallback:")
                    ? " · External provider unavailable; deterministic local review used"
                    : ""}
                </p>
              </div>
              <Status
                value={
                  review.status === "ready"
                    ? "approved"
                    : review.status === "high_risk"
                      ? "failed"
                      : "pending"
                }
              />
            </div>
            {review.findings.length ? (
              <div className="teaser-findings">
                {review.findings.map((finding, index) => (
                  <article key={`${finding.type}-${finding.evidence}-${index}`}>
                    <header>
                      <strong>{teaserFindingLabel(finding.type)}</strong>
                      <span
                        className={cn("badge", `badge-${finding.severity}`)}
                      >
                        {statusText(finding.severity)}
                      </span>
                    </header>
                    <p>{finding.message}</p>
                    {finding.evidence && (
                      <small>
                        Flagged: <q>{finding.evidence}</q>
                      </small>
                    )}
                    {finding.replacement && (
                      <small>Safer direction: {finding.replacement}</small>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <p className="teaser-review-empty">
                No direct identifiers were found. A seller or advisor must still
                verify the draft against facts outside Succera.
              </p>
            )}
          </section>

          <div className="teaser-output-grid">
            <section className="teaser-suggestion" aria-labelledby="safe-draft">
              <div className="teaser-section-heading">
                <div>
                  <p className="eyebrow">SUGGESTED ANONYMIZED DRAFT</p>
                  <h3 id="safe-draft">Review every word before applying</h3>
                </div>
                {review.applied_at && (
                  <span className="badge badge-green">Applied</span>
                )}
              </div>
              <p>{review.suggested_teaser}</p>
              <div className="teaser-apply-row">
                <button
                  className="button button-green"
                  type="button"
                  disabled={
                    busy || Boolean(review.applied_at) || !!deal.published
                  }
                  onClick={applySuggestion}
                >
                  <Check size={16} /> Apply to private teaser draft
                </button>
                <span>
                  {deal.published
                    ? "Make this teaser private before applying a suggestion."
                    : "Applying does not publish. You can refine it under Mandate settings."}
                </span>
              </div>
            </section>

            <section
              className="teaser-review-checklist"
              aria-label="Review checklist"
            >
              <div>
                <p className="eyebrow">INVESTMENT HIGHLIGHTS</p>
                {review.investment_highlights.length ? (
                  <ul>
                    {review.investment_highlights.map((highlight) => (
                      <li key={highlight}>{highlight}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No safe highlights were generated.</p>
                )}
              </div>
              <div>
                <p className="eyebrow">CHECK BEFORE MARKET</p>
                {review.missing_financials.length ? (
                  <ul>
                    {review.missing_financials.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No obvious financial gaps were found.</p>
                )}
              </div>
            </section>
          </div>
          <p className="teaser-review-history">
            {reviewCount} review{reviewCount === 1 ? "" : "s"} retained for this
            mandate. Safety suggestions do not affect buyer matching until a
            deal-team member explicitly applies and saves the teaser draft.
          </p>
        </>
      ) : (
        <section className="teaser-safety-empty">
          <ScanSearch size={30} />
          <h3>No safety review yet</h3>
          <p>
            Run a review before outreach or Qualified Discovery, then verify the
            result using your knowledge of the company and its market.
          </p>
        </section>
      )}
    </div>
  );
}

function DealDetail({ deal }: { deal: Deal }) {
  const { data, act, busy } = useWorkspace();
  const [tab, setTab] = useState("Overview");
  const access = data.access.filter((a) => a.deal_id === deal.id);
  const myAccess = access.find((a) => a.buyer_id === data.user.id);
  const myOutreach = data.deal_outreach.filter(
    (recipient) => recipient.deal_id === deal.id,
  );
  const primaryOutreach = myOutreach[0];
  const viewedOutreach = useRef("");
  const sentRecipientIds = myOutreach
    .filter((recipient) => recipient.status === "sent")
    .map((recipient) => recipient.id);
  useEffect(() => {
    const viewKey = sentRecipientIds.slice().sort().join(",");
    if (!viewKey || viewedOutreach.current === viewKey) return;
    viewedOutreach.current = viewKey;
    void act("viewOutreach", {
      deal_id: deal.id,
      recipient_ids: sentRecipientIds,
    });
  }, [act, deal.id, sentRecipientIds]);
  const tabs = deal.has_access
    ? [
        "Overview",
        ...(deal.can_manage ? ["Mandate settings"] : []),
        ...(deal.can_manage ? ["Teaser safety"] : []),
        ...(deal.can_manage ? ["Recommended buyers"] : []),
        ...(deal.can_manage ? ["Buyer funnel"] : []),
        ...(data.user.role !== "buyer" ? ["Internal notes"] : []),
        "Data room",
        "Messages",
        "Tasks",
        "LOIs",
        ...(deal.can_manage ? ["Introduction requests"] : []),
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
            {data.user.role === "buyer" &&
              myOutreach.map((outreach) => (
                <PrivateOutreachPanel
                  deal={deal}
                  outreach={outreach}
                  key={outreach.id}
                />
              ))}
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
            <Panel title="Transaction profile">
              <div className="panel-body">
                <dl className="detail-metrics transaction-metrics">
                  <div>
                    <dt>Transaction type</dt>
                    <dd>{projectTransactionLabel(deal.transaction_type)}</dd>
                  </div>
                  <div>
                    <dt>Ownership available</dt>
                    <dd>{deal.ownership_percentage_available}%</dd>
                  </div>
                  <div>
                    <dt>Expected value</dt>
                    <dd>{expectedValueLabel(deal)}</dd>
                  </div>
                  <div>
                    <dt>Seller flexibility</dt>
                    <dd>
                      {[
                        deal.seller_rollover_possible && "Rollover",
                        deal.seller_financing_possible && "Financing",
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Not specified"}
                    </dd>
                  </div>
                </dl>
                {deal.has_access &&
                  (deal.management_transition ||
                    deal.reason_for_transaction) && (
                    <div className="transaction-notes">
                      {deal.reason_for_transaction && (
                        <div>
                          <strong>Reason for transaction</strong>
                          <p>{deal.reason_for_transaction}</p>
                        </div>
                      )}
                      {deal.management_transition && (
                        <div>
                          <strong>Management transition</strong>
                          <p>{deal.management_transition}</p>
                        </div>
                      )}
                    </div>
                  )}
              </div>
            </Panel>
            {deal.has_access && <FinancialHistory deal={deal} />}
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
                        Publishing makes the teaser visible only when the
                        distribution strategy is Qualified Discovery. Change the
                        strategy under Mandate settings.
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
            ) : data.user.role === "buyer" &&
              (!myOutreach.length || myAccess) ? (
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
              <Panel
                title={
                  primaryOutreach ? "Matched mandate" : "Why this could fit"
                }
              >
                <div className="panel-body">
                  <strong className="text-2xl tabular-nums text-emerald-800">
                    {primaryOutreach?.match_score ?? deal.match_score}%
                  </strong>
                  <p className="muted mb-4">
                    {primaryOutreach
                      ? `Matched to ${primaryOutreach.buyer_project_name}`
                      : deal.matched_project_name
                        ? `Matched to ${deal.matched_project_name}`
                        : "Rules-based criteria match"}
                  </p>
                  {(primaryOutreach?.match_reasons ?? deal.match_reasons)?.map(
                    (r) => (
                      <p
                        className="my-2 flex items-center gap-2 text-sm"
                        key={r}
                      >
                        <Check size={15} className="text-emerald-700" />
                        {primaryOutreach || deal.matched_project_id
                          ? matchDimensionLabel(r)
                          : r}
                      </p>
                    ),
                  )}
                  <Link
                    href="/app/projects"
                    className="mt-4 inline-block text-sm text-emerald-800 underline"
                  >
                    Edit your criteria
                  </Link>
                </div>
              </Panel>
            )}
          </aside>
        </div>
      ) : tab === "Mandate settings" ? (
        <MandateSettings deal={deal} />
      ) : tab === "Teaser safety" ? (
        <TeaserSafetyAssistant deal={deal} />
      ) : tab === "Recommended buyers" ? (
        <RecommendedBuyers deal={deal} />
      ) : tab === "Buyer funnel" ? (
        <BuyerFunnel deal={deal} />
      ) : tab === "Internal notes" ? (
        <InternalNotes deal={deal} />
      ) : tab === "Introduction requests" ? (
        <IntroductionRequests deal={deal} />
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

const funnelEventLabel = (event: DealBuyerEventType) =>
  ({
    matched: "Matched",
    selected: "Selected for outreach",
    excluded: "Excluded from recommendations",
    teaser_sent: "Teaser sent",
    teaser_viewed: "Teaser viewed",
    pursued: "Buyer expressed interest",
    passed: "Buyer passed",
    intro_requested: "Introduction requested",
    intro_approved: "Introduction approved",
    intro_declined: "Introduction declined",
    nda_requested: "NDA requested",
    nda_uploaded: "Executed NDA uploaded",
    nda_approved: "NDA approved",
    cim_shared: "CIM shared",
    ioi_received: "IOI received",
    loi_received: "LOI received",
    shortlisted: "LOI shortlisted",
    not_proceeding: "Marked not proceeding",
    exclusive: "Entered exclusivity",
    closed: "Transaction closed",
    access_revoked: "Access revoked",
  })[event];

const funnelRate = (value: number | null) =>
  value === null ? "—" : `${value}%`;

const responseTimeLabel = (hours: number | null) => {
  if (hours === null) return "—";
  if (hours < 1) return "<1h";
  if (hours < 24) return `${hours.toFixed(hours % 1 ? 1 : 0)}h`;
  const days = hours / 24;
  return `${days.toFixed(days % 1 ? 1 : 0)}d`;
};

const eventTimestamp = (value: string) =>
  new Date(
    value.replace(" ", "T") + (value.includes("Z") ? "" : "Z"),
  ).toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Toronto",
  });

function InternalNotes({ deal }: { deal: Deal }) {
  const { data } = useWorkspace();
  const notes = (data.deal_internal_notes ?? []).filter(
    (note) => note.deal_id === deal.id,
  );
  return (
    <section className="internal-notes" aria-labelledby="internal-notes-title">
      <header className="internal-notes-heading">
        <div>
          <p className="eyebrow">PRIVATE DEAL-TEAM RECORD</p>
          <h2 id="internal-notes-title">Internal notes</h2>
          <p>
            Capture call context, buyer signals, and follow-ups separately from
            external conversations.
          </p>
        </div>
        <span>{notes.length} notes</span>
      </header>
      <div className="internal-notes-privacy">
        <LockKeyhole size={18} aria-hidden="true" />
        <div>
          <strong>Private to the owner and advisor firms</strong>
          <p>
            Buyers never see these notes. Use Messages for buyer-facing
            communication.
          </p>
        </div>
      </div>
      {deal.can_manage ? (
        <div className="internal-note-composer">
          <MutationForm
            action="createInternalNote"
            extra={{ deal_id: deal.id }}
            label="Add internal note"
            reset
          >
            <label>
              Internal note
              <textarea
                name="body"
                rows={4}
                maxLength={5000}
                placeholder="Add context for the deal team…"
                required
              />
            </label>
            <p className="field-hint">
              Record facts and next steps. Do not use this area to message a
              buyer.
            </p>
          </MutationForm>
        </div>
      ) : (
        <p className="internal-note-readonly">
          Your firm role provides read-only access to this record.
        </p>
      )}
      <div className="internal-note-ledger">
        <div className="internal-note-ledger-heading">
          <h3>Deal-team record</h3>
          <span>Newest first</span>
        </div>
        {notes.map((note) => (
          <article className="internal-note-entry" key={note.id}>
            <span className="internal-note-avatar" aria-hidden="true">
              {initials(note.author_name)}
            </span>
            <div>
              <header>
                <div>
                  <strong>{note.author_name}</strong>
                  <span>
                    {note.author_role
                      ? `${note.author_role[0].toUpperCase()}${note.author_role.slice(1)}`
                      : "Former team member"}
                  </span>
                </div>
                <time dateTime={note.created_at}>
                  {eventTimestamp(note.created_at)}
                </time>
              </header>
              <p>{note.body}</p>
            </div>
          </article>
        ))}
        {!notes.length && (
          <Empty
            title="No internal notes yet"
            body="Add the first private update for the owner and advisor teams."
          />
        )}
      </div>
    </section>
  );
}

function BuyerFunnel({ deal }: { deal: Deal }) {
  const { data, act, busy } = useWorkspace();
  const funnel = data.buyer_funnels?.find(
    (candidate) => candidate.deal_id === deal.id,
  );
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [milestones, setMilestones] = useState<Record<string, string>>({});
  if (!funnel)
    return (
      <Empty
        title="No buyer activity yet"
        body="Eligible matches and buyer activity will appear here as the process develops."
      />
    );
  const buyers = funnel.buyers.filter(
    (buyer) =>
      (!query ||
        `${buyer.buyer_organization_name} ${buyer.buyer_project_name || ""}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (!stage || buyer.current_stage === stage),
  );
  const metricItems = [
    ["Pursuit rate", funnelRate(funnel.metrics.pursuit_rate)],
    ["NDA conversion", funnelRate(funnel.metrics.nda_conversion)],
    ["CIM conversion", funnelRate(funnel.metrics.cim_conversion)],
    ["IOI conversion", funnelRate(funnel.metrics.ioi_conversion)],
    ["LOI conversion", funnelRate(funnel.metrics.loi_conversion)],
    [
      "Average response",
      responseTimeLabel(funnel.metrics.average_response_hours),
    ],
  ];
  const recordMilestone = async (buyer: BuyerFunnelEntry) => {
    const eventType = milestones[buyer.buyer_organization_id] || "ioi_received";
    await act("recordBuyerFunnelEvent", {
      deal_id: deal.id,
      buyer_organization_id: buyer.buyer_organization_id,
      buyer_project_id: buyer.buyer_project_id,
      event_type: eventType,
    });
  };
  return (
    <section className="buyer-funnel" aria-labelledby="buyer-funnel-title">
      <div className="funnel-heading">
        <div>
          <p className="eyebrow">DEAL PROCESS LEDGER</p>
          <h2 id="buyer-funnel-title">Buyer funnel</h2>
          <p>
            Follow each organization from recommendation through closing. Every
            count is derived from recorded marketplace activity.
          </p>
        </div>
        <span>{funnel.buyers.length} buyers</span>
      </div>
      <div className="funnel-stage-strip" aria-label="Buyer funnel stages">
        {BUYER_FUNNEL_STAGES.map((funnelStage, index) => (
          <div key={funnelStage}>
            <span>{funnelStage}</span>
            <strong>{funnel.metrics.stage_counts[funnelStage]}</strong>
            {index < BUYER_FUNNEL_STAGES.length - 1 && (
              <ChevronRight aria-hidden="true" size={15} />
            )}
          </div>
        ))}
      </div>
      <dl className="funnel-metrics">
        {metricItems.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="funnel-controls">
        <label className="search-field">
          <span className="sr-only">Search buyer funnel</span>
          <Search size={17} />
          <input
            placeholder="Search buyer or project…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          aria-label="Filter buyer funnel by stage"
          value={stage}
          onChange={(event) => setStage(event.target.value)}
        >
          <option value="">All stages</option>
          {BUYER_FUNNEL_STAGES.map((funnelStage) => (
            <option key={funnelStage}>{funnelStage}</option>
          ))}
        </select>
      </div>
      {buyers.length ? (
        <div className="panel funnel-table-wrap">
          <div className="table-scroll">
            <table className="data-table funnel-table">
              <thead>
                <tr>
                  <th>Buyer</th>
                  <th>Current stage</th>
                  <th>Match</th>
                  <th>Last activity</th>
                  <th>Outcome</th>
                  <th>
                    <span className="sr-only">Inspect</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {buyers.map((buyer) => {
                  const isExpanded = expanded === buyer.buyer_organization_id;
                  return (
                    <Fragment key={buyer.buyer_organization_id}>
                      <tr>
                        <td>
                          <strong>{buyer.buyer_organization_name}</strong>
                          <small>
                            {buyer.buyer_project_name ||
                              "No acquisition project"}
                          </small>
                        </td>
                        <td>
                          <Status value={buyer.current_stage} />
                        </td>
                        <td className="numeric">
                          {buyer.match_score === null
                            ? "—"
                            : `${buyer.match_score}%`}
                        </td>
                        <td>
                          <span className="funnel-date">
                            {eventTimestamp(buyer.last_event_at)}
                          </span>
                        </td>
                        <td>
                          <Status value={buyer.outcome} />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="button button-quiet button-small"
                            aria-expanded={isExpanded}
                            aria-label={`Inspect ${buyer.buyer_organization_name}`}
                            onClick={() =>
                              setExpanded(
                                isExpanded ? null : buyer.buyer_organization_id,
                              )
                            }
                          >
                            {isExpanded ? "Close" : "Inspect"}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr
                          className="funnel-history-row"
                          key={`${buyer.buyer_organization_id}-history`}
                        >
                          <td colSpan={6}>
                            <div className="funnel-history">
                              <div>
                                <h3>Buyer event history</h3>
                                <p>
                                  An append-only record of the milestones that
                                  support this buyer’s funnel position.
                                </p>
                                <ol>
                                  {[...buyer.events].reverse().map((event) => (
                                    <li key={event.id}>
                                      <span aria-hidden="true" />
                                      <div>
                                        <strong>
                                          {funnelEventLabel(event.event_type)}
                                        </strong>
                                        <small>
                                          {eventTimestamp(event.created_at)}
                                          {event.created_by_user_name
                                            ? ` · ${event.created_by_user_name}`
                                            : " · System"}
                                          {event.buyer_project_name
                                            ? ` · ${event.buyer_project_name}`
                                            : ""}
                                        </small>
                                      </div>
                                    </li>
                                  ))}
                                </ol>
                              </div>
                              <div className="funnel-milestone">
                                <h3>Record an offline milestone</h3>
                                <p>
                                  Use this only when the milestone happened
                                  outside Succera. In-app activity is recorded
                                  automatically.
                                </p>
                                <label>
                                  Milestone
                                  <select
                                    aria-label={`Record milestone for ${buyer.buyer_organization_name}`}
                                    value={
                                      milestones[buyer.buyer_organization_id] ||
                                      "ioi_received"
                                    }
                                    onChange={(event) =>
                                      setMilestones((current) => ({
                                        ...current,
                                        [buyer.buyer_organization_id]:
                                          event.target.value,
                                      }))
                                    }
                                  >
                                    <option value="cim_shared">
                                      CIM shared
                                    </option>
                                    <option value="ioi_received">
                                      IOI received
                                    </option>
                                    <option value="exclusive">Exclusive</option>
                                    <option value="closed">Closed</option>
                                  </select>
                                </label>
                                <button
                                  type="button"
                                  className="button button-green"
                                  disabled={busy}
                                  onClick={() => void recordMilestone(buyer)}
                                >
                                  Record milestone
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <Empty
          title="No buyers match these filters"
          body="Clear the search or stage filter to see the complete funnel."
        />
      )}
    </section>
  );
}

function IntroductionRequests({ deal }: { deal: Deal }) {
  const { data, act, busy } = useWorkspace();
  const requests = data.introduction_requests.filter(
    (request) => request.deal_id === deal.id,
  );
  return (
    <section
      className="introduction-workbench"
      aria-labelledby="introduction-requests-title"
    >
      <div className="recommendation-header">
        <div>
          <p className="eyebrow">SELLER CONTROLLED</p>
          <h2 id="introduction-requests-title">Introduction requests</h2>
          <p>
            Review the buyer’s matched mandate and credibility statement before
            moving them into NDA and deal access.
          </p>
        </div>
        <span className="recommendation-count">
          {requests.filter((request) => request.status === "pending").length}{" "}
          pending
        </span>
      </div>
      {requests.length ? (
        <div className="introduction-list">
          {requests.map((request) => (
            <article className="introduction-card" key={request.id}>
              <div className="introduction-card-header">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3>{request.buyer_organization_name}</h3>
                    <Status value={request.status} />
                    <Status
                      value={request.buyer_organization_verification_status}
                    />
                  </div>
                  <p>
                    {request.buyer_project_name} · Requested by{" "}
                    {request.requested_by_user_name}
                  </p>
                </div>
                <div className="introduction-score">
                  <strong>{request.match_score}%</strong>
                  <span>match</span>
                </div>
              </div>
              <div className="introduction-proof">
                <span>
                  <ShieldCheck size={15} />
                  {isFirmVerified(
                    request.buyer_organization_verification_status,
                  )
                    ? "Verified firm"
                    : "Verification pending"}
                </span>
                <span>
                  <Handshake size={15} />
                  {request.relevant_acquisitions} relevant previous{" "}
                  {request.relevant_acquisitions === 1
                    ? "acquisition"
                    : "acquisitions"}
                </span>
              </div>
              <blockquote>{request.message}</blockquote>
              <div className="match-ledger seller-match-ledger">
                <strong>Why this buyer matched</strong>
                <div>
                  {request.match_reasons.map((reason) => (
                    <span key={reason}>
                      <Check size={13} />
                      {matchDimensionLabel(reason)}
                    </span>
                  ))}
                </div>
              </div>
              {request.status === "pending" && (
                <div className="introduction-actions">
                  <button
                    className="button button-green"
                    disabled={busy}
                    onClick={() =>
                      void act("reviewIntroduction", {
                        deal_id: deal.id,
                        introduction_request_id: request.id,
                        status: "approved",
                      })
                    }
                  >
                    <Check size={16} />
                    Approve introduction
                  </button>
                  <button
                    className="button button-quiet"
                    disabled={busy}
                    onClick={() =>
                      void act("reviewIntroduction", {
                        deal_id: deal.id,
                        introduction_request_id: request.id,
                        status: "declined",
                      })
                    }
                  >
                    <X size={16} />
                    Decline
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="No introduction requests yet"
          body="Eligible buyers can request an introduction only after this mandate is published in Qualified Discovery."
        />
      )}
    </section>
  );
}

function PrivateOutreachPanel({
  deal,
  outreach,
}: {
  deal: Deal;
  outreach: DealOutreachRecipient;
}) {
  const { act, busy } = useWorkspace();
  const responseRecorded = ["pursued", "passed"].includes(outreach.status);
  return (
    <section
      className="private-invitation"
      aria-labelledby="private-invitation-title"
    >
      <div className="private-invitation-kicker">
        <span>NEW OPPORTUNITY</span>
        <Status value={outreach.status} />
      </div>
      <h2 id="private-invitation-title">{outreach.subject}</h2>
      <p>{outreach.message}</p>
      <dl>
        <div>
          <dt>Matched to</dt>
          <dd>{outreach.buyer_project_name}</dd>
        </div>
        <div>
          <dt>Profile</dt>
          <dd>
            {deal.sector} · {deal.province}
          </dd>
        </div>
        <div>
          <dt>Annual revenue</dt>
          <dd>{money(deal.revenue, false)}</dd>
        </div>
      </dl>
      {responseRecorded ? (
        <p className="private-invitation-response">
          {outreach.status === "pursued"
            ? "Interest recorded. The deal team will review your request before confidential information is released."
            : "Pass recorded. This opportunity will remain in your history."}
        </p>
      ) : (
        <div className="private-invitation-actions">
          <button
            type="button"
            className="button button-green"
            disabled={busy}
            onClick={() =>
              act("respondToOutreach", {
                deal_id: deal.id,
                recipient_id: outreach.id,
                response: "interested",
              })
            }
          >
            <Handshake size={16} /> I’m interested
          </button>
          <button
            type="button"
            className="button button-quiet"
            disabled={busy}
            onClick={() =>
              act("respondToOutreach", {
                deal_id: deal.id,
                recipient_id: outreach.id,
                response: "pass",
              })
            }
          >
            Pass
          </button>
        </div>
      )}
    </section>
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
                          {d.watermark_enabled
                            ? " · Personalized for each buyer"
                            : ""}
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
    [error, setError] = useState(""),
    [category, setCategory] = useState(deal.has_access ? "Financials" : "NDA"),
    [audience, setAudience] = useState("team"),
    [watermarkEnabled, setWatermarkEnabled] = useState(false);
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
              setCategory(deal.has_access ? "Financials" : "NDA");
              setAudience("team");
              setWatermarkEnabled(false);
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
            <label>
              Category
              <select
                name="category"
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value);
                  if (event.target.value !== "Company overview")
                    setWatermarkEnabled(false);
                }}
              >
                {(deal.has_access
                  ? [
                      "Financials",
                      "Company overview",
                      "NDA",
                      "LOI",
                      "Legal",
                      "Other",
                    ]
                  : ["NDA"]
                ).map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
            {deal.can_manage && (
              <>
                <label>
                  Visibility
                  <select
                    name="audience"
                    value={audience}
                    onChange={(event) => {
                      setAudience(event.target.value);
                      if (event.target.value === "team")
                        setWatermarkEnabled(false);
                    }}
                  >
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
            {deal.can_manage &&
              category === "Company overview" &&
              audience !== "team" && (
                <label className="checkbox-label watermark-option full">
                  <input
                    type="checkbox"
                    name="watermark_enabled"
                    value="true"
                    checked={watermarkEnabled}
                    onChange={(event) =>
                      setWatermarkEnabled(event.target.checked)
                    }
                  />
                  <span>
                    <strong>Personalize every buyer’s PDF download</strong>
                    <small>
                      Adds the buyer’s firm, email, download date and Succera
                      transaction reference. The uploaded original stays
                      unchanged.
                    </small>
                  </span>
                </label>
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

function RecommendedBuyers({ deal }: { deal: Deal }) {
  const { data, act, busy } = useWorkspace();
  const [organizationType, setOrganizationType] = useState("");
  const [province, setProvince] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [experiencedOnly, setExperiencedOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("score-desc");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const matches = (data.deal_matches || []).filter(
    (match) => match.deal_id === deal.id,
  );
  const organizationTypes = Array.from(
    new Set(matches.map((match) => match.buyer_organization_type)),
  ).sort();
  const provinces = Array.from(
    new Set(
      matches.map((match) => match.buyer_organization_province).filter(Boolean),
    ),
  ).sort();
  const recommendations = matches
    .filter(
      (match) =>
        (!organizationType ||
          match.buyer_organization_type === organizationType) &&
        (!province || match.buyer_organization_province === province) &&
        (!verifiedOnly ||
          isFirmVerified(match.buyer_organization_verification_status)) &&
        (!experiencedOnly || match.relevant_acquisitions > 0) &&
        (statusFilter === "all" ||
          (statusFilter === "active"
            ? match.status !== "excluded"
            : match.status === statusFilter)),
    )
    .sort((left, right) => {
      if (sort === "score-asc") return left.score - right.score;
      if (sort === "name")
        return left.buyer_organization_name.localeCompare(
          right.buyer_organization_name,
        );
      return right.score - left.score;
    });
  const activeCount = matches.filter(
    (match) => match.eligible && match.status !== "excluded",
  ).length;
  const selectedCount = matches.filter(
    (match) => match.status === "selected",
  ).length;
  const selectedMatches = matches.filter(
    (match) => match.status === "selected" && match.eligible,
  );
  const outreach = data.deal_outreach.filter(
    (recipient) => recipient.deal_id === deal.id,
  );
  const updateStatus = async (
    matchIds: string[],
    status: DealMatch["status"],
  ) => {
    const result = await act("updateDealMatchStatus", {
      deal_id: deal.id,
      match_ids: matchIds,
      status,
    });
    if (result)
      setChosen((current) => {
        const next = new Set(current);
        matchIds.forEach((id) => next.delete(id));
        return next;
      });
  };
  const toggleChosen = (id: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!deal.can_manage) return null;
  return (
    <section className="recommendations" aria-labelledby="recommended-title">
      <div className="recommendations-heading">
        <div>
          <p className="eyebrow">SELL-SIDE WORKBENCH</p>
          <h2 id="recommended-title">Recommended buyers</h2>
          <p>
            Ranked acquisition mandates for {deal.title}. Selecting a buyer does
            not grant access or reveal confidential deal information.
          </p>
        </div>
        <dl className="recommendation-counts">
          <div>
            <dt>Active</dt>
            <dd>{activeCount}</dd>
          </div>
          <div>
            <dt>Selected</dt>
            <dd>{selectedCount}</dd>
          </div>
        </dl>
      </div>

      <div className="recommendation-controls">
        <label>
          Buyer type
          <select
            value={organizationType}
            onChange={(event) => setOrganizationType(event.target.value)}
          >
            <option value="">All buyer types</option>
            {organizationTypes.map((type) => (
              <option value={type} key={type}>
                {ORGANIZATION_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Geography
          <select
            value={province}
            onChange={(event) => setProvince(event.target.value)}
          >
            <option value="">All provinces</option>
            {provinces.map((value) => (
              <option value={value} key={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="active">Active recommendations</option>
            <option value="selected">Selected</option>
            <option value="excluded">Excluded</option>
            <option value="contacted">Contacted</option>
          </select>
        </label>
        <label>
          Sort
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="score-desc">Match score: high to low</option>
            <option value="score-asc">Match score: low to high</option>
            <option value="name">Buyer name</option>
          </select>
        </label>
        <div className="recommendation-toggles">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(event) => setVerifiedOnly(event.target.checked)}
            />
            Verified only
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={experiencedOnly}
              onChange={(event) => setExperiencedOnly(event.target.checked)}
            />
            Relevant experience
          </label>
        </div>
      </div>

      <div className="recommendation-batchbar">
        <p>
          <strong>{recommendations.length}</strong> shown · {chosen.size} chosen
        </p>
        <button
          type="button"
          className="button button-green button-small"
          disabled={busy || chosen.size === 0}
          onClick={() => updateStatus(Array.from(chosen), "selected")}
        >
          <Check size={15} /> Select chosen ({chosen.size})
        </button>
      </div>

      <DistributionDocket
        deal={deal}
        selectedMatches={selectedMatches}
        outreach={outreach}
      />

      <div className="recommendation-list">
        {recommendations.map((match, index) => (
          <BuyerRecommendation
            key={match.id}
            match={match}
            rank={index + 1}
            checked={chosen.has(match.id)}
            busy={busy}
            onToggle={() => toggleChosen(match.id)}
            onStatus={(status) => updateStatus([match.id], status)}
          />
        ))}
        {!recommendations.length && (
          <div className="panel">
            <Empty
              title="No buyers match these filters"
              body="Clear a filter to return to the complete recommendation set."
            />
          </div>
        )}
      </div>
    </section>
  );
}

function DistributionDocket({
  deal,
  selectedMatches,
  outreach,
}: {
  deal: Deal;
  selectedMatches: DealMatch[];
  outreach: DealOutreachRecipient[];
}) {
  const { act, busy } = useWorkspace();
  const [subject, setSubject] = useState(
    "Private Canadian acquisition opportunity",
  );
  const [message, setMessage] = useState(
    "We are representing a Canadian business that appears to fit your acquisition criteria. Review the confidential teaser and let us know whether you would like to pursue the opportunity.",
  );
  const [preview, setPreview] = useState(false);
  const share = () =>
    act("shareTeaser", {
      deal_id: deal.id,
      match_ids: selectedMatches.map((match) => match.id),
      subject,
      message,
    });
  return (
    <section
      className="distribution-docket"
      aria-labelledby="distribution-title"
    >
      <div className="distribution-docket-head">
        <div>
          <p className="eyebrow">CONTROLLED CIRCULATION</p>
          <h3 id="distribution-title">Share teaser</h3>
          <p>
            {selectedMatches.length} buyer project
            {selectedMatches.length === 1 ? "" : "s"} selected. Only these
            organizations will receive the opportunity.
          </p>
        </div>
        <span className="distribution-count">{selectedMatches.length}</span>
      </div>
      {selectedMatches.length ? (
        <>
          <div
            className="distribution-recipients"
            aria-label="Selected recipients"
          >
            {selectedMatches.map((match) => (
              <span key={match.id}>
                <Building2 size={14} /> {match.buyer_organization_name} ·{" "}
                {match.buyer_project_name}
              </span>
            ))}
          </div>
          <div className="distribution-compose">
            <label>
              Subject
              <input
                value={subject}
                maxLength={200}
                onChange={(event) => setSubject(event.target.value)}
              />
            </label>
            <label>
              Message
              <textarea
                value={message}
                maxLength={5000}
                onChange={(event) => setMessage(event.target.value)}
              />
            </label>
          </div>
          {preview && (
            <div className="distribution-preview">
              <span>BUYER PREVIEW</span>
              <strong>{subject}</strong>
              <p>{message}</p>
              <small>
                {deal.sector} · {deal.province} · {money(deal.revenue, false)}{" "}
                revenue
              </small>
            </div>
          )}
          <div className="distribution-actions">
            <button
              type="button"
              className="button button-quiet"
              onClick={() => setPreview((current) => !current)}
            >
              <FileText size={16} />{" "}
              {preview ? "Hide preview" : "Preview outreach"}
            </button>
            <button
              type="button"
              className="button button-green"
              disabled={busy || !subject.trim() || !message.trim()}
              onClick={share}
            >
              <Send size={16} /> Share teaser
            </button>
          </div>
        </>
      ) : (
        <p className="distribution-empty">
          Select eligible recommendations below to prepare a private outreach.
        </p>
      )}
      {!!outreach.length && (
        <div className="distribution-ledger">
          <h4>Outreach activity</h4>
          {outreach.map((recipient) => (
            <div key={recipient.id}>
              <span>
                <strong>{recipient.buyer_organization_name}</strong>
                <small>{recipient.buyer_project_name}</small>
              </span>
              <span>
                <Status value={recipient.status} />
                <small>
                  {recipient.pursued_at
                    ? `Pursued ${dateLabel(recipient.pursued_at)}`
                    : recipient.passed_at
                      ? `Passed ${dateLabel(recipient.passed_at)}`
                      : recipient.viewed_at
                        ? `Viewed ${dateLabel(recipient.viewed_at)}`
                        : recipient.sent_at
                          ? `Sent ${dateLabel(recipient.sent_at)}`
                          : "Queued"}
                </small>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function BuyerRecommendation({
  match,
  rank,
  checked,
  busy,
  onToggle,
  onStatus,
}: {
  match: DealMatch;
  rank: number;
  checked: boolean;
  busy: boolean;
  onToggle: () => void;
  onStatus: (status: DealMatch["status"]) => void;
}) {
  const selectable = match.status !== "excluded" && !!match.eligible;
  const positiveReasons = match.score_breakdown.reasons.filter(
    (reason) => reason.score > 0,
  );
  const primaryProject = match.buyer_firm_profile.active_projects.find(
    (project) => project.id === match.buyer_project_id,
  );
  const reputation = match.buyer_firm_profile.reputation;
  const responseSampleLabel = reputation.response_opportunities
    ? `${reputation.response_opportunities} private invitation${reputation.response_opportunities === 1 ? "" : "s"}`
    : "No private invitations yet";
  return (
    <article
      className={cn(
        "recommendation-card",
        match.status === "excluded" && "recommendation-card-excluded",
      )}
    >
      <div className="recommendation-rank" aria-label={`Rank ${rank}`}>
        {rank.toString().padStart(2, "0")}
      </div>
      <div className="recommendation-content">
        <div className="recommendation-card-head">
          <label className="recommendation-select">
            <input
              type="checkbox"
              checked={checked}
              disabled={!selectable || busy}
              onChange={onToggle}
              aria-label={`Select ${match.buyer_organization_name} — ${match.buyer_project_name}`}
            />
            <span className="firm-avatar">
              {initials(match.buyer_organization_name)}
            </span>
            <span>
              <strong>{match.buyer_organization_name}</strong>
              <small>{match.buyer_project_name}</small>
            </span>
          </label>
          <div className="recommendation-score">
            <strong>{match.score}% match</strong>
            <Status value={match.status} />
          </div>
        </div>

        <div className="recommendation-meta">
          <span>
            <Building2 size={14} />
            {ORGANIZATION_TYPE_LABELS[match.buyer_organization_type]}
          </span>
          <span>
            <MapPin size={14} />
            {match.buyer_organization_province || "Canada"}
          </span>
          {isFirmVerified(match.buyer_organization_verification_status) && (
            <span>
              <ShieldCheck size={14} /> Verified
            </span>
          )}
          <span>
            <Handshake size={14} /> {match.relevant_acquisitions} relevant
            acquisition{match.relevant_acquisitions === 1 ? "" : "s"}
          </span>
        </div>

        <div className="recommendation-fit">
          {positiveReasons.slice(0, 6).map((reason) => (
            <span key={reason.dimension}>
              <Check size={14} /> {matchDimensionLabel(reason.dimension)}
            </span>
          ))}
        </div>

        {!match.eligible &&
          match.score_breakdown.hard_exclusions.length > 0 && (
            <div className="recommendation-warning">
              {match.score_breakdown.hard_exclusions.join(" ")}
            </div>
          )}

        <div className="recommendation-disclosures">
          <details>
            <summary>View profile</summary>
            <div className="buyer-profile-sheet">
              <div className="buyer-profile-intro">
                <p>
                  {match.buyer_organization_description ||
                    "No firm description has been added."}
                </p>
                {match.buyer_organization_website && (
                  <a
                    href={match.buyer_organization_website}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Visit firm website <ArrowUpRight size={14} />
                  </a>
                )}
              </div>

              <section>
                <h4>Acquisition criteria</h4>
                {primaryProject ? (
                  <dl className="buyer-profile-facts">
                    <div>
                      <dt>Revenue</dt>
                      <dd>
                        {projectRange(
                          primaryProject.min_revenue,
                          primaryProject.max_revenue,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>EBITDA</dt>
                      <dd>
                        {projectRange(
                          primaryProject.min_ebitda,
                          primaryProject.max_ebitda,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Industries</dt>
                      <dd>
                        {primaryProject.sectors.join(", ") || "All industries"}
                      </dd>
                    </div>
                    <div>
                      <dt>Geography</dt>
                      <dd>{primaryProject.provinces.join(", ") || "Canada"}</dd>
                    </div>
                    <div>
                      <dt>Transaction</dt>
                      <dd>
                        {projectTransactionLabel(
                          primaryProject.transaction_type,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Ownership</dt>
                      <dd>
                        {projectOwnershipLabel(
                          primaryProject.ownership_preference,
                        )}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p>No active project criteria are available.</p>
                )}
              </section>

              <section>
                <h4>Capital</h4>
                <dl className="buyer-profile-facts">
                  <div>
                    <dt>Fund structure</dt>
                    <dd>
                      {match.buyer_firm_profile.fund_structure ||
                        "Not provided"}
                    </dd>
                  </div>
                  <div>
                    <dt>Typical equity cheque</dt>
                    <dd>
                      {primaryProject
                        ? projectRange(
                            primaryProject.min_equity_check,
                            primaryProject.max_equity_check,
                          )
                        : "Not specified"}
                    </dd>
                  </div>
                  <div className="full">
                    <dt>Financing profile</dt>
                    <dd>
                      {match.buyer_firm_profile.financing_profile ||
                        "Not provided"}
                    </dd>
                  </div>
                </dl>
              </section>

              <section>
                <h4>Experience</h4>
                <dl className="buyer-profile-facts">
                  <div>
                    <dt>Completed acquisitions</dt>
                    <dd>
                      {match.buyer_firm_profile
                        .self_reported_acquisition_count === null ? (
                        "Not provided"
                      ) : (
                        <>
                          {
                            match.buyer_firm_profile
                              .self_reported_acquisition_count
                          }{" "}
                          <small>self-reported</small>
                        </>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Relevant sector acquisitions</dt>
                    <dd>
                      {match.relevant_acquisitions}{" "}
                      <small>recorded on Succera</small>
                    </dd>
                  </div>
                </dl>
              </section>

              <section>
                <h4>Marketplace reputation</h4>
                <dl className="buyer-profile-facts buyer-reputation-metrics">
                  <div>
                    <dt>Response rate</dt>
                    <dd>
                      {funnelRate(reputation.response_rate)}
                      <small> {responseSampleLabel}</small>
                    </dd>
                  </div>
                  <div>
                    <dt>Median response</dt>
                    <dd>
                      {responseTimeLabel(reputation.median_response_hours)}
                    </dd>
                  </div>
                  <div>
                    <dt>Opportunities pursued</dt>
                    <dd>{reputation.opportunities_pursued}</dd>
                  </div>
                  <div>
                    <dt>LOIs submitted</dt>
                    <dd>{reputation.lois_submitted}</dd>
                  </div>
                  <div>
                    <dt>Verified transactions</dt>
                    <dd>{reputation.transactions_closed}</dd>
                  </div>
                  <div>
                    <dt>Relevant transactions</dt>
                    <dd>
                      {reputation.relevant_transactions}{" "}
                      <small>verified in this sector</small>
                    </dd>
                  </div>
                </dl>
                <p className="buyer-reputation-note">
                  Derived from recorded Succera marketplace activity and
                  verified transaction history. Informational only and not
                  included in the match score.
                </p>
              </section>

              <section>
                <h4>Closed transaction history</h4>
                {match.buyer_firm_profile.closed_transactions.length ? (
                  <TransactionTombstones
                    transactions={match.buyer_firm_profile.closed_transactions}
                  />
                ) : (
                  <p>No closed transaction records have been added.</p>
                )}
              </section>

              <section>
                <h4>Active acquisition projects</h4>
                {match.buyer_firm_profile.active_projects.length ? (
                  <div className="buyer-profile-projects">
                    {match.buyer_firm_profile.active_projects.map((project) => (
                      <div key={project.id}>
                        <strong>{project.name}</strong>
                        <span>
                          {project.sectors.join(", ") || "All industries"} ·{" "}
                          {project.provinces.join(", ") || "Canada"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>No active matched projects are available.</p>
                )}
              </section>

              <section>
                <h4>Matched mandate</h4>
                <p>{match.buyer_project_thesis || "No thesis provided."}</p>
              </section>
              <p className="buyer-profile-disclaimer">
                Firm experience is self-reported unless identified as a Succera
                marketplace record. Profile access is limited to this matched
                sell-side team.
              </p>
            </div>
          </details>
          <details>
            <summary>Inspect match reasoning</summary>
            <div className="match-ledger">
              {match.score_breakdown.reasons.map((reason) => (
                <div key={reason.dimension}>
                  <span>
                    <strong>{matchDimensionLabel(reason.dimension)}</strong>
                    <small>{reason.explanation}</small>
                  </span>
                  <b>
                    {reason.score}/{reason.maximum}
                  </b>
                </div>
              ))}
            </div>
          </details>
        </div>

        <div className="recommendation-actions">
          {match.status === "excluded" ? (
            <button
              type="button"
              className="button button-quiet button-small"
              disabled={busy}
              onClick={() => onStatus("recommended")}
            >
              <RotateCcw size={15} /> Restore buyer
            </button>
          ) : (
            <>
              {match.status === "selected" ? (
                <button
                  type="button"
                  className="button button-quiet button-small"
                  disabled={busy}
                  onClick={() => onStatus("recommended")}
                >
                  Return to recommended
                </button>
              ) : (
                <button
                  type="button"
                  className="button button-green button-small"
                  disabled={busy || !match.eligible}
                  onClick={() => onStatus("selected")}
                >
                  <Check size={15} /> Select buyer
                </button>
              )}
              <button
                type="button"
                className="button button-quiet button-small"
                disabled={busy}
                onClick={() => onStatus("excluded")}
              >
                <X size={15} /> Exclude buyer
              </button>
            </>
          )}
        </div>
      </div>
    </article>
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
  const envelope = data.electronic_signature_envelopes.find(
    (candidate) => candidate.id === a.electronic_signature_envelope_id,
  );
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
            Use external NDA
          </button>
          {data.electronic_signature.available && (
            <button
              className="button button-quiet button-small"
              disabled={busy}
              onClick={() =>
                void act("requestElectronicNda", {
                  deal_id: deal.id,
                  buyer_id: a.buyer_id,
                })
              }
            >
              <Send size={15} /> Send electronic NDA
            </button>
          )}
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
          {a.nda_method === "electronic_signature" ? (
            <div className="nda-provider-state">
              <div className="nda-provider-heading">
                <div>
                  <strong>{electronicNdaHeading(envelope?.status)}</strong>
                  <p className="muted">
                    {envelope?.provider_name || "Electronic signature provider"}
                  </p>
                </div>
                {envelope && <Status value={envelope.status} />}
              </div>
              <p className="muted">
                Signing takes place with the provider. Succera grants access
                only after the provider verifies completion and returns the
                executed PDF.
              </p>
              <button
                type="button"
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
                Use external upload instead
              </button>
            </div>
          ) : (
            <>
              <p className="muted mb-4">
                Exchange and sign the NDA outside Succera, then upload the
                executed copy with this buyer selected.
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
                  No NDA document uploaded for this buyer yet. Add it in the
                  Data room tab.
                </p>
              )}
            </>
          )}
        </div>
      )}
      {a.status === "approved" && (
        <>
          <p className="muted mt-4 text-sm">
            NDA method:{" "}
            {a.nda_method === "electronic_signature"
              ? envelope?.provider_name || "Electronic signature"
              : "External upload and review"}
          </p>
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
        </>
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

function NotificationPreferencesPanel() {
  const { data, busy, act } = useWorkspace();
  const [preferences, setPreferences] = useState(data.notification_preferences);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!dirty && !saving) setPreferences(data.notification_preferences);
  }, [data.notification_preferences, dirty, saving]);

  return (
    <Panel title="Email notification preferences">
      <form
        className="notification-preferences"
        aria-busy={saving}
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          const result = await act("notificationPreferences", { preferences });
          if (result) {
            setDirty(false);
            setPreferences(preferences);
          }
          setSaving(false);
        }}
      >
        <div className="notification-preferences-intro">
          <span className="preference-icon">
            <Mail size={18} strokeWidth={1.7} />
          </span>
          <div>
            <strong>Choose when Succera should email you.</strong>
            <p>
              In-app notifications always remain available. This environment
              records outbound email safely until a production provider is
              configured.
            </p>
          </div>
        </div>
        <div className="notification-preference-list">
          {NOTIFICATION_TYPES.map((type) => (
            <label className="notification-preference-row" key={type}>
              <span>
                <strong>{notificationTypeLabels[type]}</strong>
                <small>{notificationTypeDescriptions[type]}</small>
              </span>
              <select
                aria-label={`Email delivery for ${notificationTypeLabels[type]}`}
                value={preferences[type]}
                disabled={saving}
                onChange={(event) =>
                  setPreferences((current) => {
                    setDirty(true);
                    return {
                      ...current,
                      [type]: event.target.value as NotificationFrequency,
                    };
                  })
                }
              >
                {NOTIFICATION_FREQUENCIES.map((frequency) => (
                  <option key={frequency} value={frequency}>
                    {notificationFrequencyLabels[frequency]}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="form-actions">
          <button className="button button-green" disabled={busy || saving}>
            {busy || saving ? <LoaderCircle size={16} /> : <Check size={16} />}
            Save notification preferences
          </button>
        </div>
      </form>
    </Panel>
  );
}

const verificationLadder = BUYER_VERIFICATION_STATUSES.filter(
  (status) => status !== "rejected",
);

function BuyerTransactionHistoryPanel() {
  const { data } = useWorkspace();
  const transactions = data.closed_transactions;
  const canManage = Boolean(data.buyer_firm_profile?.can_manage);
  return (
    <Panel title="Closed transaction history">
      <div className="panel-body">
        <div className="verification-admin-intro">
          <Handshake size={20} />
          <div>
            <strong>Build a credible acquisition record</strong>
            <p>
              Add anonymized transaction tombstones. New entries remain visibly
              self-reported until a Succera platform reviewer verifies them.
            </p>
          </div>
        </div>
        {canManage && (
          <MutationForm
            action="createClosedTransaction"
            label="Add transaction record"
            reset
          >
            <div className="form-grid">
              <Field
                label="Industry"
                name="industry"
                value=""
                help="Use a concise category; do not name the acquired company."
              />
              <SelectField
                label="Province"
                name="province"
                options={PROVINCES}
                value={data.organization.province}
              />
              <Field
                label="Enterprise value (CAD)"
                name="enterprise_value"
                type="number"
                min={0}
                max={10_000_000_000}
                required={false}
                help="Optional. Leave blank if the value is confidential."
              />
              <label>
                Closing date
                <input
                  name="closed_date"
                  type="date"
                  max={new Date().toISOString().slice(0, 10)}
                  required
                />
              </label>
              <label className="full">
                Anonymized transaction description
                <textarea
                  name="description"
                  minLength={10}
                  maxLength={2000}
                  required
                  placeholder="Majority acquisition of a Canadian recurring-revenue industrial services platform."
                />
                <span className="field-hint">
                  Exclude company, seller, advisor, customer, and financing
                  identities.
                </span>
              </label>
            </div>
          </MutationForm>
        )}
        {transactions.length ? (
          <BuyerTransactionTombstones
            transactions={transactions}
            canManage={canManage}
          />
        ) : (
          <Empty
            title="No transaction records yet"
            body={
              canManage
                ? "Add an anonymized closed transaction to begin building the firm’s history."
                : "An organization owner or administrator can add transaction history."
            }
          />
        )}
      </div>
    </Panel>
  );
}

function BuyerVerificationPanel() {
  const { data } = useWorkspace();
  const profile = data.buyer_verification_profile;
  const firmProfile = data.buyer_firm_profile;
  if (!profile) return null;
  const status = data.organization.verification_status;
  const currentIndex = verificationLadder.findIndex(
    (level) => level === status,
  );
  const underReview = Boolean(profile.submitted_at);
  return (
    <div className="verification-buyer-stack">
      {firmProfile && (
        <Panel title="Seller-facing firm profile">
          <div className="panel-body">
            <div className="verification-admin-intro">
              <Building2 size={20} />
              <div>
                <strong>Shared only with matched sell-side teams</strong>
                <p>
                  This profile helps owners and advisors assess your firm from
                  Recommended Buyers. Internal verification evidence and review
                  notes are never included.
                </p>
              </div>
            </div>
            {firmProfile.can_manage ? (
              <MutationForm
                action="updateBuyerFirmProfile"
                label="Save seller-facing profile"
                extra={{ revision: firmProfile.revision }}
              >
                <div className="form-grid">
                  <label className="full">
                    Fund structure
                    <textarea
                      name="fund_structure"
                      maxLength={2000}
                      defaultValue={firmProfile.fund_structure}
                      placeholder="Describe the capital structure sellers should understand."
                    />
                    <span className="field-hint">
                      Do not include investor names, account details, or
                      confidential fundraising information.
                    </span>
                  </label>
                  <label className="full">
                    Financing profile
                    <textarea
                      name="financing_profile"
                      maxLength={3000}
                      defaultValue={firmProfile.financing_profile}
                      placeholder="Explain how your firm typically finances acquisitions."
                    />
                  </label>
                  <Field
                    label="Completed acquisitions (self-reported)"
                    name="self_reported_acquisition_count"
                    type="number"
                    min={0}
                    max={10000}
                    required={false}
                    value={firmProfile.self_reported_acquisition_count ?? ""}
                    help="Displayed as self-reported and kept separate from platform transaction history."
                  />
                </div>
              </MutationForm>
            ) : (
              <div className="verification-evidence-sheet">
                <div className="full">
                  <span>Fund structure</span>
                  <p>{firmProfile.fund_structure || "Not provided"}</p>
                </div>
                <div className="full">
                  <span>Financing profile</span>
                  <p>{firmProfile.financing_profile || "Not provided"}</p>
                </div>
                <div>
                  <span>Completed acquisitions</span>
                  <strong>
                    {firmProfile.self_reported_acquisition_count === null
                      ? "Not provided"
                      : `${firmProfile.self_reported_acquisition_count} · self-reported`}
                  </strong>
                </div>
                <p className="notice full">
                  An organization owner or administrator must update this
                  profile.
                </p>
              </div>
            )}
          </div>
        </Panel>
      )}
      <BuyerTransactionHistoryPanel />
      <Panel title="Buyer verification">
        <div className="verification-summary">
          <div>
            <p className="eyebrow">CURRENT TRUST LEVEL</p>
            <div className="verification-status-title">
              <ShieldCheck size={24} strokeWidth={1.6} />
              <div>
                <h2>{buyerVerificationStatusLabel(status)}</h2>
                <p>
                  Qualified Discovery requires at least{" "}
                  <strong>
                    {buyerVerificationStatusLabel(
                      data.qualified_discovery_min_verification_status,
                    )}
                  </strong>
                  .
                </p>
              </div>
            </div>
          </div>
          <Status value={status} />
        </div>
        <ol className="verification-ladder" aria-label="Verification levels">
          {verificationLadder.map((level, index) => (
            <li
              key={level}
              className={cn(
                currentIndex >= index && status !== "rejected" && "complete",
                currentIndex === index && "current",
              )}
            >
              <span aria-hidden="true">
                {currentIndex >= index && status !== "rejected" ? (
                  <Check size={14} />
                ) : (
                  index + 1
                )}
              </span>
              {buyerVerificationStatusLabel(level)}
            </li>
          ))}
        </ol>
        <div
          className={cn(
            "verification-notice",
            status === "rejected" && "error",
          )}
        >
          {underReview ? (
            <>
              <Clock3 size={18} />
              <div>
                <strong>Internal review in progress</strong>
                <p>
                  Submitted {dateTimeLabel(profile.submitted_at!)}. Your current
                  trust level remains in effect until a reviewer records a
                  decision.
                </p>
              </div>
            </>
          ) : status === "rejected" ? (
            <>
              <CircleHelp size={18} />
              <div>
                <strong>Additional information is required</strong>
                <p>
                  Update the profile below and submit it again for internal
                  review.
                </p>
              </div>
            </>
          ) : (
            <>
              <CircleCheck size={18} />
              <div>
                <strong>Internal marketplace verification</strong>
                <p>
                  These levels reflect Succera onboarding checks. They are not
                  legal accreditation, a guarantee of capital, or investment
                  advice.
                </p>
              </div>
            </>
          )}
        </div>
      </Panel>

      <Panel title="Firm evidence profile">
        <div className="panel-body">
          {profile.can_manage && !underReview ? (
            <>
              <MutationForm
                action="updateBuyerVerificationProfile"
                label="Save verification profile"
              >
                <div className="form-grid">
                  <Field
                    label="Legal firm name"
                    name="legal_name"
                    value={profile.legal_name}
                  />
                  <Field
                    label="Website"
                    name="website"
                    type="url"
                    value={profile.website}
                    help="A public firm or operating-company website"
                  />
                  <label>
                    Buyer type
                    <select
                      name="buyer_type"
                      defaultValue={profile.buyer_type}
                      required
                    >
                      {BUYER_ORGANIZATION_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {ORGANIZATION_TYPE_LABELS[type]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div />
                  <label className="full">
                    Principals
                    <textarea
                      name="principals"
                      maxLength={4000}
                      defaultValue={profile.principals}
                      required
                    />
                    <span className="field-hint">
                      Names and roles of the people leading acquisitions
                    </span>
                  </label>
                  <label className="full">
                    Acquisition history
                    <textarea
                      name="acquisition_history"
                      maxLength={5000}
                      defaultValue={profile.acquisition_history}
                      required
                    />
                  </label>
                  <label className="full">
                    Capital source
                    <textarea
                      name="capital_source"
                      maxLength={3000}
                      defaultValue={profile.capital_source}
                      required
                    />
                  </label>
                  <Field
                    label="Typical minimum equity cheque (CAD)"
                    name="min_equity_check"
                    type="number"
                    min={0}
                    value={profile.min_equity_check ?? ""}
                    required={false}
                  />
                  <Field
                    label="Typical maximum equity cheque (CAD)"
                    name="max_equity_check"
                    type="number"
                    min={0}
                    value={profile.max_equity_check ?? ""}
                    required={false}
                  />
                  <label className="full">
                    Financing approach
                    <textarea
                      name="financing_approach"
                      maxLength={3000}
                      defaultValue={profile.financing_approach}
                      required
                    />
                  </label>
                </div>
              </MutationForm>
              <div className="verification-submit-row">
                <div>
                  <strong>Ready for review?</strong>
                  <p>
                    Save the latest profile first, then submit it to Succera’s
                    internal review queue.
                  </p>
                </div>
                <MutationForm
                  action="submitBuyerVerification"
                  label="Submit for internal review"
                >
                  <input type="hidden" name="confirmation" value="submit" />
                </MutationForm>
              </div>
            </>
          ) : (
            <div className="verification-evidence-sheet">
              <div>
                <span>Legal name</span>
                <strong>{profile.legal_name || "Not provided"}</strong>
              </div>
              <div>
                <span>Buyer type</span>
                <strong>{ORGANIZATION_TYPE_LABELS[profile.buyer_type]}</strong>
              </div>
              <div>
                <span>Website</span>
                <strong>{profile.website || "Not provided"}</strong>
              </div>
              <div>
                <span>Typical equity cheque</span>
                <strong>
                  {profile.min_equity_check !== null
                    ? money(profile.min_equity_check, false)
                    : "Not specified"}
                  {profile.max_equity_check !== null
                    ? ` – ${money(profile.max_equity_check, false)}`
                    : ""}
                </strong>
              </div>
              <div className="full">
                <span>Principals</span>
                <p>{profile.principals || "Not provided"}</p>
              </div>
              <div className="full">
                <span>Acquisition history</span>
                <p>{profile.acquisition_history || "Not provided"}</p>
              </div>
              <div className="full">
                <span>Capital source</span>
                <p>{profile.capital_source || "Not provided"}</p>
              </div>
              <div className="full">
                <span>Financing approach</span>
                <p>{profile.financing_approach || "Not provided"}</p>
              </div>
              {!profile.can_manage && (
                <p className="notice full">
                  An organization owner or administrator must update and submit
                  this profile.
                </p>
              )}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

function VerificationReviewQueue() {
  const { data } = useWorkspace();
  if (!data.is_platform_admin) return null;
  const queue = data.verification_admin_queue ?? [];
  const pending = queue.filter((entry) => entry.submitted_at);
  const reviews = data.verification_reviews ?? [];
  const transactionQueue = data.closed_transaction_review_queue ?? [];
  return (
    <div className="verification-admin-stack">
      <Panel title={`Internal review queue · ${pending.length}`}>
        <div className="verification-admin-intro">
          <ShieldCheck size={20} />
          <div>
            <strong>Platform-reviewer access</strong>
            <p>
              Decisions here control Qualified Discovery eligibility. They do
              not represent legal accreditation or guarantee available capital.
            </p>
          </div>
        </div>
        {pending.length ? (
          <div className="verification-review-list">
            {pending.map((entry) => (
              <article
                className="verification-review-card"
                key={entry.organization_id}
              >
                <header>
                  <div>
                    <p className="eyebrow">SUBMITTED BUYER</p>
                    <h3>{entry.organization_name}</h3>
                    <p>
                      {ORGANIZATION_TYPE_LABELS[entry.buyer_type]} ·{" "}
                      {entry.province || "Canada"}
                    </p>
                  </div>
                  <Status value={entry.verification_status} />
                </header>
                <div className="verification-review-grid">
                  <div>
                    <span>Legal firm name</span>
                    <strong>{entry.legal_name}</strong>
                  </div>
                  <div>
                    <span>Website</span>
                    <a href={entry.website} target="_blank" rel="noreferrer">
                      {entry.website}
                    </a>
                  </div>
                  <div className="full">
                    <span>Principals</span>
                    <p>{entry.principals}</p>
                  </div>
                  <div className="full">
                    <span>Acquisition history</span>
                    <p>{entry.acquisition_history}</p>
                  </div>
                  <div className="full">
                    <span>Capital source</span>
                    <p>{entry.capital_source}</p>
                  </div>
                  <div className="full">
                    <span>Financing approach</span>
                    <p>{entry.financing_approach}</p>
                  </div>
                </div>
                <MutationForm
                  action="reviewBuyerVerification"
                  extra={{
                    organization_id: entry.organization_id,
                    submission_revision: entry.submission_revision,
                  }}
                  label="Record verification decision"
                >
                  <input
                    type="hidden"
                    name="submission_revision"
                    value={entry.submission_revision}
                  />
                  <div className="form-grid verification-decision-form">
                    <label>
                      Decision
                      <select name="decision" defaultValue="firm_verified">
                        {BUYER_VERIFICATION_STATUSES.filter(
                          (status) => status !== "unverified",
                        ).map((status) => (
                          <option key={status} value={status}>
                            {buyerVerificationStatusLabel(status)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="full">
                      Internal review notes
                      <textarea
                        name="notes"
                        minLength={3}
                        maxLength={5000}
                        required
                      />
                    </label>
                  </div>
                </MutationForm>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title="No buyer profiles await review"
            body="Submitted buyer evidence will appear here for an internal decision."
          />
        )}
      </Panel>
      <Panel title={`Transaction history review · ${transactionQueue.length}`}>
        <div className="verification-admin-intro">
          <Handshake size={20} />
          <div>
            <strong>Verify the record, not the marketing claim</strong>
            <p>
              Confirm supporting evidence outside this profile before marking a
              self-reported transaction as Succera verified.
            </p>
          </div>
        </div>
        {transactionQueue.length ? (
          <div className="verification-review-list">
            {transactionQueue.map((transaction) => (
              <article
                className="verification-review-card"
                key={transaction.id}
              >
                <header>
                  <div>
                    <p className="eyebrow">SELF-REPORTED TRANSACTION</p>
                    <h3>{transaction.buyer_organization_name}</h3>
                    <p>
                      Submitted by {transaction.submitted_by_name || "Unknown"}{" "}
                      · {closedDateLabel(transaction.closed_date)}
                    </p>
                  </div>
                  <Status value={transaction.verification_label} />
                </header>
                <div className="verification-review-grid">
                  <div>
                    <span>Industry</span>
                    <strong>{transaction.industry}</strong>
                  </div>
                  <div>
                    <span>Province</span>
                    <strong>{transaction.province}</strong>
                  </div>
                  <div>
                    <span>Enterprise value</span>
                    <strong>
                      {transaction.enterprise_value === null
                        ? "Not disclosed"
                        : money(transaction.enterprise_value, false)}
                    </strong>
                  </div>
                  <div>
                    <span>Closed</span>
                    <strong>{closedDateLabel(transaction.closed_date)}</strong>
                  </div>
                  <div className="full">
                    <span>Anonymized description</span>
                    <p>{transaction.description}</p>
                  </div>
                </div>
                <MutationForm
                  action="verifyClosedTransaction"
                  extra={{ transaction_id: transaction.id }}
                  label="Mark as Succera verified"
                >
                  <p className="notice">
                    This records platform review. It is not legal accreditation,
                    valuation confirmation, or investment advice.
                  </p>
                </MutationForm>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title="No transaction records await review"
            body="New self-reported tombstones will appear here for platform verification."
          />
        )}
      </Panel>
      <Panel title="Recent verification decisions">
        {reviews.length ? (
          <div className="verification-history">
            {reviews.map((review) => {
              return (
                <article key={review.id}>
                  <div>
                    <strong>{review.organization_name}</strong>
                    <span>{review.notes}</span>
                  </div>
                  <div>
                    <Status value={review.decision} />
                    <small>
                      {review.reviewer_name} ·{" "}
                      {dateTimeLabel(review.created_at)}
                    </small>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <Empty
            title="No verification decisions yet"
            body="Completed internal reviews will be recorded here."
          />
        )}
      </Panel>
    </div>
  );
}

function VerificationPage() {
  const { data } = useWorkspace();
  const hasBuyerProfile = Boolean(data.buyer_verification_profile);
  if (!hasBuyerProfile && !data.is_platform_admin)
    return (
      <Empty
        title="Buyer organization required"
        body="Verification profiles are available to eligible buyer organizations."
        href="/app/settings"
        label="Review firm settings"
      />
    );
  return (
    <>
      <Heading
        eyebrow={data.is_platform_admin ? "TRUST & SAFETY" : "BUYER ONBOARDING"}
        title={
          data.is_platform_admin && !hasBuyerProfile
            ? "Review buyer credibility."
            : "Build buyer credibility."
        }
        description="Collect consistent firm evidence and keep Qualified Discovery limited to reviewed buyers."
      />
      {hasBuyerProfile && <BuyerVerificationPanel />}
      {data.is_platform_admin && <VerificationReviewQueue />}
    </>
  );
}

function PublicNetworkProfilePanel() {
  const { data } = useWorkspace();
  const { organization, public_network_profile: profile } = data;
  if (!profile) return null;
  const eligible =
    organization.organization_type === "advisor" ||
    buyerOrganizationTypes.has(organization.organization_type);
  const previewPath =
    organization.organization_type === "advisor"
      ? `/advisors/${organization.slug}`
      : `/buyers/${organization.slug}`;
  return (
    <Panel title="Public network profile">
      <div className="panel-body">
        {!eligible ? (
          <div className="public-settings-private-note">
            <strong>Operating businesses stay private.</strong>
            <p>
              Public network profiles are currently available to acquisition
              firms and M&A advisors. Sell-side mandates and active company
              identities remain inside controlled workspaces.
            </p>
          </div>
        ) : profile.can_manage ? (
          <MutationForm
            action="updatePublicNetworkProfile"
            label="Save public profile"
            extra={{ revision: profile.revision }}
          >
            <div className="public-settings-intro">
              <div>
                <p className="public-network-eyebrow">OPT-IN DISCOVERY</p>
                <strong>Choose what your firm makes discoverable.</strong>
                <p>
                  Your firm name becomes public only when you opt in. Active
                  deals, buyer mandates, and confidential documents are never
                  listed here.
                </p>
              </div>
              <label className="public-toggle">
                <input
                  type="checkbox"
                  name="is_public"
                  defaultChecked={profile.is_public}
                />
                <span>Publish profile to the public network</span>
              </label>
            </div>
            <div className="form-grid">
              <Field
                label="Public headline"
                name="headline"
                value={profile.headline}
                required={false}
                help="One concise sentence buyers or advisors should see first."
              />
              <label className="full">
                Public description
                <textarea
                  name="public_description"
                  maxLength={4000}
                  defaultValue={profile.public_description}
                  placeholder="Describe your acquisition focus or advisory practice without confidential mandates."
                />
              </label>
              <MultiSelectField
                label="Industries"
                name="industries"
                options={SECTORS}
                values={profile.industries}
                help="Choose the public categories that best describe your work."
              />
              <MultiSelectField
                label="Locations"
                name="locations"
                options={[...PROVINCES]}
                values={profile.locations}
                help="Only selected provinces appear in public directories."
              />
            </div>
            <div className="public-settings-options">
              <label className="public-checkbox-option">
                <input
                  type="checkbox"
                  name="show_website"
                  defaultChecked={profile.show_website}
                />
                <span>
                  <strong>Display external link publicly</strong>
                  <small>Link to the website in your public profile.</small>
                </span>
              </label>
              <label className="public-checkbox-option">
                <input
                  type="checkbox"
                  name="show_province"
                  defaultChecked={profile.show_province}
                />
                <span>
                  <strong>Display location publicly</strong>
                  <small>Use your firm province in public profile cards.</small>
                </span>
              </label>
              {organization.organization_type !== "advisor" && (
                <label className="public-checkbox-option">
                  <input
                    type="checkbox"
                    name="show_verified_transactions"
                    defaultChecked={profile.show_verified_transactions}
                  />
                  <span>
                    <strong>Show verified transactions</strong>
                    <small>
                      Publish only records you explicitly opt in below.
                    </small>
                  </span>
                </label>
              )}
            </div>
            <p className="notice">
              Public pages are informational only. Review every field for
              privacy before publishing; a public profile does not expose active
              deals.
            </p>
          </MutationForm>
        ) : (
          <div className="public-settings-private-note">
            <strong>
              {profile.is_public
                ? "Public profile is enabled"
                : "Public profile is private"}
            </strong>
            <p>
              Only organization owners and administrators can change public
              network settings. Your firm’s approved public content remains
              separate from confidential deal-room data.
            </p>
          </div>
        )}
        {eligible && profile.is_public && (
          <Link className="public-settings-preview" href={previewPath}>
            Preview public profile <ArrowUpRight size={15} />
          </Link>
        )}
      </div>
    </Panel>
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
          <NotificationPreferencesPanel />
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
          <PublicNetworkProfilePanel />
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
                Billing, live email delivery, independent identity and capital
                verification, team invitations, and electronic signatures are
                not connected in this release.
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

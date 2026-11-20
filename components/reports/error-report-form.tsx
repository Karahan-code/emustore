"use client";

import { useState, type FormEvent } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { PLATFORM_CATALOG_IDS, type PlatformCatalogId } from "@/lib/catalog/platforms";
import type { Locale } from "@/lib/catalog/types";
import type { Messages } from "@/lib/i18n/dictionaries";
import { APP_VERSION } from "@/lib/app-info";

const REPORT_CATEGORIES = ["bug", "compatibility", "installation", "content", "other"] as const;
type ReportCategory = (typeof REPORT_CATEGORIES)[number];
type ReportStatusKey = "sent202" | "localValidation" | "validation400" | "unavailable503" | "delivery502" | "networkError" | "unexpectedError";
type ReportResult = { status: number | null; key: ReportStatusKey };

type ErrorReportFormProps = {
  locale: Locale;
  messages: Messages;
  initialItemSlug: string;
  initialPlatform: PlatformCatalogId | "";
};

export function ErrorReportForm({
  locale,
  messages,
  initialItemSlug,
  initialPlatform,
}: ErrorReportFormProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [category, setCategory] = useState<ReportCategory>("bug");
  const [message, setMessage] = useState("");
  const [steps, setSteps] = useState("");
  const [itemSlug, setItemSlug] = useState(initialItemSlug);
  const [platform, setPlatform] = useState<PlatformCatalogId | "">(initialPlatform);
  const [contactEmail, setContactEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<ReportResult | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);

    if (message.trim().length < 5) {
      setResult({ status: null, key: "localValidation" });
      return;
    }

    const query = searchParams.toString();
    const currentRoute = query ? `${pathname}?${query}` : pathname;
    const payload = {
      category,
      message: message.trim(),
      locale,
      route: currentRoute,
      clientVersion: APP_VERSION,
      ...(steps.trim() ? { steps: steps.trim() } : {}),
      ...(itemSlug.trim() ? { itemSlug: itemSlug.trim() } : {}),
      ...(platform ? { platform } : {}),
      ...(contactEmail.trim() ? { contactEmail: contactEmail.trim() } : {}),
    };

    setIsSending(true);
    try {
      const response = await fetch("/api/v1/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.status === 202) setResult({ status: 202, key: "sent202" });
      else if (response.status === 400) setResult({ status: 400, key: "validation400" });
      else if (response.status === 502) setResult({ status: 502, key: "delivery502" });
      else if (response.status === 503) setResult({ status: 503, key: "unavailable503" });
      else setResult({ status: response.status, key: "unexpectedError" });
    } catch {
      setResult({ status: null, key: "networkError" });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="report-form-panel" aria-labelledby="report-form-heading">
      <div className="report-form-panel__meta">
        <h2 className="sr-only" id="report-form-heading">{messages.reports.title}</h2>
        <span className="report-version">v{APP_VERSION}</span>
      </div>

      <form className="report-form" onSubmit={submit} aria-busy={isSending}>
        <label className="report-field" htmlFor="report-category">
          <span>{messages.reports.category}</span>
          <select id="report-category" value={category} onChange={(event) => setCategory(event.target.value as ReportCategory)}>
            {REPORT_CATEGORIES.map((value) => (
              <option value={value} key={value}>{messages.reports.categories[value]}</option>
            ))}
          </select>
        </label>

        <label className="report-field report-field--wide" htmlFor="report-message">
          <span>{messages.reports.message}</span>
          <textarea
            id="report-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={messages.reports.messagePlaceholder}
            minLength={5}
            maxLength={4_000}
            required
            rows={5}
            aria-describedby="report-message-help"
          />
          <small id="report-message-help">{messages.reports.messageHelp} · {message.length}/4000</small>
        </label>

        <label className="report-field report-field--wide" htmlFor="report-steps">
          <span>{messages.reports.steps}</span>
          <textarea
            id="report-steps"
            value={steps}
            onChange={(event) => setSteps(event.target.value)}
            placeholder={messages.reports.stepsPlaceholder}
            maxLength={4_000}
            rows={3}
          />
        </label>

        <label className="report-field" htmlFor="report-platform">
          <span>{messages.reports.platform}</span>
          <select id="report-platform" value={platform} onChange={(event) => setPlatform(event.target.value as PlatformCatalogId | "")}>
            <option value="">{messages.filters.all}</option>
            {PLATFORM_CATALOG_IDS.map((value) => (
              <option value={value} key={value}>{messages.navigation[value]}</option>
            ))}
          </select>
        </label>

        <label className="report-field" htmlFor="report-item-slug">
          <span>{messages.reports.itemSlug}</span>
          <input
            id="report-item-slug"
            type="text"
            inputMode="text"
            autoComplete="off"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            maxLength={120}
            value={itemSlug}
            onChange={(event) => setItemSlug(event.target.value)}
            placeholder={messages.reports.itemSlugPlaceholder}
          />
        </label>

        <label className="report-field report-field--wide" htmlFor="report-email">
          <span>{messages.reports.contactEmail}</span>
          <input
            id="report-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={254}
            value={contactEmail}
            onChange={(event) => setContactEmail(event.target.value)}
          />
        </label>

        <div className="report-form__footer">
          <button className="button button--primary" type="submit" disabled={isSending}>
            {isSending ? messages.reports.sending : messages.reports.send}
          </button>
        </div>
      </form>

      {result ? (
        <div
          className={`report-result${result.key === "sent202" ? " report-result--success" : " report-result--error"}`}
          role={result.key === "sent202" ? "status" : "alert"}
          aria-live="polite"
        >
          {result.status !== null ? <strong className="report-result__code">{result.status}</strong> : null}
          <p>{messages.reports[result.key]}</p>
        </div>
      ) : null}
    </section>
  );
}

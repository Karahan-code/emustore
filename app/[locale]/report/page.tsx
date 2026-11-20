import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ErrorReportForm } from "@/components/reports/error-report-form";
import { isPlatformCatalogId } from "@/lib/catalog/platforms";
import { isLocale, type Locale } from "@/lib/catalog/types";
import { getMessages } from "@/lib/i18n/dictionaries";

type ReportPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type ReportContextProps = {
  locale: Locale;
  messages: ReturnType<typeof getMessages>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function ReportContext({ locale, messages, searchParams }: ReportContextProps) {
  const query = await searchParams;
  const itemSlug = firstValue(query.itemSlug);
  const platformValue = firstValue(query.platform);

  return (
    <ErrorReportForm
      locale={locale}
      messages={messages}
      initialItemSlug={itemSlug ?? ""}
      initialPlatform={isPlatformCatalogId(platformValue) ? platformValue : ""}
    />
  );
}

export default async function ReportPage({ params, searchParams }: ReportPageProps) {
  const { locale: localeParam } = await params;
  if (!isLocale(localeParam)) notFound();

  const messages = getMessages(localeParam);
  return (
    <main className="report-page">
      <section className="settings-page__intro">
        <p className="eyebrow"><span className="status-dot" />{messages.navigation.support}</p>
        <h1>{messages.reports.title}</h1>
        <p>{messages.reports.intro}</p>
      </section>
      <Suspense fallback={<div className="status-panel" role="status">{messages.reports.sending}</div>}>
        <ReportContext locale={localeParam} messages={messages} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

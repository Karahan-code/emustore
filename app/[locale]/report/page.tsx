import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ErrorReportForm } from "@/components/reports/error-report-form";
import { isLocale, LOCALES, type Locale } from "@/lib/catalog/types";
import { getMessages } from "@/lib/i18n/dictionaries";

type ReportPageProps = {
  params: Promise<{ locale: string }>;
};

export function generateStaticParams(): Array<{ locale: Locale }> {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function ReportPage({ params }: ReportPageProps) {
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
        <ErrorReportForm locale={localeParam} messages={messages} />
      </Suspense>
    </main>
  );
}

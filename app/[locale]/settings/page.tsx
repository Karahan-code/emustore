import Link from "next/link";
import { notFound } from "next/navigation";
import { AppUpdatePanel } from "@/components/settings/app-update-panel";
import { ArchiveInstallSettings } from "@/components/settings/archive-install-settings";
import { OtaCatalogSettings } from "@/components/settings/ota-catalog-settings";
import { TargetPathSettings } from "@/components/settings/target-path-settings";
import { UiSoundToggle } from "@/components/settings/ui-sound-toggle";
import { APP_VERSION } from "@/lib/app-info";
import { isLocale, LOCALES, type Locale } from "@/lib/catalog/types";
import { getMessages } from "@/lib/i18n/dictionaries";

type SettingsPageProps = { params: Promise<{ locale: string }> };

export function generateStaticParams(): Array<{ locale: Locale }> {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { locale: localeParam } = await params;
  if (!isLocale(localeParam)) notFound();

  const messages = getMessages(localeParam);

  return (
    <main className="settings-page">
      <section className="settings-page__intro">
        <p className="eyebrow"><span className="status-dot" />{messages.settings.title}</p>
        <h1>{messages.settings.title}</h1>
        <p>{messages.settings.description}</p>
      </section>

      <TargetPathSettings messages={messages} />
      <ArchiveInstallSettings messages={messages} />
      <UiSoundToggle messages={messages} />
      <OtaCatalogSettings locale={localeParam} messages={messages} />

      <section className="report-callout">
        <div>
          <p className="eyebrow">{messages.navigation.support}</p>
          <h2>{messages.reports.title}</h2>
        </div>
        <Link className="button button--quiet" href={`/${localeParam}/report`}>
          {messages.navigation.report}<span aria-hidden="true"> ↗</span>
        </Link>
      </section>

      <AppUpdatePanel locale={localeParam} messages={messages} currentVersion={APP_VERSION} />
    </main>
  );
}

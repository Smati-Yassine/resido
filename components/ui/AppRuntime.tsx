"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useOffline } from "next/offline";
import { Icon } from "./Icon";
import { useI18n } from "./I18nProvider";
import { useToast } from "./Toaster";

/**
 * What makes Résido an installable app, mounted once in the root layout:
 * - the service worker (public/sw.js), in production builds only, so the
 *   app opens even without a connection (it then says so) and its code loads
 *   from the device;
 * - updates: back in the foreground, a page from an older deploy reloads;
 * - while the connection is down, pages and saves wait (experimental.useOffline
 *   in next.config.ts) and the app says why: a bar on a large screen, a whole
 *   screen with a retry button on a phone (the CSS picks one); a toast says
 *   when it is back.
 */
export function AppRuntime() {
  const { t } = useI18n();
  const toast = useToast();
  const offline = useOffline();
  const wasOffline = useRef(false);

  useEffect(() => {
    if (wasOffline.current && !offline) toast({ tone: "success", text: t.backOnline });
    wasOffline.current = offline;
  }, [offline, toast, t]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Without it the app still works, online only.
    });
  }, []);

  // A new version shipped while the app sat in the background (an installed
  // app can stay open for days): coming back to it loads the new one. Not
  // over an open modal, which may hold what is being typed — the next page
  // change reloads it then (deploymentId in next.config.ts).
  useEffect(() => {
    const current = process.env.RESIDO_BUILD;
    if (!current) return;
    const onReturn = async () => {
      if (document.visibilityState !== "visible") return;
      void navigator.serviceWorker?.getRegistration().then((registration) => registration?.update());
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        const { id } = (await response.json()) as { id: string };
        if (id && id !== current && !document.querySelector(".modal-overlay")) window.location.reload();
      } catch {
        // Offline or unreachable: checked again next time.
      }
    };
    document.addEventListener("visibilitychange", onReturn);
    return () => document.removeEventListener("visibilitychange", onReturn);
  }, []);

  if (!offline) return null;
  return (
    <>
      <div className="offline-bar" role="status">
        <Icon name="cloudOff" size={17} />
        <span>{t.offline}</span>
      </div>
      <OfflineScreen />
    </>
  );
}

/**
 * The phone's offline screen, over the whole app. Next checks the connection
 * on its own and lifts it once back; "Try again" asks at once, by reloading
 * the page's data — which also brings it up to date.
 */
function OfflineScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!checking) return;
    // Still offline after a moment: the button can be pressed again.
    const done = setTimeout(() => setChecking(false), 2500);
    return () => clearTimeout(done);
  }, [checking]);

  return (
    <div className="offline-screen" role="alertdialog" aria-modal="true" aria-labelledby="offline-title">
      <div className="offline-screen-card">
        <span className="offline-screen-icon">
          <Icon name="cloudOff" size={30} />
        </span>
        <h2 id="offline-title" className="offline-screen-title">
          {t.offlineTitle}
        </h2>
        <p className="offline-screen-text">{t.offlineText}</p>
        <button
          type="button"
          className="btn btn-primary btn-lg btn-block"
          disabled={checking}
          aria-busy={checking}
          onClick={() => {
            setChecking(true);
            router.refresh();
          }}
        >
          {checking ? t.offlineChecking : t.offlineRetry}
        </button>
      </div>
    </div>
  );
}

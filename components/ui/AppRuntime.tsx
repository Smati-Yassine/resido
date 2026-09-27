"use client";

import { useEffect, useRef } from "react";
import { useOffline } from "next/offline";
import { Icon } from "./Icon";
import { useI18n } from "./I18nProvider";
import { useToast } from "./Toaster";

/**
 * What makes Résido an installable app, mounted once in the root layout:
 * - the service worker (public/sw.js), in production builds only, so the
 *   app opens even without a connection (it then says so) and its code loads
 *   from the device;
 * - the offline bar: while the connection is down, pages and saves wait
 *   (experimental.useOffline in next.config.ts) and the bar says why; a toast
 *   says when it is back.
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

  if (!offline) return null;
  return (
    <div className="offline-bar" role="status">
      <Icon name="cloudOff" size={17} />
      <span>{t.offline}</span>
    </div>
  );
}

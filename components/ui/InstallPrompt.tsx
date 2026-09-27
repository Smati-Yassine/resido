"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { useI18n } from "./I18nProvider";

/** Chrome's install offer (Android, and Chromium browsers generally). */
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// Chrome may make its offer before any component mounts: it is caught as soon
// as this module loads, and kept for the card's button.
let offer: InstallEvent | null = null;
const subscribers = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // the card below replaces the browser's own banner
    offer = event as InstallEvent;
    subscribers.forEach((notify) => notify());
  });
  window.addEventListener("appinstalled", () => {
    offer = null;
    subscribers.forEach((notify) => notify());
  });
}

const DISMISSED_KEY = "resido-install-dismissed";
const QUIET_DAYS = 14;

type Mode = "hidden" | "native" | "ios";

/** What the card can do here — nothing when installed, on a computer, or put off lately. */
function currentMode(): Mode {
  const installed =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const touch = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  if (installed || !touch) return "hidden";
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY));
    if (at && Date.now() - at < QUIET_DAYS * 86_400_000) return "hidden";
  } catch {
    // No storage (private mode): the card shows, and "Not now" hides it for this visit.
  }
  // iPhone and iPad (which calls itself a Mac) have no install offer: the card says how.
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  if (ios) return "ios";
  return offer ? "native" : "hidden";
}

/**
 * "Install the Résido app", on a phone or tablet where it is not installed
 * yet: a button opening the system's install dialog (Android), or how to add
 * it from the Share menu (iPhone, iPad). "Not now" puts it away for two weeks.
 */
export function InstallPrompt({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("hidden");

  useEffect(() => {
    const update = () => setMode(currentMode());
    update();
    subscribers.add(update);
    return () => void subscribers.delete(update);
  }, []);

  if (mode === "hidden") return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // Hidden for this visit only.
    }
    setMode("hidden");
  };
  const install = async () => {
    if (!offer) return;
    await offer.prompt();
    const { outcome } = await offer.userChoice;
    offer = null; // an offer serves once
    setMode(outcome === "accepted" ? "hidden" : currentMode());
  };

  return (
    <section className={`install-card ${className}`} aria-label={t.installTitle}>
      <span className="brand-mark install-card-icon" aria-hidden="true">
        R
      </span>
      <div className="min-w-0 flex-1">
        <p className="install-card-title">{t.installTitle}</p>
        <p className="install-card-text">
          {mode === "ios" ? (
            <>
              {t.installIosBefore}{" "}
              <span className="install-card-share" role="img" aria-label={t.installShare}>
                <Icon name="share" size={15} strokeWidth={2} />
              </span>{" "}
              {t.installIosAfter}
            </>
          ) : (
            t.installText
          )}
        </p>
        {mode === "native" && (
          <button type="button" className="btn btn-primary btn-sm mt-2.5" onClick={install}>
            {t.installAction}
          </button>
        )}
      </div>
      <button
        type="button"
        className="icon-btn icon-btn-bare shrink-0 self-start"
        aria-label={t.installLater}
        title={t.installLater}
        onClick={dismiss}
      >
        <Icon name="close" size={17} />
      </button>
    </section>
  );
}

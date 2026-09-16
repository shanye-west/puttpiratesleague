/**
 * Add-to-Home-Screen guide.
 *
 * Picks the right path for the device:
 *   - Native prompt available (Android / desktop Chromium) → one "Install app"
 *     button that fires the real OS prompt.
 *   - iPhone → short step lists for Safari and Chrome (they differ in install
 *     UI). Once installed it's all WebKit, so push works either way.
 *   - Anything else → a short "open it on your phone" fallback.
 *
 * Opened from the notifications flow when push needs an installed PWA, or from the
 * "Install app" menu item. See useInstallPrompt for the trigger plumbing.
 */

import { useState, type ReactNode } from "react";
import { Download } from "lucide-react";
import { Modal } from "./Modal";
import { useInstallPrompt } from "../hooks/useInstallPrompt";
import { isIOS, isStandalone, iosBrowser } from "../messaging";

const APP_NAME = "Putt Pirates";
const APP_URL = "puttpiratesgolf.web.app";

const SAFARI_STEPS = [
  "Tap the Share button (the square with an arrow) at the bottom of Safari.",
  "Scroll down and tap “Add to Home Screen”.",
  "Tap “Add” in the top-right corner.",
];
const CHROME_STEPS = [
  "Tap the Share icon in the address bar (top-right).",
  "Tap “Add to Home Screen”.",
  "Tap “Add”.",
];

export function InstallGuideModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { canInstall, promptInstall } = useInstallPrompt();
  // Default the iOS steps to the user's current browser; let them switch if we
  // guessed wrong (UA sniffing misses in-app webviews, Firefox/Edge, etc.).
  const [iosSteps, setIosSteps] = useState<"safari" | "chrome">(
    iosBrowser() === "chrome" ? "chrome" : "safari"
  );

  const handleNativeInstall = async () => {
    await promptInstall();
    onClose();
  };

  let body: ReactNode;
  if (isStandalone()) {
    body = (
      <p className="text-center text-sm text-muted-foreground">
        You're all set — {APP_NAME} is already installed on this device.
      </p>
    );
  } else if (canInstall) {
    body = (
      <>
        <p className="mb-4 text-center text-sm text-muted-foreground">
          Install {APP_NAME} for notifications and a full-screen, app-like experience.
        </p>
        <button
          type="button"
          onClick={handleNativeInstall}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 px-4 text-base font-semibold text-primary-foreground transition-transform active:scale-95"
        >
          <Download className="h-5 w-5" />
          Install app
        </button>
      </>
    );
  } else if (isIOS()) {
    const steps = iosSteps === "chrome" ? CHROME_STEPS : SAFARI_STEPS;
    body = (
      <>
        <p className="mb-3 text-center text-sm text-muted-foreground">
          To get notifications on iPhone, add {APP_NAME} to your Home Screen:
        </p>
        <ol className="mx-auto max-w-xs list-decimal space-y-2 pl-5 text-sm text-foreground">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => setIosSteps((v) => (v === "safari" ? "chrome" : "safari"))}
          className="mt-3 w-full text-center text-xs font-medium text-primary hover:underline"
        >
          {iosSteps === "safari"
            ? "Using Chrome instead? Show the Chrome steps"
            : "Using Safari instead? Show the Safari steps"}
        </button>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Then open {APP_NAME} from your Home Screen and turn on notifications.
        </p>
      </>
    );
  } else {
    body = (
      <p className="text-center text-sm text-muted-foreground">
        Open <strong>{APP_URL}</strong> in your phone's browser (Safari or Chrome on iPhone)
        to add {APP_NAME} to your Home Screen.
      </p>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Install ${APP_NAME}`} ariaLabel={`Install ${APP_NAME}`}>
      {isOpen && (
        <>
          {body}
          <button
            type="button"
            onClick={onClose}
            className="mt-5 w-full rounded-lg bg-muted py-2.5 px-4 text-sm font-semibold text-foreground transition-transform active:scale-95"
          >
            Done
          </button>
        </>
      )}
    </Modal>
  );
}

const publicToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;
const missingVariable = !publicToken ? "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN" : !apiHost ? "NEXT_PUBLIC_POSTHOG_HOST" : null;
const isDevelopment = process.env.NODE_ENV === "development";

let analytics;

export function startAnalytics() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (analytics) return analytics;
  if (missingVariable) {
    if (isDevelopment) console.warn(`PostHog is disabled because ${missingVariable} is missing.`);
    analytics = Promise.resolve(null);
    return analytics;
  }
  analytics = import("posthog-js").then(({ default: posthog }) => {
    posthog.init(publicToken, {
      api_host: apiHost,
      capture_pageview: false,
      capture_exceptions: {
        capture_unhandled_errors: true,
        capture_unhandled_rejections: true,
        capture_console_errors: false,
      },
      logs: {
        serviceName: "cue-attendance-tracker-web",
        environment: isDevelopment ? "development" : "production",
        serviceVersion: "1.0.0",
      },
    });
    return posthog;
  }).catch(() => null);
  return analytics;
}

export function track(event, properties) {
  startAnalytics().then((posthog) => posthog?.capture(event, properties)).catch(() => {});
}

export function log(message, attributes) {
  startAnalytics().then((posthog) => posthog?.logger.info(message, attributes)).catch(() => {});
}

const publicToken = globalThis.POSTHOG_PROJECT_TOKEN;
const apiHost = globalThis.POSTHOG_HOST;
const missingVariable = !publicToken ? "POSTHOG_PROJECT_TOKEN" : !apiHost ? "POSTHOG_HOST" : null;
const isDevelopment = ["localhost", "127.0.0.1", "::1"].includes(globalThis.location?.hostname);

if (missingVariable && isDevelopment) {
  throw new Error(`${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`);
}

const analytics = missingVariable
  ? Promise.resolve(null)
  : import("https://cdn.jsdelivr.net/npm/posthog-js@1.450.1/+esm")
    .then(({ default: posthog }) => {
      posthog.init(publicToken, {
        api_host: apiHost,
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
    })
    .catch(() => null);

export function track(event, properties) {
  analytics.then((posthog) => posthog?.capture(event, properties)).catch(() => {});
}

export function log(message, attributes) {
  analytics.then((posthog) => posthog?.logger.info(message, attributes)).catch(() => {});
}

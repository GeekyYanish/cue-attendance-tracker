const publicToken = "phc_v4RiwaE8MWmMYWLMGDMwZvhjNN3WSCjq7b6VjUDJjnLt";
const apiHost = "https://us.i.posthog.com";
const productionHost = "attendance-tracker.yanish.me";

const events = new Set([
  "$pageview",
  "attendance_imported",
  "attendance_target_saved",
  "class_logged",
  "feedback_submitted",
]);

const analytics = publicToken && apiHost && globalThis.location?.hostname === productionHost
  ? import("https://cdn.jsdelivr.net/npm/posthog-js@1.450.1/+esm")
    .then(({ default: posthog }) => {
      posthog.init(publicToken, {
        api_host: apiHost,
        persistence: "localStorage",
        capture_pageview: true,
        capture_pageleave: false,
        autocapture: false,
        disable_session_recording: true,
        disable_surveys: true,
        advanced_disable_flags: true,
        person_profiles: "never",
        save_campaign_params: false,
        save_referrer: false,
        before_send(event) {
          if (!event || !events.has(event.event)) return null;
          event.properties.$current_url = `https://${productionHost}/`;
          return event;
        },
      });
      return posthog;
    })
    .catch(() => null)
  : Promise.resolve(null);

export function track(event, properties) {
  analytics.then((posthog) => posthog?.capture(event, properties)).catch(() => {});
}

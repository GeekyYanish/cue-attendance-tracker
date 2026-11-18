export function parseTarget(value) {
  const text = value.trim();
  if (!text) return null;
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new Error("Enter a target from 0.01% to 100%, with up to two decimal places.");
  const target = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (target < 1 || target > 10000) {
    throw new Error("Enter a target from 0.01% to 100%.");
  }
  return target;
}

export function parseClassLength(value) {
  const text = value.trim();
  const length = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(length) || length < 1) {
    throw new Error("Enter a whole number of hours per class, at least 1.");
  }
  return length;
}

// Targets are stored in hundredths of a percent to keep boundary decisions exact.
export function forecast({ attended, total }, target) {
  if (total === 0) return { kind: "empty" };
  if (target == null) return { kind: "unset" };

  const surplus = BigInt(attended) * 10000n - BigInt(total) * BigInt(target);
  if (surplus >= 0n) {
    return { kind: "on-target", hours: Number(surplus / BigInt(target)) };
  }
  if (target === 10000) return { kind: "unreachable" };

  const improvement = BigInt(10000 - target);
  return { kind: "below-target", hours: Number((-surplus + improvement - 1n) / improvement) };
}

export function bunkAllowance(subject, overall, hoursPerClass) {
  if (subject.kind === "empty" || overall.kind === "empty") return null;
  if (subject.kind === "unset" || overall.kind === "unset") return null;
  const hours = subject.kind === "on-target" && overall.kind === "on-target"
    ? Math.min(subject.hours, overall.hours)
    : 0;
  return { hours, classes: Math.floor(hours / hoursPerClass) };
}


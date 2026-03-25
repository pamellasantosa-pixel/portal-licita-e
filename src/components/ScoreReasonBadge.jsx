import { formatEsaReasonLabel } from "../lib/esaScoring";

function buildReasonStyles(reason) {
  const value = String(reason || "");
  if (value.startsWith("exclusao:")) {
    return "border-red-300 bg-red-50 text-red-700";
  }
  if (value.startsWith("termo:")) {
    return "border-emerald-300 bg-emerald-50 text-emerald-700";
  }
  if (value === "federal_incra_funai") {
    return "border-[#C8A74E] bg-[#0B1F3A] text-[#F3D27A]";
  }
  return "border-brand-brown/20 bg-white text-brand-brown";
}

export default function ScoreReasonBadge({ reason, evaluation = null }) {
  const label = formatEsaReasonLabel(reason, evaluation || {});
  return (
    <span
      title={label}
      className={[
        "rounded-full border px-2 py-1 font-body text-[11px] font-semibold uppercase tracking-wide",
        buildReasonStyles(reason)
      ].join(" ")}
    >
      {label}
    </span>
  );
}

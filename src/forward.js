import { t } from "./i18n.js";
import { categories } from "../server/domain.js";

// A copy-ready civic summary the reporter can paste into a 311 request.
// Kept separate from main.js so it can be unit-tested without the DOM.
export function forwardSummary(r, link) {
  const c = categories[r.category] || { label: r.category };
  const lines = [
    t("dialogs.forward.lineIssue", { title: r.title }),
    t("dialogs.forward.lineCategory", { label: c.label }),
    t("dialogs.forward.lineLocation", {
      location: r.location,
      coords: `${Number(r.lat).toFixed(5)}, ${Number(r.lng).toFixed(5)}`,
    }),
    t("dialogs.forward.lineDescription", { description: r.description }),
    t("dialogs.forward.lineCommunity", {
      confirmations: r.confirmations,
      clearVotes: r.clearVotes,
    }),
  ];
  if (r.photo) lines.push(t("dialogs.forward.linePhoto"));
  lines.push(t("dialogs.forward.lineLink", { link }));
  return lines.join("\n");
}

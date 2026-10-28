"use client";
import { useEffect, useState } from "react";
import { COUNTDOWN_MAX_MS, timeLeft } from "@/lib/select";

/** Date de fin RÉELLE (publiée par la source, voir hasRealEnd), page deal seulement.
 * HTML statique = la date (« bis Mi 29.10. ») ; le navigateur n'affiche un temps
 * restant que sous 6 h, recalculé chaque minute, puis « abgelaufen » — jamais de
 * minuterie qui redémarre, jamais de mise en forme alarmante. Textes en props
 * (« {h} », « {m} » remplacés), aucun dictionnaire côté client. */
export function EndsIn({ endsAt, label, hm, m, ended }: { endsAt: string; label: string; hm: string; m: string; ended: string }) {
  const [text, setText] = useState(label);
  useEffect(() => {
    const tick = () => {
      const left = timeLeft(endsAt, new Date());
      if (left.ms <= 0) return setText(ended);
      if (left.ms >= COUNTDOWN_MAX_MS) return setText(label);
      setText(left.hours > 0 ? hm.replace("{h}", String(left.hours)).replace("{m}", String(left.minutes)) : m.replace("{m}", String(Math.max(1, left.minutes))));
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [endsAt, label, hm, m, ended]);
  return <time dateTime={endsAt}>{text}</time>;
}

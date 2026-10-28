"use client";
import { useEffect, useState } from "react";
import { dict, type Locale } from "@/lib/i18n";
import { timeLeft } from "@/lib/select";

/** Compte à rebours RÉEL : n'est rendu que pour une date de fin publiée par la
 * source (voir hasRealEnd). HTML statique = la date ; le navigateur affiche
 * ensuite le temps restant, recalculé chaque minute, et « terminé » à la fin —
 * jamais de minuterie qui redémarre. */
export function EndsIn({ endsAt, locale, label }: { endsAt: string; locale: Locale; label: string }) {
  const t = dict(locale);
  const [text, setText] = useState(label);
  const [soon, setSoon] = useState(false);
  useEffect(() => {
    const tick = () => {
      const left = timeLeft(endsAt, new Date());
      if (left.ms <= 0) { setText(t.ended); setSoon(false); return; }
      // Au-delà de 7 jours, la date suffit.
      if (left.days >= 7) { setText(label); setSoon(false); return; }
      setText(left.days === 0 && left.hours === 0 ? t.endsInMin(Math.max(1, left.minutes)) : t.endsIn(left.days, left.hours));
      setSoon(left.ms < 24 * 3_600_000);
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [endsAt, label, t]);
  return (
    <time dateTime={endsAt} className={soon ? "ends ends-soon" : "ends"}>
      {text}
    </time>
  );
}

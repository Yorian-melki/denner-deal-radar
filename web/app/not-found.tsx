import Link from "next/link";
export default function NotFound() {
  return (<><h1>Nicht gefunden</h1><p>Dieser Deal ist wahrscheinlich abgelaufen. <Link href="/">Zu den aktuellen Deals →</Link></p></>);
}

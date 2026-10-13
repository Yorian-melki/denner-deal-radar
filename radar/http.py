"""Client HTTP poli : timeout, retry avec backoff exponentiel, robots.txt."""
from __future__ import annotations

import logging
import random
import time
from urllib.parse import urlparse

import requests
from protego import Protego

log = logging.getLogger("radar.http")


class RobotsDisallowed(RuntimeError):
    pass


class Http:
    def __init__(self, user_agent: str, timeout: float = 30, retries: int = 4,
                 backoff: float = 2.0, delay: float = 0.8):
        self.s = requests.Session()
        self.s.headers.update({"User-Agent": user_agent, "Accept-Language": "de-CH,de;q=0.9"})
        self.timeout, self.retries, self.backoff, self.delay = timeout, retries, backoff, delay
        self.requests_made = 0
        self._robots: dict[str, Protego] = {}
        self._last = 0.0

    # -- robots.txt -------------------------------------------------------
    def load_robots(self, base: str) -> Protego:
        host = urlparse(base).netloc
        if host not in self._robots:
            r = self._raw("GET", f"{base}/robots.txt")
            self._robots[host] = Protego.parse(r.text)
        return self._robots[host]

    def allowed(self, url: str) -> bool:
        p = urlparse(url)
        rules = self.load_robots(f"{p.scheme}://{p.netloc}")
        return rules.can_fetch(url, self.s.headers["User-Agent"]) and rules.can_fetch(url, "*")

    # -- requests ---------------------------------------------------------
    def _raw(self, method: str, url: str, **kw) -> requests.Response:
        last_exc: Exception | None = None
        for attempt in range(self.retries + 1):
            wait = self.delay - (time.monotonic() - self._last)
            if wait > 0:
                time.sleep(wait)
            try:
                self._last = time.monotonic()
                self.requests_made += 1
                r = self.s.request(method, url, timeout=self.timeout, **kw)
                if r.status_code in (429, 500, 502, 503, 504):
                    raise requests.HTTPError(f"HTTP {r.status_code}", response=r)
                r.raise_for_status()
                return r
            except (requests.ConnectionError, requests.Timeout, requests.HTTPError) as e:
                last_exc = e
                status = getattr(getattr(e, "response", None), "status_code", None)
                if status is not None and 400 <= status < 500 and status != 429:
                    raise  # erreur client : inutile d'insister
                if attempt < self.retries:
                    sleep = self.backoff * (2 ** attempt) + random.uniform(0, 1)
                    log.warning("%s %s échoue (%s), nouvel essai dans %.1fs", method, url, e, sleep)
                    time.sleep(sleep)
        assert last_exc is not None
        raise last_exc

    def request(self, method: str, url: str, **kw) -> requests.Response:
        if not self.allowed(url):
            raise RobotsDisallowed(url)
        return self._raw(method, url, **kw)

    def get(self, url: str, **kw) -> requests.Response:
        return self.request("GET", url, **kw)

    def post_json(self, url: str, body: dict, referer: str | None = None) -> dict:
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if referer:
            headers["Referer"] = referer
        r = self.request("POST", url, json=body, headers=headers)
        return r.json()

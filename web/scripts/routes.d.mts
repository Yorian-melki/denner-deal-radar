export declare const MAIN_CITY: string;
export declare function candidates(lang: string, rest: string): string[];
export declare const ALLOWED_ROUTES: Set<string>;
export declare function routesJson(clicks: boolean): { version: 1; include: string[]; exclude: string[] };
export declare const ADVISORY_URL: string;
export declare function securityTxt(origin: string, email: string | undefined, now: Date): string;

export interface VerseRef { b: string; c: number; v1: number; v2: number; t: string }
export interface Verse { text: string; label: string; found: boolean }
export function parseRef(s: string | null | undefined, t?: string | null): VerseRef | null;
export function refParam(r: VerseRef): string;
export function fetchVerse(r: VerseRef, supabaseUrl: string, anonKey: string): Promise<Verse | null>;
export function verseHtml(o: { origin: string; r: VerseRef; verse: Verse | null }): string;
export function cardSvg(verse: Verse): string;
export function cardPng(verse: Verse): Buffer;
export function originOf(headers: Record<string, string | string[] | undefined>): string;

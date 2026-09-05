export const useColor = () =>
  Boolean(process.stdout.isTTY) && !process.env.NO_COLOR && process.env.FORCE_COLOR !== "0";

function color(text: string, code: string): string {
  return useColor() ? `\x1b[${code}m${text}\x1b[0m` : text;
}

export const bold = (text: string) => color(text, "1");
export const dim = (text: string) => color(text, "2");
export const cyan = (text: string) => color(text, "36");
export const green = (text: string) => color(text, "32");
export const red = (text: string) => color(text, "31");
export const yellow = (text: string) => color(text, "33");

export function checkMark(ok: boolean): string {
  return ok ? green("✓") : red("✗");
}

export function clearScreen(): void {
  if (!process.stdout.isTTY) return;
  process.stdout.write("\x1b[2J\x1b[H");
}

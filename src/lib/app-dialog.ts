export type DialogOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  inputLabel?: string;
  inputType?: "text" | "email";
  defaultValue?: string;
};
export type DialogRequest = DialogOptions & {
  id: number;
  kind: "confirm" | "alert" | "prompt";
};
type Entry = {
  request: DialogRequest;
  resolve: (value: string | boolean | null) => void;
};
const queue: Entry[] = [];
const listeners = new Set<() => void>();
let sequence = 0;
const notify = () => listeners.forEach((listener) => listener());
export const subscribeDialog = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getDialog = () => queue[0]?.request ?? null;
export function resolveDialog(id: number, value: string | boolean | null) {
  if (queue[0]?.request.id !== id) return;
  const entry = queue.shift()!;
  notify();
  entry.resolve(value);
}
function request(kind: DialogRequest["kind"], options: string | DialogOptions) {
  return new Promise<string | boolean | null>((resolve) => {
    queue.push({
      request: {
        ...(typeof options === "string" ? { message: options } : options),
        kind,
        id: ++sequence,
      },
      resolve,
    });
    notify();
  });
}
export const confirmAction = async (options: string | DialogOptions) =>
  (await request("confirm", options)) === true;
export const alertAction = async (options: string | DialogOptions) => {
  await request("alert", options);
};
export const promptAction = async (options: string | DialogOptions) => {
  const value = await request("prompt", options);
  return typeof value === "string" ? value : null;
};

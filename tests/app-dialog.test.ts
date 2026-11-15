import { expect, it } from "vitest";
import {
  alertAction,
  confirmAction,
  getDialog,
  promptAction,
  resolveDialog,
  subscribeDialog,
} from "../src/lib/app-dialog";

it("확인을 기다리고 거절하면 취소 결과를 돌려준다", async () => {
  const answer = confirmAction("변경을 버릴까요?");
  expect(getDialog()?.kind).toBe("confirm");
  resolveDialog(getDialog()!.id, false);
  expect(await answer).toBe(false);
  expect(getDialog()).toBeNull();
});
it("여러 요청을 순서대로 처리하고 이전 창의 응답은 무시한다", async () => {
  const changes: number[] = [];
  const unsubscribe = subscribeDialog(() => changes.push(getDialog()?.id || 0));
  const first = confirmAction("첫 번째");
  const firstId = getDialog()!.id;
  const second = promptAction({ message: "이메일", inputType: "email" });
  resolveDialog(firstId, true);
  const secondId = getDialog()!.id;
  expect(secondId).not.toBe(firstId);
  resolveDialog(firstId, false);
  expect(getDialog()?.id).toBe(secondId);
  resolveDialog(secondId, "shop@example.com");
  expect(await first).toBe(true);
  expect(await second).toBe("shop@example.com");
  expect(changes.length).toBe(4);
  unsubscribe();
});
it("입력 취소와 안내 완료를 처리한다", async () => {
  const input = promptAction("입력");
  resolveDialog(getDialog()!.id, null);
  expect(await input).toBeNull();
  const info = alertAction("완료했습니다.");
  expect(getDialog()?.kind).toBe("alert");
  resolveDialog(getDialog()!.id, true);
  await info;
  expect(getDialog()).toBeNull();
});

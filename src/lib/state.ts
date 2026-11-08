import { addDays, today, uid } from "./dates";
import { commandSchema, type Command, type StoreState } from "./types";
import { materialUsage, orderPieces, requirements } from "./calculations";

export function emptyState(): StoreState {
  return {
    revision: 0,
    products: [],
    materials: [],
    orders: [],
    plans: [],
    lots: [],
    closings: [],
    movements: [],
    settings: {
      initialized: false,
      extraCount: 1,
      extraBatches: 1,
      avoidDays: 7,
      excluded: [],
    },
    audit: [],
  };
}
export function demoState(date = today()): StoreState {
  const s = emptyState();
  s.settings.initialized = true;
  s.materials = [
    {
      id: "rice",
      name: "멥쌀가루",
      unit: "g",
      kind: "ingredient",
      stock: 16000,
      threshold: 5000,
    },
    {
      id: "sticky",
      name: "찹쌀가루",
      unit: "g",
      kind: "ingredient",
      stock: 8000,
      threshold: 3000,
    },
    {
      id: "sugar",
      name: "설탕",
      unit: "g",
      kind: "ingredient",
      stock: 4200,
      threshold: 1000,
    },
    {
      id: "sesame",
      name: "참깨",
      unit: "g",
      kind: "ingredient",
      stock: 350,
      threshold: 500,
    },
    {
      id: "bean",
      name: "콩고물",
      unit: "g",
      kind: "ingredient",
      stock: 2400,
      threshold: 500,
    },
    {
      id: "box",
      name: "선물상자 · 소",
      unit: "개",
      kind: "supply",
      stock: 42,
      threshold: 20,
    },
    {
      id: "sticker",
      name: "원형 스티커",
      unit: "개",
      kind: "supply",
      stock: 120,
      threshold: 50,
    },
  ];
  s.products = [
    {
      id: "white",
      name: "백설기",
      color: "#e6dcd1",
      boxSize: 10,
      batchYield: 24,
      batchLabel: "1되",
      shelfDays: 1,
      displayTarget: 20,
      active: true,
      recipe: [
        { materialId: "rice", quantity: 1600 },
        { materialId: "sugar", quantity: 180 },
      ],
    },
    {
      id: "honey",
      name: "꿀떡",
      color: "#b4c5a4",
      boxSize: 20,
      batchYield: 40,
      batchLabel: "1되",
      shelfDays: 1,
      displayTarget: 30,
      active: true,
      recipe: [
        { materialId: "rice", quantity: 1600 },
        { materialId: "sugar", quantity: 200 },
        { materialId: "sesame", quantity: 180 },
      ],
    },
    {
      id: "injeolmi",
      name: "인절미",
      color: "#e3c78e",
      boxSize: 12,
      batchYield: 30,
      batchLabel: "1되",
      shelfDays: 1,
      displayTarget: 20,
      active: true,
      recipe: [
        { materialId: "sticky", quantity: 1600 },
        { materialId: "bean", quantity: 400 },
      ],
    },
    {
      id: "mugwort",
      name: "쑥설기",
      color: "#9cae8c",
      boxSize: 10,
      batchYield: 24,
      batchLabel: "1되",
      shelfDays: 1,
      displayTarget: 0,
      active: true,
      recipe: [
        { materialId: "rice", quantity: 1600 },
        { materialId: "sugar", quantity: 180 },
      ],
    },
    {
      id: "snack",
      name: "까불이",
      color: "#cc9274",
      boxSize: 10,
      batchYield: 50,
      batchLabel: "1배치",
      shelfDays: 3,
      displayTarget: 0,
      active: true,
      recipe: [
        { materialId: "sticky", quantity: 1200 },
        { materialId: "sugar", quantity: 200 },
      ],
    },
  ];
  s.orders = [
    {
      id: "demo-1",
      customer: "김민지",
      phone: "010-0000-0001",
      channel: "카카오톡",
      date,
      time: "10:30",
      kind: "gift",
      boxes: 5,
      lines: [
        { productId: "white", quantity: 2, unit: "piece", piecesPerUnit: 1 },
        { productId: "honey", quantity: 4, unit: "piece", piecesPerUnit: 1 },
      ],
      sticker: "첫 생일을 축하해 주셔서 감사합니다 ♡",
      status: "reserved",
      updatedAt: new Date().toISOString(),
    },
    {
      id: "demo-2",
      customer: "박서연",
      phone: "010-0000-0002",
      channel: "전화",
      date,
      time: "13:00",
      kind: "single",
      boxes: 1,
      lines: [
        { productId: "injeolmi", quantity: 2, unit: "box", piecesPerUnit: 12 },
      ],
      sticker: "맛있게 드세요!",
      status: "reserved",
      updatedAt: new Date().toISOString(),
    },
    {
      id: "demo-3",
      customer: "이정훈",
      phone: "010-0000-0003",
      channel: "네이버 톡톡",
      date,
      time: "15:00",
      kind: "single",
      boxes: 1,
      lines: [
        { productId: "white", quantity: 30, unit: "piece", piecesPerUnit: 1 },
      ],
      sticker: "",
      status: "reserved",
      updatedAt: new Date().toISOString(),
    },
    {
      id: "demo-4",
      customer: "최유진",
      phone: "010-0000-0004",
      channel: "매장",
      date: addDays(date, 1),
      time: "11:00",
      kind: "single",
      boxes: 1,
      lines: [
        { productId: "honey", quantity: 3, unit: "box", piecesPerUnit: 20 },
      ],
      sticker: "행복한 하루 보내세요",
      status: "reserved",
      updatedAt: new Date().toISOString(),
    },
  ];
  return s;
}

export function applyCommand(
  input: StoreState,
  raw: Command,
  actor: string,
  now = new Date().toISOString(),
): StoreState {
  const c = commandSchema.parse(raw),
    s = structuredClone(input),
    day = today();
  const findProduct = (id: string) => {
    const p = s.products.find((p) => p.id === id);
    if (!p) throw new Error("등록된 메뉴를 선택하세요.");
    return p;
  };
  const invalidate = () => {
    s.revision++;
  };
  let message = "";
  switch (c.type) {
    case "saveOrder": {
      const old = s.orders.find((o) => o.id === c.order.id);
      if (old?.status === "picked")
        throw new Error("수령 완료를 되돌린 후 주문을 수정하세요.");
      const o = {
        ...c.order,
        updatedAt: now,
        status: old?.status || ("reserved" as const),
        pickedAt: old?.pickedAt,
        pickedBy: old?.pickedBy,
        pickupAllocations: old?.pickupAllocations,
      };
      o.lines = o.lines.map((l) => {
        const p = findProduct(l.productId);
        const previous = old?.lines.find(
          (x) => x.productId === l.productId && x.unit === l.unit,
        );
        return {
          ...l,
          piecesPerUnit:
            l.unit === "piece" ? 1 : previous?.piecesPerUnit || p.boxSize,
        };
      });
      if (
        o.imagePath &&
        !o.imagePath.startsWith("demo:") &&
        !/^[a-f0-9-]+\/[a-f0-9-]+\.(png|jpe?g|webp)$/.test(o.imagePath)
      )
        throw new Error("참고 이미지 경로를 확인하세요.");
      s.orders = old
        ? s.orders.map((x) => (x.id === o.id ? o : x))
        : [...s.orders, o];
      invalidate();
      message = `${o.customer} 주문 ${old ? "수정" : "등록"}`;
      break;
    }
    case "orderStatus": {
      const o = s.orders.find((o) => o.id === c.id);
      if (!o) throw new Error("주문이 없습니다.");
      if (o.status === c.status) return input;
      if (o.status === "cancelled" && c.status === "picked")
        throw new Error("취소된 주문은 수령 처리할 수 없습니다.");
      if (o.status === "picked" && c.status === "cancelled")
        throw new Error("수령을 되돌린 후 주문을 취소하세요.");
      if (o.status === "picked") {
        if (
          (o.pickupAllocations || []).some((a) =>
            s.closings.some(
              (c) => c.lotId === a.lotId && c.at >= (o.pickedAt || now),
            ),
          )
        )
          throw new Error(
            "이미 마감에 반영된 수령입니다. 재고 실사로 보정한 후 관리자에게 확인하세요.",
          );
        for (const a of o.pickupAllocations || []) {
          const lot = s.lots.find((l) => l.id === a.lotId);
          if (lot) lot.remaining += a.pieces;
        }
        o.pickupAllocations = undefined;
      }
      if (c.status === "picked") {
        o.pickupAllocations = [];
        for (const l of orderPieces(o)) {
          let left = l.pieces;
          for (const lot of s.lots
            .filter(
              (x) =>
                x.productId === l.productId &&
                x.date <= day &&
                x.expires >= day,
            )
            .sort((a, b) => a.expires.localeCompare(b.expires))) {
            const qty = Math.min(left, lot.remaining);
            if (qty) {
              lot.remaining -= qty;
              left -= qty;
              o.pickupAllocations.push({ lotId: lot.id, pieces: qty });
            }
            if (!left) break;
          }
        }
      }
      o.status = c.status;
      o.updatedAt = now;
      o.pickedAt = c.status === "picked" ? now : undefined;
      o.pickedBy = c.status === "picked" ? actor : undefined;
      invalidate();
      message = `${o.customer} ${c.status === "picked" ? "수령 완료" : c.status === "cancelled" ? "주문 취소" : "예약으로 변경"}`;
      break;
    }
    case "saveProduct": {
      if (
        new Set(c.product.recipe.map((r) => r.materialId)).size !==
        c.product.recipe.length
      )
        throw new Error("레시피에 같은 재료를 중복 등록할 수 없습니다.");
      for (const r of c.product.recipe)
        if (
          !s.materials.some(
            (m) => m.id === r.materialId && m.kind === "ingredient",
          )
        )
          throw new Error("등록된 원재료를 선택하세요.");
      s.products = s.products.some((p) => p.id === c.product.id)
        ? s.products.map((p) => (p.id === c.product.id ? c.product : p))
        : [...s.products, c.product];
      invalidate();
      message = `${c.product.name} 생산 기준 저장`;
      break;
    }
    case "saveMaterial": {
      const old = s.materials.find((m) => m.id === c.material.id);
      if (old && (old.unit !== c.material.unit || old.kind !== c.material.kind))
        throw new Error(
          "기존 재고의 단위·분류는 변경할 수 없습니다. 새 품목을 등록하세요.",
        );
      const m = { ...c.material, stock: old?.stock ?? c.material.stock };
      s.materials = old
        ? s.materials.map((x) => (x.id === m.id ? m : x))
        : [...s.materials, m];
      if (!old && m.stock)
        s.movements.push({
          id: uid(),
          materialId: m.id,
          delta: m.stock,
          reason: "초기 재고",
          actor,
          at: now,
        });
      invalidate();
      message = `${m.name} 재고 기준 저장`;
      break;
    }
    case "adjustStock": {
      const m = s.materials.find((m) => m.id === c.materialId);
      if (!m) throw new Error("재고 품목이 없습니다.");
      const delta =
        c.mode === "count"
          ? c.quantity - m.stock
          : c.quantity * (c.mode === "receive" ? 1 : -1);
      if (m.stock + delta < 0)
        throw new Error("재고보다 많은 수량을 차감할 수 없습니다.");
      m.stock += delta;
      s.movements.push({
        id: uid(),
        materialId: m.id,
        delta,
        reason: `${c.mode}: ${c.note}`,
        actor,
        at: now,
      });
      invalidate();
      message = `${m.name} 재고 조정`;
      break;
    }
    case "savePaymentAccount": {
      s.paymentAccount = c.account;
      s.paymentBank = c.bank ?? s.paymentBank;
      message = "예약확인문자 입금 계좌 저장";
      break;
    }
    case "saveSettings": {
      for (const id of c.settings.excluded) findProduct(id);
      s.settings = c.settings;
      invalidate();
      message = "오늘의 메뉴 추천 기준 저장";
      break;
    }
    case "savePlan": {
      if (c.date < day)
        throw new Error("지난 날짜의 생산계획은 새로 저장할 수 없습니다.");
      const old = s.plans.find((p) => p.id === c.id);
      if (old?.status === "completed")
        throw new Error("완료한 생산 기록은 변경할 수 없습니다.");
      if (
        s.plans.some(
          (p) => p.date === c.date && p.status !== "completed" && p.id !== c.id,
        )
      )
        throw new Error("해당 날짜의 진행 중인 계획을 먼저 수정하세요.");
      if (new Set(c.lines.map((l) => l.productId)).size !== c.lines.length)
        throw new Error("같은 메뉴는 한 줄로 합쳐 주세요.");
      for (const l of c.lines) findProduct(l.productId);
      const check = materialUsage(s, c.lines);
      if (c.status === "confirmed" && check.issues.length)
        throw new Error(check.issues.join(", "));
      if (c.status === "confirmed") {
        for (const r of requirements(s, c.date, false)) {
          const pieces = c.lines
            .filter((l) => l.productId === r.product.id)
            .reduce((n, l) => n + l.batches * (r.product.batchYield || 0), 0);
          if (r.carry + pieces < r.pending)
            throw new Error(
              `${r.product.name}: 예약 수량을 충족하도록 생산계획을 조정하세요.`,
            );
        }
      }
      const p = {
        id: c.id,
        date: c.date,
        status: c.status,
        lines: c.lines,
        sourceRevision: s.revision,
      };
      s.plans = old
        ? s.plans.map((x) => (x.id === p.id ? p : x))
        : [...s.plans, p];
      message = "생산계획 저장";
      break;
    }
    case "completePlan": {
      const p = s.plans.find((p) => p.id === c.id);
      if (!p) throw new Error("생산계획이 없습니다.");
      if (p.status === "completed") return input;
      if (p.status !== "confirmed")
        throw new Error("생산계획을 먼저 확정하세요.");
      if (p.date !== day)
        throw new Error("생산 완료는 오늘 계획에만 기록할 수 있습니다.");
      if (p.sourceRevision !== s.revision)
        throw new Error(
          "주문 또는 재고가 변경됐습니다. 계획을 재계산하고 다시 확정하세요.",
        );
      const calc = materialUsage(s, p.lines);
      if (calc.issues.length) throw new Error(calc.issues.join(", "));
      if (
        new Set(c.actual.map((a) => a.productId)).size !== c.actual.length ||
        c.actual.length !== p.lines.length ||
        p.lines.some((l) => !c.actual.some((a) => a.productId === l.productId))
      )
        throw new Error("모든 메뉴의 실제 생산량을 입력하세요.");
      if (
        new Set(c.usage.map((a) => a.materialId)).size !== c.usage.length ||
        Object.keys(calc.usage).length !== c.usage.length ||
        Object.keys(calc.usage).some(
          (id) => !c.usage.some((a) => a.materialId === id),
        )
      )
        throw new Error("모든 재료의 실제 사용량을 입력하세요.");
      for (const u of c.usage) {
        const m = s.materials.find((m) => m.id === u.materialId);
        if (!m || m.stock < u.quantity)
          throw new Error(
            `${m?.name || "재료"} 재고가 부족합니다. 실사 또는 입고를 먼저 기록하세요.`,
          );
        m.stock -= u.quantity;
        s.movements.push({
          id: uid(),
          materialId: m.id,
          delta: -u.quantity,
          reason: "생산 완료",
          actor,
          at: now,
          planId: p.id,
        });
      }
      p.recipeSnapshot = p.lines.map((l) =>
        structuredClone(findProduct(l.productId)),
      );
      for (const l of p.lines) {
        const product = findProduct(l.productId);
        l.actualPieces = c.actual.find(
          (a) => a.productId === l.productId,
        )!.pieces;
        s.lots.push({
          id: uid(),
          productId: l.productId,
          date: p.date,
          expires: addDays(p.date, product.shelfDays - 1),
          remaining: l.actualPieces,
          produced: l.actualPieces,
          planId: p.id,
        });
      }
      // A real pickup may have been recorded before production was entered.
      // Allocate only the unallocated remainder when the output becomes available.
      for (const o of s.orders.filter(
        (o) => o.status === "picked" && o.date === day,
      )) {
        o.pickupAllocations ||= [];
        const totals: Record<string, number> = {};
        for (const line of orderPieces(o))
          totals[line.productId] = (totals[line.productId] || 0) + line.pieces;
        for (const [productId, pieces] of Object.entries(totals)) {
          const allocated = o.pickupAllocations
            .filter(
              (a) =>
                s.lots.find((l) => l.id === a.lotId)?.productId === productId,
            )
            .reduce((n, a) => n + a.pieces, 0);
          let left = Math.max(0, pieces - allocated);
          for (const lot of s.lots
            .filter(
              (l) =>
                l.productId === productId && l.date <= day && l.expires >= day,
            )
            .sort((a, b) => a.expires.localeCompare(b.expires))) {
            const qty = Math.min(left, lot.remaining);
            if (qty) {
              lot.remaining -= qty;
              left -= qty;
              o.pickupAllocations.push({ lotId: lot.id, pieces: qty });
            }
            if (!left) break;
          }
        }
      }
      p.status = "completed";
      p.completedAt = now;
      p.completedBy = actor;
      invalidate();
      message = "생산 완료 및 재료 차감";
      break;
    }
    case "closeLot": {
      const lot = s.lots.find((l) => l.id === c.lotId);
      if (!lot) throw new Error("생산 기록이 없습니다.");
      if (c.date > day || c.date < lot.date)
        throw new Error("마감 날짜를 확인하세요.");
      if (s.closings.some((x) => x.lotId === lot.id && x.date >= c.date))
        throw new Error("이미 마감한 날짜입니다.");
      if (c.remaining + c.waste + c.other > lot.remaining)
        throw new Error("잔량·폐기·기타 출고 합계가 가용 수량을 초과합니다.");
      if (c.date > lot.expires && c.remaining)
        throw new Error("판매 가능 기간이 지난 품목은 폐기로 기록하세요.");
      const previousClose =
        s.closings.filter((x) => x.lotId === lot.id).at(-1)?.at || "";
      const pickedPieces = s.orders
        .filter(
          (o) =>
            o.status === "picked" &&
            o.pickedAt &&
            o.pickedAt > previousClose &&
            o.pickedAt <= now,
        )
        .flatMap((o) => o.pickupAllocations || [])
        .filter((a) => a.lotId === lot.id)
        .reduce((n, a) => n + a.pieces, 0);
      s.closings.push({
        id: uid(),
        date: c.date,
        lotId: lot.id,
        remaining: c.remaining,
        waste: c.waste,
        other: c.other,
        soldEstimate:
          lot.remaining - c.remaining - c.waste - c.other + pickedPieces,
        actor,
        at: now,
      });
      lot.remaining = c.remaining;
      invalidate();
      message = "마감 수량 기록";
      break;
    }
  }
  s.audit.unshift({ at: now, actor, message });
  return s;
}

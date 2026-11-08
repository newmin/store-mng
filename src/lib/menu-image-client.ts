"use client";

import { authFetch, sharedMode } from "./client";
import { uid } from "./dates";
import { isUploadedMenuImage } from "./menu-image";

export function validateMenuImage(file: File) {
  if (
    !file.size ||
    file.size > 5 * 1024 * 1024 ||
    !["image/png", "image/jpeg", "image/webp"].includes(file.type)
  ) {
    throw new Error("PNG·JPG·WebP 사진(최대 5MB)을 선택해 주세요.");
  }
}

export async function uploadMenuImage(file: File): Promise<string> {
  validateMenuImage(file);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("사진을 읽지 못했습니다. 다른 사진을 선택해 주세요.");
  }
  let blob: Blob;
  try {
    const ratio = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("사진을 처리하지 못했습니다.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) =>
          result
            ? resolve(result)
            : reject(new Error("사진을 처리하지 못했습니다.")),
        "image/webp",
        0.82,
      ),
    );
  } finally {
    bitmap.close();
  }

  if (sharedMode) {
    const form = new FormData();
    form.set("file", blob, "menu.webp");
    const result = await authFetch("/api/images", {
      method: "POST",
      body: form,
    });
    if (!isUploadedMenuImage(result.path))
      throw new Error(
        "사진 저장 결과를 확인하지 못했습니다. 다시 시도해 주세요.",
      );
    return result.path;
  }
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("사진을 읽지 못했습니다."));
    reader.readAsDataURL(blob);
  });
  const path = `demo-menu:${uid()}`;
  try {
    localStorage.setItem(`tteokdam-menu-image:${path}`, data);
  } catch {
    throw new Error(
      "사진을 저장할 공간이 부족합니다. 더 작은 사진을 선택해 주세요.",
    );
  }
  return path;
}

export async function resolveMenuImage(path: string): Promise<string> {
  if (!isUploadedMenuImage(path))
    throw new Error("올바른 메뉴 사진이 아닙니다.");
  if (path.startsWith("demo-menu:")) {
    const data = localStorage.getItem(`tteokdam-menu-image:${path}`);
    if (!data || !/^data:image\/(png|jpeg|webp);base64,/.test(data))
      throw new Error("사진을 찾을 수 없습니다.");
    return data;
  }
  const result = await authFetch(
    `/api/images?path=${encodeURIComponent(path)}`,
  );
  return result.url;
}

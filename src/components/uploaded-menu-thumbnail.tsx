"use client";

import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { resolveMenuImage } from "@/lib/menu-image-client";

export function UploadedMenuThumbnail({ path }: { path: string }) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setUrl("");
    setFailed(false);
    resolveMenuImage(path)
      .then((value) => {
        if (alive) setUrl(value);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [path]);
  return (
    <span
      className="menu-thumbnail uploaded-menu-thumbnail"
      aria-hidden="true"
      title={failed ? "사진을 불러오지 못했습니다." : undefined}
    >
      {url && !failed ? (
        <img src={url} alt="" onError={() => setFailed(true)} />
      ) : failed ? (
        <ImageOff size={20} />
      ) : null}
    </span>
  );
}

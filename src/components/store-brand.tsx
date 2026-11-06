import { Instagram, ArrowUpRight } from "lucide-react";
import { brand } from "@/lib/brand";

export function BrandMark() {
  return (
    <span className="brand-mascot" aria-hidden="true">
      <img src={brand.logo} alt="" width={1200} height={1200} />
    </span>
  );
}

export function BrandWelcome() {
  return (
    <section className="brand-welcome" aria-label="말랑콩떡 매장 소개">
      <div className="brand-welcome-art">
        <img
          src={brand.logo}
          alt="말랑콩떡 토끼 로고 · WE LOVE RICE CAKE"
          width={1200}
          height={1200}
        />
      </div>
      <div className="brand-welcome-copy">
        <h2>말랑콩떡 매장 노트</h2>
        <a href={brand.instagram} target="_blank" rel="noopener noreferrer">
          <Instagram size={14} /> @malrang_ktt <ArrowUpRight size={13} />
        </a>
      </div>
    </section>
  );
}

export function StoreInstagramLink() {
  return (
    <section className="panel store-instagram-link">
      <div className="panel-heading">
        <h2>매장 인스타그램</h2>
        <a
          className="text-button"
          href={brand.instagram}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Instagram size={14} /> @malrang_ktt <ArrowUpRight size={13} />
        </a>
      </div>
    </section>
  );
}

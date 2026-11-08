import {
  Instagram,
  ArrowUpRight,
  MessageCircle,
  MessageSquare,
} from "lucide-react";
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
        <nav className="inquiry-shortcuts" aria-label="문의 바로가기">
          <a
            href="https://www.instagram.com/direct/inbox/"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Instagram size={16} aria-hidden="true" /> 인스타
            <ArrowUpRight size={13} aria-hidden="true" />
          </a>
          <a
            href="https://partner.talk.naver.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle size={16} aria-hidden="true" /> 네이버 톡톡
            <ArrowUpRight size={13} aria-hidden="true" />
          </a>
          <a href="sms:">
            <MessageSquare size={16} aria-hidden="true" /> 문자
          </a>
          <a href="kakaotalk://launch">
            <MessageCircle size={16} aria-hidden="true" /> 카톡
          </a>
        </nav>
        <p className="inquiry-shortcuts-note">
          문자 앱에서 작성 화면이 열리면 대화 목록으로 이동해 주세요.
        </p>
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

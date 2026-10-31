import { EyeOff, Search, VenetianMask } from "lucide-react";
import RoleCard from "../../components/RoleCard";
import type { Me, Role } from "../../types/game";

/** Only rendered from the student's own private document. */
export function IdentityBanner({ me }: { me: Me }) {
  if (me.isSwitcher === null) return null;
  return me.isSwitcher ? (
    <div className="identity switcher" data-testid="identity">
      <VenetianMask size={22} aria-hidden />
      <div>
        <strong>당신은 역할 전환자예요</strong>
        <span>내가 고르지 않은 역할을 맡았어요. 이 역할의 입장에서 자연스럽게 말해 정체를 들키지 마세요.</span>
      </div>
    </div>
  ) : (
    <div className="identity regular" data-testid="identity">
      <Search size={22} aria-hidden />
      <div>
        <strong>당신은 일반 참가자예요</strong>
        <span>
          내가 고른 {me.preferenceRank}순위 역할을 맡았어요. 역할의 입장에서 말하면서, 누가 역할 전환자인지 찾아보세요.
        </span>
      </div>
    </div>
  );
}

export default function SecretRole({ me, role }: { me: Me; role: Role }) {
  return (
    <div className="secret-role">
      <p className="privacy-line">
        <EyeOff size={15} aria-hidden /> 이 화면은 나에게만 보여요. 화면을 다른 사람에게 보여 주지 마세요.
      </p>
      <IdentityBanner me={me} />
      <RoleCard role={role} label="나의 역할" />
    </div>
  );
}

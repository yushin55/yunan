import { Target, TriangleAlert, UserRound } from "lucide-react";
import type { Role } from "../types/game";

export default function RoleCard({ role, label = "역할 카드", compact = false }: { role: Role; label?: string; compact?: boolean }) {
  return (
    <article className={`role-card${compact ? " compact" : ""}`} aria-label={`${label}: ${role.name}`}>
      <header>
        <span className="card-kind">
          <UserRound size={14} aria-hidden /> {label}
        </span>
        <h3>{role.name}</h3>
        <p className="role-intro">{role.intro}</p>
      </header>
      <dl>
        <div>
          <dt>
            <Target size={14} aria-hidden /> 목표
          </dt>
          <dd>{role.goal}</dd>
        </div>
        {!compact && (
          <div>
            <dt>
              <TriangleAlert size={14} aria-hidden /> 걱정하는 점
            </dt>
            <dd>
              <ul>
                {role.concerns.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </dd>
          </div>
        )}
      </dl>
    </article>
  );
}

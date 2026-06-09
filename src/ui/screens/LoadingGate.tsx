import { useProgress } from "@react-three/drei";
import { EN } from "../../copy/en";

// Field loading gate (interface guide): never show the gameplay field until
// required board/ship/effect models are loaded. Driven by drei's loader
// progress for the FBX assets.
export function LoadingGate() {
  const { active, progress, errors } = useProgress();
  const failed = errors.length > 0 && !active;
  if (!active && progress >= 100) return null;

  return (
    <div className="loading-gate">
      {failed ? (
        <>
          <p style={{ color: "var(--c-magenta)" }}>{EN.loadFailed}</p>
          <button className="btn btn-primary" onClick={() => location.reload()}>
            {EN.retry}
          </button>
        </>
      ) : (
        <>
          <div className="loader-ring" />
          <div className="tag">{EN.loadingBattlefield}</div>
          <div className="progress">
            <span style={{ width: `${Math.max(6, Math.round(progress))}%` }} />
          </div>
          <div style={{ fontSize: 12, opacity: 0.6 }}>{EN.loadingModels}</div>
        </>
      )}
    </div>
  );
}

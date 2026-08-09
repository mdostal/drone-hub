// Public export surface for <ProcessingStatus> — import from
// "@/components/ProcessingStatus" (or copy this folder into a standalone
// consumer like personal-site — everything it transitively imports is
// scoped to this folder, no app/ or gating deps, no polling/websocket/auth
// logic of any kind — see ProcessingStatus.tsx's header comment).
export { ProcessingStatus, clampProgress } from "./ProcessingStatus";
export type { ProcessingStatusProps, ProcessingStatusValue } from "./ProcessingStatus";
